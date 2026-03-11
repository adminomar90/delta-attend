import { env } from '../../config/env.js';
import { buildWhatsAppSendUrl } from '../../shared/attendanceUtils.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { buildMaterialsExcelBuffer } from '../../infrastructure/reports/materialsExcelReportBuilder.js';
import { buildMaterialsPdfBuffer } from '../../infrastructure/reports/materialsPdfReportBuilder.js';
import {
  materialsRepository,
  toUpper,
  roundQty,
  sumBy,
  resolveManagedScope,
  resolveRecipientPhone,
  sendWhatsappOps,
  defaultReportPeriod,
} from './materialsCommon.js';

const mapRequestRow = (request) => ({
  requestNo: request.requestNo,
  projectName: request.project?.name || request.projectName || '-',
  clientName: request.clientName || '-',
  requestedBy: request.requestedBy?.fullName || '-',
  priority: request.priority,
  status: request.status,
  requestDate: request.requestDate ? new Date(request.requestDate).toLocaleDateString('ar-IQ') : '-',
  itemsCount: (request.items || []).length,
});

const mapDispatchRow = (dispatch) => ({
  dispatchNo: dispatch.dispatchNo,
  requestNo: dispatch.request?.requestNo || '-',
  projectName: dispatch.project?.name || '-',
  recipient: dispatch.recipient?.fullName || '-',
  deliveredBy: dispatch.deliveredBy?.fullName || '-',
  deliveredQty: roundQty(sumBy(dispatch.items || [], (item) => item.deliveredQty)),
  status: dispatch.status,
  deliveredAt: dispatch.deliveredAt ? new Date(dispatch.deliveredAt).toLocaleDateString('ar-IQ') : '-',
});

const mapCustodyRow = (custody) => {
  const openedAt = custody.openedAt || custody.createdAt || new Date();
  const openDays = Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / (24 * 60 * 60 * 1000)));
  return {
    custodyNo: custody.custodyNo,
    holder: custody.holder?.fullName || '-',
    projectName: custody.project?.name || '-',
    receivedQty: roundQty(sumBy(custody.items || [], (item) => item.receivedQty)),
    consumedQty: roundQty(sumBy(custody.items || [], (item) => item.consumedQty)),
    remainingQty: roundQty(sumBy(custody.items || [], (item) => item.remainingQty)),
    status: custody.status,
    openDays,
  };
};

const mapReconciliationRow = (reconciliation) => ({
  reconcileNo: reconciliation.reconcileNo,
  custodyNo: reconciliation.custody?.custodyNo || '-',
  projectName: reconciliation.project?.name || '-',
  holder: reconciliation.custody?.holder?.fullName || '-',
  consumedQty: roundQty(sumBy(reconciliation.items || [], (item) => item.consumedQty)),
  toReturnQty: roundQty(sumBy(reconciliation.items || [], (item) => item.toReturnQty)),
  damagedQty: roundQty(sumBy(reconciliation.items || [], (item) => item.damagedQty)),
  lostQty: roundQty(sumBy(reconciliation.items || [], (item) => item.lostQty)),
  status: reconciliation.status,
});

const mapMovementRow = (txn) => ({
  date: txn.performedAt ? new Date(txn.performedAt).toLocaleDateString('ar-IQ') : '-',
  materialName: txn.material?.name || '-',
  warehouse: txn.warehouse?.name || '-',
  transactionType: txn.transactionType,
  quantity: roundQty(txn.quantity),
  referenceId: txn.referenceId || '-',
  projectName: txn.project?.name || '-',
  performedBy: txn.performedBy?.fullName || '-',
});

