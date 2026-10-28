import { submitInventoryReconciliation, reviewInventoryReconciliation, receiveInventoryReturns, closeInventoryCustody } from '../../application/services/inventoryWorkflowService.js';
import { sendWorkflowResult } from './inventoryWorkflowResponse.js';
import { env } from '../../config/env.js';
import mongoose from 'mongoose';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { previewTechnicianCustodyReset, resetTechnicianCustodies, UNASSIGNED_TECHNICIAN_ID } from '../../application/services/technicianCustodyResetService.js';
import { buildTechnicianCustodyPdfBuffer } from '../../infrastructure/reports/technicianCustodyPdfBuilder.js';
import { sequenceService } from '../../application/services/sequenceService.js';
import { auditService } from '../../application/services/auditService.js';
import {
  deriveCustodyStatus,
  normalizeReconciliationQuantities,
} from '../../application/services/materialReconciliationService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { buildWhatsAppSendUrl } from '../../shared/attendanceUtils.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { Permission } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';
import {
  materialsRepository,
  toCleanString,
  toUpper,
  toNumber,
  roundQty,
  toPositiveQty,
  parseArrayPayload,
  assertCustodyReadable,
  resolveManagedScope,
  resolveRecipientPhone,
  sendWhatsappOps,
  buildCustodyWhatsappMessage,
  buildReconciliationWhatsappMessage,
  adjustOnHandStock,
  ensureWarehouseOptional,
  awardCustodyPoints,
  appDetailsUrl,
} from './materialsCommon.js';

const resetUserRepository = new UserRepository();

export const exportTechnicianCustodyPdf = asyncHandler(async (req, res) => {
  const holderId = String(req.query.holderId || '');
  const includeClosed = req.query.includeClosed === 'true';
  let custodies;
  if (req.params.id) {
    const custody = await materialsRepository.findCustodyById(req.params.id);
    if (!custody) throw new AppError('الذمة غير موجودة', 404);
    custodies = [custody];
  } else {
    if (holderId !== 'unassigned' && !mongoose.isValidObjectId(holderId)) throw new AppError('يرجى اختيار الفني', 400);
    const filter = { holder: holderId === 'unassigned' ? null : holderId };
    if (!includeClosed) filter.status = { $in: ['OPEN', 'PENDING_RECONCILIATION', 'PARTIALLY_RECONCILED', 'OVERDUE'] };
    custodies = await materialsRepository.listCustodies(filter);
    if (!custodies.length) throw new AppError('لا توجد ذمم ضمن نطاق الكشف المحدد', 404);
  }
  for (const custody of custodies) await assertCustodyReadable(req, custody);
  const user = custodies[0].holder;
  const holder = { fullName: user?.fullName || 'ذمم بدون فني', employeeCode: user?.employeeCode || '', phone: user?.phone || '' };
  const buffer = await buildTechnicianCustodyPdfBuffer({ holder, custodies, includeClosed, single: !!req.params.id });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="custody-statement-${req.params.id || holderId}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
});
const custodyResetOptions = (req, technicianId) => {
  if (req.user?.role !== 'GENERAL_MANAGER') throw new AppError('تهيئة ذمم الفنيين متاحة للمدير العام حصراً', 403);
  if (technicianId !== UNASSIGNED_TECHNICIAN_ID && !mongoose.isValidObjectId(technicianId)) throw new AppError('يرجى اختيار الفني', 400);
  return { user: req.user, technicianId, repository: materialsRepository, findUser: (id) => resetUserRepository.findById(id) };
};

export const previewCustodyReset = asyncHandler(async (req, res) => {
  res.json(await previewTechnicianCustodyReset(custodyResetOptions(req, req.query.technicianId)));
});

export const resetCustodiesForTechnician = asyncHandler(async (req, res) => {
  const result = await resetTechnicianCustodies({
    ...custodyResetOptions(req, req.body.technicianId),
    confirmationName: req.body.confirmationName, previewToken: req.body.previewToken,
  });
  await auditService.log({
    actorId: req.user.id, action: 'TECHNICIAN_OPEN_CUSTODIES_RESET', entityType: 'USER', entityId: result.technician.id,
    before: { technician: result.technician, custodies: result.custodies },
    after: { deletedCustodiesCount: result.deletedCustodiesCount, deletedReconciliationsCount: result.deletedReconciliationsCount, deletedReturnReceiptsCount: result.deletedReturnReceiptsCount }, req,
  });
  res.json(result);
});

