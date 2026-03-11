import { env } from '../../config/env.js';
import { sequenceService } from '../../application/services/sequenceService.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { buildWhatsAppSendUrl } from '../../shared/attendanceUtils.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
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
  isWithinScope,
  resolveRecipientPhone,
  sendWhatsappOps,
  buildCustodyWhatsappMessage,
  buildReconciliationWhatsappMessage,
  adjustOnHandStock,
  ensureWarehouseOptional,
  awardCustodyPoints,
  appDetailsUrl,
} from './materialsCommon.js';

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

  const managedUserIds = await resolveManagedScope(req);

  if (String(req.query.mine || '').toLowerCase() === 'true') {
    filter.holder = req.user.id;
  } else if (Array.isArray(managedUserIds)) {
    filter.holder = { $in: managedUserIds };
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
  const custody = await materialsRepository.findCustodyById(req.params.id);
  if (!custody) {
    throw new AppError('Custody not found', 404);
  }

  await assertCustodyReadable(req, custody);

  const holderId = String(custody.holder?._id || custody.holder || '');
  const actorId = String(req.user.id);
  const managedUserIds = await resolveManagedScope(req);

  if (holderId !== actorId && !isWithinScope(managedUserIds, holderId)) {
    throw new AppError('You cannot submit reconciliation for this custody', 403);
  }

  if (['CLOSED'].includes(custody.status)) {
    throw new AppError('Cannot reconcile a closed custody', 409);
  }

  const request = await materialsRepository.findRequestById(custody.request?._id || custody.request);
  if (!request) {
    throw new AppError('Linked material request not found', 404);
  }

  const itemsPayload = parseArrayPayload(req.body.items, 'items');
  if (!itemsPayload.length) {
    throw new AppError('At least one reconciliation item is required', 400);
  }

  const inputByMaterial = new Map(
    itemsPayload.map((item) => [
      String(item.materialId || item.material || ''),
      {
        consumedQty: Math.max(0, roundQty(item.consumedQty)),
        remainingQty: Math.max(0, roundQty(item.remainingQty)),
        damagedQty: Math.max(0, roundQty(item.damagedQty)),
        lostQty: Math.max(0, roundQty(item.lostQty)),
        toReturnQty: Math.max(0, roundQty(item.toReturnQty)),
        notes: toCleanString(item.notes),
      },
    ]),
  );

  const nextCustodyItems = [];
  const reconciliationItems = [];

  for (const line of custody.items || []) {
    const materialId = String(line.material?._id || line.material);
    const input = inputByMaterial.get(materialId);
    if (!input) {
      nextCustodyItems.push(line.toObject());
      continue;
    }

    const receivedQty = roundQty(line.receivedQty || 0);
    const consumedQty = Math.min(receivedQty, input.consumedQty);
    const damagedQty = Math.min(receivedQty, input.damagedQty);
    const lostQty = Math.min(receivedQty, input.lostQty);

    const maxRemaining = roundQty(Math.max(0, receivedQty - consumedQty - damagedQty - lostQty));
    const remainingQty = Math.min(maxRemaining, input.remainingQty || maxRemaining);
    const toReturnQty = Math.min(remainingQty, input.toReturnQty || remainingQty);

    const lineStatus = toReturnQty > roundQty(line.returnedQty || 0)
      ? 'PARTIAL'
      : 'RECONCILED';

    nextCustodyItems.push({
      ...line.toObject(),
      consumedQty,
      remainingQty,
      damagedQty,
      lostQty,
      lineStatus,
      notes: input.notes || line.notes,
    });

    reconciliationItems.push({
      custodyItem: line._id,
      material: line.material?._id || line.material,
      materialName: line.materialName || '',
      unit: line.unit || '',
      receivedQty,
      consumedQty,
      remainingQty,
      damagedQty,
      lostQty,
      toReturnQty,
      returnedQtyConfirmed: roundQty(line.returnedQty || 0),
      notes: input.notes,
    });
  }

  if (!reconciliationItems.length) {
    throw new AppError('No valid reconciliation lines were provided', 400);
  }

  const reconcileNo = await sequenceService.next('MATERIAL_RECONCILIATION', { prefix: 'RC', digits: 5 });

  const reconciliation = await materialsRepository.createReconciliation({
    reconcileNo,
    custody: custody._id,
    request: request._id,
    project: custody.project?._id || custody.project,
    submittedBy: req.user.id,
    reviewedBy: null,
    submittedAt: new Date(),
    status: 'SUBMITTED',
    notes: toCleanString(req.body.notes),
    reviewNotes: '',
    pointsAwarded: 0,
    items: reconciliationItems,
  });

  const pendingReturn = reconciliationItems.some(
    (line) => roundQty(line.toReturnQty) > roundQty(line.returnedQtyConfirmed || 0),
  );

  const updatedCustody = await materialsRepository.updateCustodyById(custody._id, {
    items: nextCustodyItems,
    status: pendingReturn ? 'PENDING_RECONCILIATION' : 'FULLY_RECONCILED',
    isOverdue: false,
  });

  await materialsRepository.updateRequestById(request._id, {
    reconciliationRef: reconciliation._id,
    status: 'PENDING_RECONCILIATION',
  });

  const holderUserId = custody.holder?._id || custody.holder;
  await notificationService.notifySystem(
    holderUserId,
    'إرسال تصفية ذمة المواد',
    `تم إرسال تصفية الذمة رقم ${reconcileNo} بانتظار المراجعة.`,
    {
      custodyId: String(custody._id),
      reconciliationId: String(reconciliation._id),
      requestId: String(request._id),
    },
  );

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_CUSTODY_RECONCILIATION_SUBMITTED',
    entityType: 'MATERIAL_CUSTODY',
    entityId: custody._id,
    after: {
      custodyNo: custody.custodyNo,
      reconcileNo,
      lines: reconciliationItems.length,
      pendingReturn,
      status: updatedCustody.status,
    },
    req,
  });

  res.status(201).json({ reconciliation, custody: updatedCustody });
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

  const managedUserIds = await resolveManagedScope(req);
  if (Array.isArray(managedUserIds)) {
    filter.$or = [
      { submittedBy: { $in: managedUserIds } },
      { reviewedBy: { $in: managedUserIds } },
    ];
  }

  if (String(req.query.mine || '').toLowerCase() === 'true') {
    filter.submittedBy = req.user.id;
    delete filter.$or;
  }

  const reconciliations = await materialsRepository.listReconciliations(filter, { limit: 500 });
  res.json({ reconciliations });
});