const buildProjectSummaryRows = ({ requests = [], custodies = [] }) => {
  const summaryByProject = new Map();

  requests.forEach((request) => {
    const projectId = String(request.project?._id || request.project || 'unknown');
    if (!summaryByProject.has(projectId)) {
      summaryByProject.set(projectId, {
        projectId,
        projectName: request.project?.name || request.projectName || '-',
        requestsCount: 0,
        requestedQty: 0,
        approvedQty: 0,
        preparedQty: 0,
      });
    }

    const row = summaryByProject.get(projectId);
    row.requestsCount += 1;
    row.requestedQty += sumBy(request.items || [], (item) => item.requestedQty);
    row.approvedQty += sumBy(request.items || [], (item) => item.approvedQty);
    row.preparedQty += sumBy(request.items || [], (item) => item.preparedQty);
  });

  custodies.forEach((custody) => {
    const projectId = String(custody.project?._id || custody.project || 'unknown');
    if (!summaryByProject.has(projectId)) {
      summaryByProject.set(projectId, {
        projectId,
        projectName: custody.project?.name || '-',
        requestsCount: 0,
        requestedQty: 0,
        approvedQty: 0,
        preparedQty: 0,
      });
    }

    const row = summaryByProject.get(projectId);
    row.consumedQty = (row.consumedQty || 0) + sumBy(custody.items || [], (item) => item.consumedQty);
    row.returnedQty = (row.returnedQty || 0) + sumBy(custody.items || [], (item) => item.returnedQty);
    row.remainingQty = (row.remainingQty || 0) + sumBy(custody.items || [], (item) => item.remainingQty);
    row.damagedQty = (row.damagedQty || 0) + sumBy(custody.items || [], (item) => item.damagedQty);
    row.lostQty = (row.lostQty || 0) + sumBy(custody.items || [], (item) => item.lostQty);
  });

  return [...summaryByProject.values()].map((row) => ({
    projectName: row.projectName,
    requestsCount: Number(row.requestsCount || 0),
    requestedQty: roundQty(row.requestedQty || 0),
    preparedQty: roundQty(row.preparedQty || 0),
    consumedQty: roundQty(row.consumedQty || 0),
    returnedQty: roundQty(row.returnedQty || 0),
    remainingQty: roundQty(row.remainingQty || 0),
    estimatedCost: roundQty(row.preparedQty || 0),
    actualCost: roundQty(row.consumedQty || 0),
  }));
};

const applyRequestScope = (filter, managedUserIds, userId) => {
  if (!Array.isArray(managedUserIds)) {
    return;
  }
  const actorId = String(userId);
  const ids = [...new Set([...managedUserIds, actorId])];
  filter.$or = [
    { requestedBy: { $in: ids } },
    { requestedFor: { $in: ids } },
  ];
};

const loadMaterialsReportData = async (req) => {
  const managedUserIds = await resolveManagedScope(req);
  const { from, to } = defaultReportPeriod(req.query);

  const requestFilter = {
    requestDate: {
      $gte: from.toDate(),
      $lte: to.toDate(),
    },
  };

  if (req.query.status) {
    requestFilter.status = toUpper(req.query.status);
  }
  if (req.query.projectId) {
    requestFilter.project = req.query.projectId;
  }
  if (req.query.requestedBy) {
    requestFilter.requestedBy = req.query.requestedBy;
  }

  applyRequestScope(requestFilter, managedUserIds, req.user.id);

  const requests = await materialsRepository.listRequests(requestFilter, { limit: 3000 });
  const requestIds = requests.map((request) => request._id);

  const dispatches = await materialsRepository.listDispatches(
    requestIds.length ? { request: { $in: requestIds } } : { _id: { $in: [] } },
    { limit: 3000 },
  );

  const custodies = await materialsRepository.listCustodies(
    requestIds.length ? { request: { $in: requestIds } } : { _id: { $in: [] } },
    { limit: 3000 },
  );

  const reconciliations = await materialsRepository.listReconciliations(
    requestIds.length ? { request: { $in: requestIds } } : { _id: { $in: [] } },
    { limit: 3000 },
  );

  const movementFilter = {
    performedAt: {
      $gte: from.toDate(),
      $lte: to.toDate(),
    },
  };
  if (req.query.materialId) {
    movementFilter.material = req.query.materialId;
  }
  if (req.query.projectId) {
    movementFilter.project = req.query.projectId;
  }
  if (requestIds.length) {
    movementFilter.request = { $in: requestIds };
  } else if (!req.query.materialId && !req.query.projectId) {
    movementFilter._id = { $in: [] };
  }

  const movement = await materialsRepository.listStockTransactions(movementFilter, { limit: 5000 });

  const requestsRows = requests.map(mapRequestRow);
  const dispatchRows = dispatches.map(mapDispatchRow);
  const openCustodyRows = custodies
    .filter((item) => !['CLOSED'].includes(item.status))
    .map(mapCustodyRow);
  const reconciliationRows = reconciliations.map(mapReconciliationRow);
  const movementRows = movement.map(mapMovementRow);
  const projectSummaryRows = buildProjectSummaryRows({ requests, custodies });

  return {
    period: {
      from: from.format('YYYY-MM-DD'),
      to: to.format('YYYY-MM-DD'),
    },
    requestsRows,
    dispatchRows,
    openCustodyRows,
    reconciliationRows,
    movementRows,
    projectSummaryRows,
  };
};

