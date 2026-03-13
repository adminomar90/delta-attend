import { TaskRepository } from '../../infrastructure/db/repositories/TaskRepository.js';
import { ProjectRepository } from '../../infrastructure/db/repositories/ProjectRepository.js';
import { WorkReportRepository } from '../../infrastructure/db/repositories/WorkReportRepository.js';
import { MaterialsRepository } from '../../infrastructure/db/repositories/MaterialsRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { AttendanceModel } from '../../infrastructure/db/models/AttendanceModel.js';
import { resolveManagedUserIds } from '../../shared/accessScope.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import {
  ApprovalOperationType,
  buildApprovalHistoryExportRows,
  buildAttendanceRecord,
  buildMaterialReconciliationRecord,
  buildMaterialRequestRecord,
  buildProjectRecord,
  buildTaskRecord,
  buildWorkReportRecord,
  filterApprovalHistoryRecords,
  findApprovalHistoryRecord,
  isApprovedMaterialRequestRecord,
  isApprovedProjectRecord,
  normalizeApprovalHistoryRecords,
} from '../../application/services/approvalHistoryService.js';
import { buildApprovalHistoryExcelBuffer } from '../../infrastructure/reports/approvalHistoryExcelBuilder.js';
import { buildApprovalHistoryPdfBuffer } from '../../infrastructure/reports/approvalHistoryPdfBuilder.js';

const taskRepository = new TaskRepository();
const projectRepository = new ProjectRepository();
const workReportRepository = new WorkReportRepository();
const materialsRepository = new MaterialsRepository();
const userRepository = new UserRepository();

const applyDateRangeFilter = (filter, field, from, to) => {
  if (!from && !to) {
    return;
  }

  filter[field] = {};
  if (from) {
    filter[field].$gte = new Date(from);
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    filter[field].$lte = end;
  }
};

const buildManagedOrFilter = (managedUserIds = [], fields = []) => ({
  $or: fields.map((field) => ({ [field]: { $in: managedUserIds } })),
});

const loadApprovalHistoryDatasets = async (req) => {
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  const createdFrom = req.query.createdFrom || '';
  const createdTo = req.query.createdTo || '';
  const approvedFrom = req.query.approvedFrom || '';
  const approvedTo = req.query.approvedTo || '';

  const taskFilter = { status: 'APPROVED' };
  const projectFilter = {
    $or: [
      { status: { $in: ['ACTIVE', 'ON_HOLD', 'DONE'] } },
      { approvedAt: { $ne: null } },
    ],
  };
  const workReportFilter = { status: 'APPROVED' };
  const attendanceFilter = { approvalStatus: 'APPROVED' };
  const materialRequestFilter = {
    status: {
      $in: ['APPROVED', 'PREPARING', 'PREPARED', 'DELIVERED', 'PENDING_RECONCILIATION', 'RECONCILED', 'CLOSED'],
    },
  };
  const materialReconciliationFilter = { status: 'APPROVED' };

  applyDateRangeFilter(taskFilter, 'createdAt', createdFrom, createdTo);
  applyDateRangeFilter(taskFilter, 'approvedAt', approvedFrom, approvedTo);
  applyDateRangeFilter(projectFilter, 'createdAt', createdFrom, createdTo);
  applyDateRangeFilter(projectFilter, 'approvedAt', approvedFrom, approvedTo);
  applyDateRangeFilter(workReportFilter, 'createdAt', createdFrom, createdTo);
  applyDateRangeFilter(workReportFilter, 'approvedAt', approvedFrom, approvedTo);
  applyDateRangeFilter(attendanceFilter, 'createdAt', createdFrom, createdTo);
  applyDateRangeFilter(attendanceFilter, 'approvedAt', approvedFrom, approvedTo);
  applyDateRangeFilter(materialRequestFilter, 'createdAt', createdFrom, createdTo);
  applyDateRangeFilter(materialRequestFilter, 'approvalSummary.approvedAt', approvedFrom, approvedTo);
  applyDateRangeFilter(materialReconciliationFilter, 'createdAt', createdFrom, createdTo);
  applyDateRangeFilter(materialReconciliationFilter, 'reviewedAt', approvedFrom, approvedTo);

  if (Array.isArray(managedUserIds)) {
    taskFilter.assignee = { $in: managedUserIds };
    projectFilter.owner = { $in: managedUserIds };
    workReportFilter.user = { $in: managedUserIds };
    attendanceFilter.user = { $in: managedUserIds };
    Object.assign(
      materialRequestFilter,
      buildManagedOrFilter(managedUserIds, ['requestedBy', 'requestedFor', 'assignedPreparer']),
    );
    Object.assign(
      materialReconciliationFilter,
      buildManagedOrFilter(managedUserIds, ['submittedBy', 'reviewedBy']),
    );
  }

  const [tasks, projects, workReports, attendanceRecords, materialRequests, materialReconciliations] = await Promise.all([
    taskRepository.list(taskFilter, { limit: 2000, sort: { approvedAt: -1, createdAt: -1 } }),
    projectRepository.list(projectFilter),
    workReportRepository.list(workReportFilter, { limit: 2000, sort: { approvedAt: -1, createdAt: -1 } }),
    AttendanceModel.find(attendanceFilter)
      .populate('user', 'fullName role department jobTitle employeeCode')
      .populate('approvedBy', 'fullName role employeeCode')
      .sort({ approvedAt: -1, createdAt: -1 })
      .limit(2000),
    materialsRepository.listRequests(materialRequestFilter, { limit: 2000, sort: { 'approvalSummary.approvedAt': -1, createdAt: -1 } }),
    materialsRepository.listReconciliations(materialReconciliationFilter, { limit: 2000, sort: { reviewedAt: -1, createdAt: -1 } }),
  ]);

  return normalizeApprovalHistoryRecords({
    tasks,
    projects: projects.filter(isApprovedProjectRecord),
    workReports,
    attendanceRecords,
    materialRequests: materialRequests.filter(isApprovedMaterialRequestRecord),
    materialReconciliations,
  });
};