export const reviewReconciliation = asyncHandler(async (req, res) => {
  const reconciliation = await materialsRepository.findReconciliationById(req.params.id);
  if (!reconciliation) {
    throw new AppError('Reconciliation not found', 404);
  }

  const custody = await materialsRepository.findCustodyById(reconciliation.custody?._id || reconciliation.custody);
  if (!custody) {
    throw new AppError('Linked custody not found', 404);
  }

  await assertCustodyReadable(req, custody);

  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(reconciliation.status)) {
    throw new AppError('This reconciliation is already reviewed', 409);
  }

  const action = toUpper(req.body.action || 'APPROVE');
  if (!['APPROVE', 'REJECT'].includes(action)) {
    throw new AppError('action must be APPROVE or REJECT', 400);
  }

  const reviewNotes = toCleanString(req.body.reviewNotes || req.body.notes);

  if (action === 'REJECT') {
    const rejected = await materialsRepository.updateReconciliationById(reconciliation._id, {
      status: 'REJECTED',
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
      reviewNotes,
      pointsAwarded: 0,
    });

    await notificationService.notifySystem(
      reconciliation.submittedBy?._id || reconciliation.submittedBy,
      'رفض تصفية ذمة المواد',
      `تم رفض التصفية رقم ${reconciliation.reconcileNo}.`,
      {
        reconciliationId: String(reconciliation._id),
        custodyId: String(custody._id),
      },
    );

    await auditService.log({
      actorId: req.user.id,
      action: 'MATERIAL_RECONCILIATION_REJECTED',
      entityType: 'MATERIAL_RECONCILIATION',
      entityId: reconciliation._id,
      after: {
        reconcileNo: reconciliation.reconcileNo,
        status: rejected.status,
      },
      req,
    });

    res.json({ reconciliation: rejected });
    return;
  }

  const points = Math.round(toNumber(req.body.points, 0));
  if (points < 0 || points > 1000) {
    throw new AppError('points must be between 0 and 1000', 400);
  }

  const approved = await materialsRepository.updateReconciliationById(reconciliation._id, {
    status: 'APPROVED',
    reviewedBy: req.user.id,
    reviewedAt: new Date(),
    reviewNotes,
    pointsAwarded: points,
  });

  const nextCustodyItems = (custody.items || []).map((line) => {
    const materialId = String(line.material?._id || line.material);
    const reconLine = (approved.items || []).find(
      (item) => String(item.material?._id || item.material) === materialId,
    );

    if (!reconLine) {
      return line.toObject();
    }

    const returnedQty = roundQty(line.returnedQty || 0);
    const toReturnQty = roundQty(reconLine.toReturnQty || 0);
    const reconciled = returnedQty >= toReturnQty;

    return {
      ...line.toObject(),
      consumedQty: roundQty(reconLine.consumedQty || 0),
      remainingQty: roundQty(reconLine.remainingQty || 0),
      damagedQty: roundQty(reconLine.damagedQty || 0),
      lostQty: roundQty(reconLine.lostQty || 0),
      lineStatus: reconciled ? 'RECONCILED' : 'PARTIAL',
      notes: reconLine.notes || line.notes,
    };
  });

  const pendingReturn = (approved.items || []).some((line) => {
    const returnedQty = roundQty(line.returnedQtyConfirmed || 0);
    return roundQty(line.toReturnQty || 0) > returnedQty;
  });

  const nextCustodyStatus = pendingReturn ? 'PARTIALLY_RECONCILED' : 'FULLY_RECONCILED';
  const updatedCustody = await materialsRepository.updateCustodyById(custody._id, {
    items: nextCustodyItems,
    status: nextCustodyStatus,
    isOverdue: false,
  });

  const request = await materialsRepository.findRequestById(approved.request?._id || approved.request);
  if (!request) {
    throw new AppError('Linked request not found', 404);
  }

  await materialsRepository.updateRequestById(request._id, {
    status: pendingReturn ? 'PENDING_RECONCILIATION' : 'RECONCILED',
    reconciliationRef: approved._id,
  });

  const holderId = custody.holder?._id || custody.holder;
  await awardCustodyPoints({
    holderId,
    points,
    reason: `اعتماد تصفية ذمة مواد ${approved.reconcileNo}`,
    approverId: req.user.id,
  });

  if (points > 0) {
    await notificationService.notifySystem(
      holderId,
      'اعتماد تصفية ذمة المواد',
      `تم اعتماد التصفية رقم ${approved.reconcileNo} وإضافة ${points} نقطة.`,
      {
        reconciliationId: String(approved._id),
        points,
      },
    );
  }

  const recipientPhone = await resolveRecipientPhone({
    userId: holderId,
    fallback: env.attendanceAdminWhatsapp,
  });

  const detailsUrl = appDetailsUrl(`/materials?reconciliationId=${approved._id}`);
  const whatsappMessage = buildReconciliationWhatsappMessage({
    reconciliation: approved,
    detailsUrl,
  });
  const whatsapp = await sendWhatsappOps({ to: recipientPhone, message: whatsappMessage });

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_RECONCILIATION_APPROVED',
    entityType: 'MATERIAL_RECONCILIATION',
    entityId: approved._id,
    after: {
      reconcileNo: approved.reconcileNo,
      status: approved.status,
      points,
      custodyStatus: updatedCustody.status,
      pendingReturn,
      whatsappDelivery: whatsapp.delivery,
    },
    req,
  });

  res.json({ reconciliation: approved, custody: updatedCustody, grantedPoints: points, whatsapp });
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
  const reconciliation = await materialsRepository.findReconciliationById(req.params.id);
  if (!reconciliation) {
    throw new AppError('Reconciliation not found', 404);
  }

  const custody = await materialsRepository.findCustodyById(reconciliation.custody?._id || reconciliation.custody);
  if (!custody) {
    throw new AppError('Linked custody not found', 404);
  }

  await assertCustodyReadable(req, custody);

  if (!['APPROVED'].includes(reconciliation.status)) {
    throw new AppError('Only approved reconciliations can accept returned materials', 409);
  }

  const request = await materialsRepository.findRequestById(reconciliation.request?._id || reconciliation.request);
  if (!request) {
    throw new AppError('Linked material request not found', 404);
  }

  const warehouse = await ensureWarehouseOptional(req.body.warehouseId || req.body.warehouse);
  const itemsPayload = parseArrayPayload(req.body.items, 'items');
  if (!itemsPayload.length) {
    throw new AppError('At least one return item is required', 400);
  }

  const inputByMaterial = new Map(
    itemsPayload.map((item) => [
      String(item.materialId || item.material || ''),
      {
        returnedQty: toPositiveQty(item.returnedQty, 'returnedQty'),
        condition: toUpper(item.condition || 'NEW'),
        notes: toCleanString(item.notes),
      },
    ]),
  );

  const allowedConditions = ['NEW', 'USED_PARTIAL', 'DAMAGED', 'NOT_USABLE'];

  const returnItems = [];
  const nextReconciliationItems = (reconciliation.items || []).map((line) => {
    const materialId = String(line.material?._id || line.material);
    const input = inputByMaterial.get(materialId);

    if (!input) {
      return line.toObject();
    }

    if (!allowedConditions.includes(input.condition)) {
      throw new AppError(`Invalid return condition for material ${materialId}`, 400);
    }

    const alreadyReturned = roundQty(line.returnedQtyConfirmed || 0);
    const allowedToReturn = roundQty(Math.max(0, roundQty(line.toReturnQty || 0) - alreadyReturned));

    if (allowedToReturn <= 0) {
      throw new AppError(`No remaining return quantity for material ${materialId}`, 409);
    }

    if (input.returnedQty > allowedToReturn) {
      throw new AppError(
        `Returned quantity for material ${materialId} exceeds pending return (${allowedToReturn})`,
        409,
      );
    }

    const nextReturned = roundQty(alreadyReturned + input.returnedQty);

    returnItems.push({
      material: line.material?._id || line.material,
      materialName: line.materialName || '',
      unit: line.unit || '',
      returnedQty: input.returnedQty,
      condition: input.condition,
      notes: input.notes,
    });

    return {
      ...line.toObject(),
      returnedQtyConfirmed: nextReturned,
      notes: input.notes || line.notes,
    };
  });

  if (!returnItems.length) {
    throw new AppError('No valid return lines were provided', 400);
  }

  let inventoryPosted = false;
  for (const line of returnItems) {
    const shouldPostToStock = ['NEW', 'USED_PARTIAL'].includes(line.condition);

    if (shouldPostToStock && warehouse?._id) {
      const balance = await materialsRepository.findStockBalance(line.material, warehouse._id);
      await adjustOnHandStock({
        materialId: line.material,
        warehouseId: warehouse._id,
        qtyDelta: line.returnedQty,
        avgCost: toNumber(balance?.avgCost, 0),
        transactionType: 'RETURN_IN',
        projectId: request.project?._id || request.project,
        requestId: request._id,
        referenceType: 'MATERIAL_RETURN_RECEIPT',
        referenceId: reconciliation.reconcileNo,
        notes: `Returned from reconciliation ${reconciliation.reconcileNo}`,
        actorId: req.user.id,
      });
      inventoryPosted = true;
    }
  }

  const returnNo = await sequenceService.next('MATERIAL_RETURN_RECEIPT', { prefix: 'RT', digits: 5 });

  const returnReceipt = await materialsRepository.createReturnReceipt({
    returnNo,
    reconciliation: reconciliation._id,
    custody: custody._id,
    request: request._id,
    project: request.project?._id || request.project,
    returnedBy: toCleanString(req.body.returnedById || req.body.returnedBy)
      || String(custody.holder?._id || custody.holder || req.user.id),
    receivedByStorekeeper: req.user.id,
    receivedAt: new Date(),
    status: 'RECEIVED',
    inventoryPosted,
    notes: toCleanString(req.body.notes),
    items: returnItems,
  });

  const updatedReconciliation = await materialsRepository.updateReconciliationById(reconciliation._id, {
    items: nextReconciliationItems,
    returnReceiptRef: returnReceipt._id,
  });

  const nextCustodyItems = (custody.items || []).map((line) => {
    const materialId = String(line.material?._id || line.material);
    const returnLine = returnItems.find((item) => String(item.material) === materialId);

    if (!returnLine) {
      return line.toObject();
    }

    const returnedQty = roundQty(line.returnedQty || 0) + roundQty(returnLine.returnedQty || 0);
    const remainingQty = roundQty(Math.max(0, roundQty(line.remainingQty || 0) - roundQty(returnLine.returnedQty || 0)));

    const accountedQty = roundQty(line.consumedQty || 0)
      + roundQty(line.damagedQty || 0)
      + roundQty(line.lostQty || 0)
      + returnedQty;

    const fullyClosed = accountedQty >= roundQty(line.receivedQty || 0);

    return {
      ...line.toObject(),
      returnedQty,
      remainingQty,
      lineStatus: fullyClosed ? 'CLOSED' : 'PARTIAL',
      notes: returnLine.notes || line.notes,
    };
  });

  const canCloseCustody = nextCustodyItems.every((line) => {
    const accountedQty = roundQty(line.consumedQty || 0)
      + roundQty(line.damagedQty || 0)
      + roundQty(line.lostQty || 0)
      + roundQty(line.returnedQty || 0);
    return accountedQty >= roundQty(line.receivedQty || 0);
  });

  const updatedCustody = await materialsRepository.updateCustodyById(custody._id, {
    items: nextCustodyItems,
    status: canCloseCustody ? 'CLOSED' : 'PARTIALLY_RECONCILED',
    closedAt: canCloseCustody ? new Date() : null,
    isOverdue: false,
  });

  const updatedRequest = await materialsRepository.updateRequestById(request._id, {
    status: canCloseCustody ? 'CLOSED' : 'PENDING_RECONCILIATION',
    closedAt: canCloseCustody ? new Date() : null,
  });

  const holderId = custody.holder?._id || custody.holder;
  await notificationService.notifySystem(
    holderId,
    'استلام مواد راجعة',
    `تم استلام المواد الراجعة ضمن السند ${returnNo}.`,
    {
      returnReceiptId: String(returnReceipt._id),
      reconciliationId: String(reconciliation._id),
      custodyId: String(custody._id),
      requestId: String(request._id),
    },
  );

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_RETURN_RECEIVED',
    entityType: 'MATERIAL_RECONCILIATION',
    entityId: reconciliation._id,
    after: {
      returnNo,
      lines: returnItems.length,
      custodyStatus: updatedCustody.status,
      requestStatus: updatedRequest.status,
      warehouseId: warehouse?._id ? String(warehouse._id) : null,
      inventoryPosted,
    },
    req,
  });

  res.status(201).json({
    returnReceipt,
    reconciliation: updatedReconciliation,
    custody: updatedCustody,
    request: updatedRequest,
  });
});