export const listCustodies = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.status) {
    filter.status = toUpper(req.query.status);
  }
  if (req.query.projectId) {
    filter.project = req.query.projectId;
  }
  if (req.query.holderId) {
    filter.holder = req.query.holderId;
  }

  if (String(req.query.mine || '').toLowerCase() === 'true') {
    filter.holder = req.user.id;
  } else if (
    hasPermission(req.user, Permission.MANAGE_MATERIAL_INVENTORY)
    || hasPermission(req.user, Permission.RECONCILE_OTHERS_MATERIAL_CUSTODY)
  ) {
    /* explicitly authorized warehouse staff can see all custodies */
  } else {
    const managedUserIds = await resolveManagedScope(req);
    if (Array.isArray(managedUserIds)) {
      filter.holder = { $in: managedUserIds };
    }
  }

  const custodies = await materialsRepository.listCustodies(filter, { limit: 500 });
  res.json({ custodies });
});

export const getCustody = asyncHandler(async (req, res) => {
  const custody = await materialsRepository.findCustodyById(req.params.id);
  if (!custody) {
    throw new AppError('Custody not found', 404);
  }

  await assertCustodyReadable(req, custody);
  res.json({ custody });
});

export const custodyWhatsappLink = asyncHandler(async (req, res) => {
  const custody = await materialsRepository.findCustodyById(req.params.id);
  if (!custody) {
    throw new AppError('Custody not found', 404);
  }

  await assertCustodyReadable(req, custody);

  const recipientPhone = await resolveRecipientPhone({
    userId: custody.holder?._id || custody.holder,
    fallback: env.attendanceAdminWhatsapp,
  });

  const detailsUrl = appDetailsUrl(`/materials?custodyId=${custody._id}`);
  const message = buildCustodyWhatsappMessage({ custody, detailsUrl });
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

export const submitCustodyReconciliation = asyncHandler(async (req, res) => {
  return sendWorkflowResult(req, res, 'SUBMITCUSTODYRECONCILIATION', await submitInventoryReconciliation(req.params.id, req.user, req.body));
});

export const listReconciliations = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.status) {
    filter.status = toUpper(req.query.status);
  }
  if (req.query.projectId) {
    filter.project = req.query.projectId;
  }
  if (req.query.requestId) {
    filter.request = req.query.requestId;
  }

  if (String(req.query.mine || '').toLowerCase() === 'true') {
    filter.submittedBy = req.user.id;
  } else if (hasPermission(req.user, Permission.PREPARE_MATERIAL_REQUESTS)) {
    /* preparers can see all reconciliations */
  } else {
    const managedUserIds = await resolveManagedScope(req);
    if (Array.isArray(managedUserIds)) {
      filter.$or = [
        { submittedBy: { $in: managedUserIds } },
        { reviewedBy: { $in: managedUserIds } },
      ];
    }
  }

  const reconciliations = await materialsRepository.listReconciliations(filter, { limit: 500 });
  res.json({ reconciliations });
});

export const reviewReconciliation = asyncHandler(async (req, res) => {
  return sendWorkflowResult(req, res, 'REVIEWRECONCILIATION', await reviewInventoryReconciliation(req.params.id, req.user, req.body));
});

export const reconciliationWhatsappLink = asyncHandler(async (req, res) => {
  const reconciliation = await materialsRepository.findReconciliationById(req.params.id);
  if (!reconciliation) {
    throw new AppError('Reconciliation not found', 404);
  }

  const custody = await materialsRepository.findCustodyById(reconciliation.custody?._id || reconciliation.custody);
  if (!custody) {
    throw new AppError('Linked custody not found', 404);
  }

  await assertCustodyReadable(req, custody);

  const recipientPhone = await resolveRecipientPhone({
    userId: custody.holder?._id || custody.holder,
    fallback: env.attendanceAdminWhatsapp,
  });

  const detailsUrl = appDetailsUrl(`/materials?reconciliationId=${reconciliation._id}`);
  const message = buildReconciliationWhatsappMessage({ reconciliation, detailsUrl });
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

export const receiveReturnedMaterials = asyncHandler(async (req, res) => {
  return sendWorkflowResult(req, res, 'RECEIVERETURNEDMATERIALS', await receiveInventoryReturns(req.params.id, req.user, req.body));
});

export const closeCustody = asyncHandler(async (req, res) => {
  return sendWorkflowResult(req, res, 'CLOSECUSTODY', await closeInventoryCustody(req.params.id, req.user, req.body));
});

export const listReconciliationsForApprovals = asyncHandler(async (req, res) => {
  const managedUserIds = await resolveManagedScope(req);
  const filter = {
    status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] },
  };

  if (Array.isArray(managedUserIds)) {
    filter.$or = [
      { submittedBy: { $in: managedUserIds } },
      { reviewedBy: { $in: managedUserIds } },
    ];
  }

  const reconciliations = await materialsRepository.listReconciliations(filter, { limit: 200 });
  res.json({ reconciliations });
});