const loadFilteredHistory = async (req) => {
  const records = await loadApprovalHistoryDatasets(req);
  return filterApprovalHistoryRecords(records, req.query);
};

export const listApprovalHistory = asyncHandler(async (req, res) => {
  const records = await loadFilteredHistory(req);

  res.json({
    records,
    total: records.length,
  });
});

export const getApprovalHistoryDetail = asyncHandler(async (req, res) => {
  const { operationType, recordId } = req.params;

  if (!operationType || !recordId) {
    throw new AppError('operationType and recordId are required', 400);
  }

  const builderMap = {
    [ApprovalOperationType.TASK]: async () => {
      const doc = await taskRepository.findById(recordId);
      return doc ? buildTaskRecord(doc) : null;
    },
    [ApprovalOperationType.PROJECT]: async () => {
      const doc = await projectRepository.findById(recordId);
      return doc && isApprovedProjectRecord(doc) ? buildProjectRecord(doc) : null;
    },
    [ApprovalOperationType.WORK_REPORT]: async () => {
      const doc = await workReportRepository.findById(recordId);
      return doc ? buildWorkReportRecord(doc) : null;
    },
    [ApprovalOperationType.ATTENDANCE]: async () => {
      const doc = await AttendanceModel.findById(recordId)
        .populate('user', 'fullName role department jobTitle employeeCode')
        .populate('approvedBy', 'fullName role employeeCode');
      return doc ? buildAttendanceRecord(doc) : null;
    },
    [ApprovalOperationType.MATERIAL_REQUEST]: async () => {
      const doc = await materialsRepository.findRequestById(recordId);
      return doc && isApprovedMaterialRequestRecord(doc) ? buildMaterialRequestRecord(doc) : null;
    },
    [ApprovalOperationType.MATERIAL_RECONCILIATION]: async () => {
      const doc = await materialsRepository.findReconciliationById(recordId);
      return doc ? buildMaterialReconciliationRecord(doc) : null;
    },
  };

  const builder = builderMap[operationType];
  if (!builder) {
    throw new AppError('Approval record not found', 404);
  }

  const record = await builder();
  if (!record) {
    throw new AppError('Approval record not found', 404);
  }

  res.json({ record });
});

export const exportApprovalHistoryExcel = asyncHandler(async (req, res) => {
  const records = await loadFilteredHistory(req);
  const rows = buildApprovalHistoryExportRows(records);
  const buffer = await buildApprovalHistoryExcelBuffer(rows, { generatedAt: new Date() });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="approval-history-${Date.now()}.xlsx"`);
  res.send(Buffer.from(buffer));
});

export const exportApprovalHistoryPdf = asyncHandler(async (req, res) => {
  const records = await loadFilteredHistory(req);
  const rows = buildApprovalHistoryExportRows(records);
  const buffer = await buildApprovalHistoryPdfBuffer(rows, { generatedAt: new Date() });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="approval-history-${Date.now()}.pdf"`);
  res.send(buffer);
});