export const materialsReportsSummary = asyncHandler(async (req, res) => {
  const reportData = await loadMaterialsReportData(req);

  res.json({
    period: reportData.period,
    totals: {
      requests: reportData.requestsRows.length,
      dispatches: reportData.dispatchRows.length,
      openCustodies: reportData.openCustodyRows.length,
      reconciliations: reportData.reconciliationRows.length,
      movementRows: reportData.movementRows.length,
      projects: reportData.projectSummaryRows.length,
    },
    reports: {
      requests: reportData.requestsRows,
      dispatches: reportData.dispatchRows,
      openCustodies: reportData.openCustodyRows,
      reconciliations: reportData.reconciliationRows,
      movement: reportData.movementRows,
      projectSummary: reportData.projectSummaryRows,
    },
  });
});

export const exportMaterialsExcel = asyncHandler(async (req, res) => {
  const reportData = await loadMaterialsReportData(req);
  const buffer = await buildMaterialsExcelBuffer({
    requests: reportData.requestsRows,
    dispatches: reportData.dispatchRows,
    openCustodies: reportData.openCustodyRows,
    reconciliations: reportData.reconciliationRows,
    movement: reportData.movementRows,
    projectSummary: reportData.projectSummaryRows,
  });

  const filename = `materials-report-${reportData.period.from}-to-${reportData.period.to}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`);
  res.send(Buffer.from(buffer));
});

export const exportMaterialsPdf = asyncHandler(async (req, res) => {
  const reportData = await loadMaterialsReportData(req);
  const buffer = await buildMaterialsPdfBuffer({
    generatedAt: new Date(),
    requests: reportData.requestsRows,
    dispatches: reportData.dispatchRows,
    openCustodies: reportData.openCustodyRows,
    reconciliations: reportData.reconciliationRows,
    movement: reportData.movementRows,
    projectSummary: reportData.projectSummaryRows,
  });

  const filename = `materials-report-${reportData.period.from}-to-${reportData.period.to}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`);
  res.send(buffer);
});

export const materialsReportWhatsappLink = asyncHandler(async (req, res) => {
  const reportData = await loadMaterialsReportData(req);

  const message = [
    'تقرير إدارة المواد - Delta Plus',
    `الفترة: ${reportData.period.from} إلى ${reportData.period.to}`,
    `عدد الطلبات: ${reportData.requestsRows.length}`,
    `عدد التسليمات: ${reportData.dispatchRows.length}`,
    `الذمم المفتوحة: ${reportData.openCustodyRows.length}`,
    `عدد التصفيات: ${reportData.reconciliationRows.length}`,
    `حركات المادة: ${reportData.movementRows.length}`,
    `المشاريع المشمولة: ${reportData.projectSummaryRows.length}`,
    `رابط النظام: ${env.frontendOrigin[0].replace(/\/$/, '')}/materials`,
  ].join('\n');

  const recipientPhone = await resolveRecipientPhone({
    userId: req.user.id,
    fallback: env.attendanceAdminWhatsapp,
  });

  const directUrl = buildWhatsAppSendUrl(recipientPhone, message);
  const whatsapp = await sendWhatsappOps({ to: recipientPhone, message });

  res.json({
    whatsapp: {
      recipient: recipientPhone,
      url: whatsapp.url || directUrl,
      delivery: whatsapp.delivery,
      mode: whatsapp.delivery?.sent ? 'AUTO' : 'MANUAL_LINK',
    },
  });
});

export const materialReportByProject = asyncHandler(async (req, res) => {
  if (!req.query.projectId) {
    throw new AppError('projectId is required', 400);
  }

  req.query = {
    ...req.query,
    projectId: req.query.projectId,
  };

  const reportData = await loadMaterialsReportData(req);
  res.json({
    period: reportData.period,
    projectId: req.query.projectId,
    requests: reportData.requestsRows,
    dispatches: reportData.dispatchRows,
    openCustodies: reportData.openCustodyRows,
    reconciliations: reportData.reconciliationRows,
    movement: reportData.movementRows,
    summary: reportData.projectSummaryRows,
  });
});