export const closeCustody = asyncHandler(async (req, res) => {
  const custody = await materialsRepository.findCustodyById(req.params.id);
  if (!custody) {
    throw new AppError('Custody not found', 404);
  }

  await assertCustodyReadable(req, custody);

  const canClose = (custody.items || []).every((line) => {
    const accountedQty = roundQty(line.consumedQty || 0)
      + roundQty(line.damagedQty || 0)
      + roundQty(line.lostQty || 0)
      + roundQty(line.returnedQty || 0);
    return accountedQty >= roundQty(line.receivedQty || 0);
  });

  if (!canClose) {
    throw new AppError('Cannot close custody before fully reconciling all materials', 409);
  }

  const updatedCustody = await materialsRepository.updateCustodyById(custody._id, {
    status: 'CLOSED',
    closedAt: new Date(),
    isOverdue: false,
    items: (custody.items || []).map((line) => ({
      ...line.toObject(),
      lineStatus: 'CLOSED',
    })),
  });

  const request = await materialsRepository.findRequestById(custody.request?._id || custody.request);
  if (request) {
    await materialsRepository.updateRequestById(request._id, {
      status: 'CLOSED',
      closedAt: new Date(),
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_CUSTODY_CLOSED',
    entityType: 'MATERIAL_CUSTODY',
    entityId: custody._id,
    after: {
      custodyNo: custody.custodyNo,
      status: 'CLOSED',
      requestId: request ? String(request._id) : null,
    },
    req,
  });

  res.json({ custody: updatedCustody });
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
