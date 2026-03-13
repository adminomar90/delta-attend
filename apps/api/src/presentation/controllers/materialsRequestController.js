import { env } from '../../config/env.js';
import { sequenceService } from '../../application/services/sequenceService.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import {
  NotificationWatchPermission,
  resolveNotificationAudience,
} from '../../application/services/notificationAudienceService.js';
import { buildWhatsAppSendUrl } from '../../shared/attendanceUtils.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import {
  materialsRepository,
  projectRepository,
  userRepository,
  toCleanString,
  toUpper,
  toDateOrNull,
  toNumber,
  roundQty,
  toPositiveQty,
  parseArrayPayload,
  mapPriority,
  sumBy,
  computeQtyAvailable,
  resolveManagedScope,
  resolveRequestedUserIdsFromRequest,
  isWithinScope,
  assertRequestReadable,
  ensureWarehouseOptional,
  ensureMaterialFromItem,
  adjustOnHandStock,
  resolveRecipientPhone,
  sendWhatsappOps,
  buildRequestWhatsappMessage,
  buildCustodyWhatsappMessage,
  appDetailsUrl,
} from './materialsCommon.js';

const REQUEST_REVIEW_ACTIONS = ['APPROVE_FULL', 'APPROVE_PARTIAL', 'REJECT', 'MODIFY'];

const applyMaterialRequestScopeFilter = ({ filter, managedUserIds, userId }) => {
  if (!Array.isArray(managedUserIds)) {
    return;
  }

  const actorId = String(userId);
  const ids = [...new Set([...managedUserIds, actorId])];

  filter.$or = [
    { requestedBy: { $in: ids } },
    { requestedFor: { $in: ids } },
    { assignedPreparer: { $in: ids } },
  ];
};

export const listMaterialEmployees = asyncHandler(async (_req, res) => {
  const users = await userRepository.listActive({ includeManager: true });
  res.json({ users });
});

export const createMaterialRequest = asyncHandler(async (req, res) => {
  const projectId = toCleanString(req.body.projectId || req.body.project);
  const clientName = toCleanString(req.body.clientName || req.body.client);
  const requestedForId = toCleanString(req.body.requestedForId || req.body.requestedFor);
  const assignedPreparerId = toCleanString(req.body.assignedPreparerId || req.body.assignedPreparer);
  const warehouse = await ensureWarehouseOptional(req.body.warehouseId || req.body.warehouse);

  if (!projectId) {
    throw new AppError('projectId is required', 400);
  }

  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  let assignedPreparer = null;
  if (assignedPreparerId) {
    assignedPreparer = await userRepository.findById(assignedPreparerId);
    if (!assignedPreparer || !assignedPreparer.active) {
      throw new AppError('Assigned preparer user not found', 404);
    }
  }

  const itemsPayload = parseArrayPayload(req.body.items, 'items');
  if (!itemsPayload.length) {
    throw new AppError('At least one item is required', 400);
  }

  const requestItems = [];

  for (const item of itemsPayload) {
    const requestedQty = toPositiveQty(item.requestedQty, 'requestedQty');
    const material = await ensureMaterialFromItem(item);
    const balance = warehouse
      ? await materialsRepository.findStockBalance(material._id, warehouse._id)
      : null;
    const requestedName = toCleanString(item.materialName || item.name);

    requestItems.push({
      material: material._id,
      materialName: requestedName || material.name,
      categorySnapshot: toUpper(item.category || material.category || 'GENERAL') || 'GENERAL',
      unitSnapshot: toUpper(item.unit || material.unit || 'PIECE') || 'PIECE',
      requestedQty,
      availableQtyAtRequest: warehouse ? computeQtyAvailable(balance) : 0,
      approvedQty: 0,
      preparedQty: 0,
      deliveredQty: 0,
      lineStatus: 'PENDING',
      lineNotes: toCleanString(item.notes || item.lineNotes),
    });
  }

  const requestNo = await sequenceService.next('MATERIAL_REQUEST', { prefix: 'MR', digits: 5 });

  const created = await materialsRepository.createRequest({
    requestNo,
    project: project._id,
    projectName: project.name || '',
    clientName,
    requestedBy: req.user.id,
    requestedFor: requestedForId || null,
    assignedPreparer: assignedPreparer?._id || null,
    requestDate: toDateOrNull(req.body.requestDate) || new Date(),
    priority: mapPriority(req.body.priority),
    generalNotes: toCleanString(req.body.generalNotes || req.body.notes),
    status: 'NEW',
    items: requestItems,
    approvals: [],
    preparations: [],
  });

  const request = await materialsRepository.findRequestById(created._id);

  await notificationService.notifySystem(
    req.user.id,
    'طلب مواد جديد',
    `تم إنشاء طلب مواد جديد برقم ${request.requestNo}.`,
    {
      requestId: String(request._id),
      requestNo: request.requestNo,
      projectId,
    },
  );

  if (assignedPreparer?._id) {
    await notificationService.notifySystem(
      assignedPreparer._id,
      'تعيين تجهيز طلب مواد',
      `تم تعيينك لتجهيز طلب المواد رقم ${request.requestNo}.`,
      {
        requestId: String(request._id),
        requestNo: request.requestNo,
        projectId,
      },
    );
  }

  const recipientPhone = await resolveRecipientPhone({
    userId: request.assignedPreparer?._id
      || request.assignedPreparer
      || request.requestedBy?._id
      || request.requestedBy,
    fallback: env.attendanceAdminWhatsapp,
  });

  const detailsUrl = appDetailsUrl(`/materials?requestId=${request._id}`);
  const whatsappMessage = buildRequestWhatsappMessage({ request, detailsUrl });
  const whatsapp = await sendWhatsappOps({ to: recipientPhone, message: whatsappMessage });

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_REQUEST_CREATED',
    entityType: 'MATERIAL_REQUEST',
    entityId: request._id,
    after: {
      requestNo: request.requestNo,
      projectId,
      priority: request.priority,
      itemsCount: request.items.length,
      assignedPreparerId: request.assignedPreparer?._id || request.assignedPreparer || null,
      warehouseId: warehouse?._id || null,
      status: request.status,
      whatsappDelivery: whatsapp.delivery,
    },
    req,
  });

  const createRequestRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: req.user.id,
    watchPermission: NotificationWatchPermission.OPERATION,
  });
  await notificationService.notifyOperationActivity(createRequestRecipients, {
    titleAr: 'إنشاء طلب مواد',
    actorName: req.user.name || req.user.fullName || 'مستخدم النظام',
    actionLabel: 'إنشاء طلب مواد',
    entityLabel: request.requestNo,
    occurredAt: request.createdAt || new Date(),
    metadata: {
      entityType: 'MATERIAL_REQUEST',
      entityId: String(request._id),
      action: 'MATERIAL_REQUEST_CREATED',
      projectId,
    },
  });

  res.status(201).json({ request, whatsapp });
});

export const listMaterialRequests = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.status) {
    filter.status = toUpper(req.query.status);
  }
  if (req.query.projectId) {
    filter.project = req.query.projectId;
  }
  if (req.query.priority) {
    filter.priority = mapPriority(req.query.priority);
  }
  if (req.query.requestedBy) {
    filter.requestedBy = req.query.requestedBy;
  }
  if (req.query.assignedPreparer) {
    filter.assignedPreparer = req.query.assignedPreparer;
  }

  const managedUserIds = await resolveManagedScope(req);

  if (String(req.query.mine || '').toLowerCase() === 'true') {
    filter.requestedBy = req.user.id;
  } else {
    applyMaterialRequestScopeFilter({
      filter,
      managedUserIds,
      userId: req.user.id,
    });
  }

  const requests = await materialsRepository.listRequests(filter, { limit: 500 });
  res.json({ requests });
});

export const getMaterialRequest = asyncHandler(async (req, res) => {
  const request = await materialsRepository.findRequestById(req.params.id);
  if (!request) {
    throw new AppError('Material request not found', 404);
  }

  await assertRequestReadable(req, request);
  res.json({ request });
});

export const reviewMaterialRequest = asyncHandler(async (req, res) => {
  const request = await materialsRepository.findRequestById(req.params.id);
  if (!request) {
    throw new AppError('Material request not found', 404);
  }

  await assertRequestReadable(req, request);

  if (String(request.requestedBy?._id || request.requestedBy) === String(req.user.id)) {
    throw new AppError('You cannot review your own material request', 403);
  }

  if (['REJECTED', 'CLOSED'].includes(request.status)) {
    throw new AppError('This request cannot be reviewed in its current status', 409);
  }

  const action = toUpper(req.body.action || 'APPROVE_FULL');
  if (!REQUEST_REVIEW_ACTIONS.includes(action)) {
    throw new AppError('Invalid review action', 400);
  }

  const notes = toCleanString(req.body.comment || req.body.notes);
  const lineInputs = Array.isArray(req.body.items)
    ? req.body.items
    : req.body.items
      ? parseArrayPayload(req.body.items, 'items')
      : [];

  const lineInputByMaterial = new Map(
    lineInputs.map((item) => [
      String(item.materialId || item.material || ''),
      {
        approvedQty: toNumber(item.approvedQty, 0),
        lineNotes: toCleanString(item.lineNotes || item.notes),
      },
    ]),
  );

  const beforeSnapshot = {
    status: request.status,
    items: (request.items || []).map((item) => ({
      material: String(item.material?._id || item.material),
      requestedQty: item.requestedQty,
      approvedQty: item.approvedQty,
      lineStatus: item.lineStatus,
    })),
  };

  const nextItems = (request.items || []).map((line) => {
    const materialId = String(line.material?._id || line.material);
    const requestedQty = roundQty(line.requestedQty || 0);

    let approvedQty = roundQty(line.approvedQty || 0);
    let lineStatus = line.lineStatus;
    let lineNotes = line.lineNotes || '';

    if (action === 'REJECT') {
      approvedQty = 0;
      lineStatus = 'REJECTED';
      lineNotes = lineInputByMaterial.get(materialId)?.lineNotes || lineNotes;
    } else if (action === 'APPROVE_FULL') {
      approvedQty = requestedQty;
      lineStatus = 'APPROVED';
      lineNotes = lineInputByMaterial.get(materialId)?.lineNotes || lineNotes;
    } else {
      const input = lineInputByMaterial.get(materialId);
      const candidateQty = input ? roundQty(input.approvedQty) : approvedQty;
      approvedQty = Math.max(0, Math.min(requestedQty, candidateQty));
      lineNotes = input?.lineNotes || lineNotes;

      if (approvedQty <= 0) {
        lineStatus = 'REJECTED';
      } else if (approvedQty < requestedQty) {
        lineStatus = 'PARTIAL';
      } else {
        lineStatus = 'APPROVED';
      }
    }

    return {
      ...line.toObject(),
      approvedQty,
      lineStatus,
      lineNotes,
    };
  });

  const approvedQtyTotal = sumBy(nextItems, (item) => item.approvedQty);

  const nextStatus = action === 'REJECT' || approvedQtyTotal <= 0
    ? 'REJECTED'
    : 'APPROVED';

  const approvalType = action === 'REJECT'
    ? 'REJECTED'
    : nextItems.some((item) => roundQty(item.approvedQty) < roundQty(item.requestedQty))
      ? 'PARTIAL'
      : 'FULL';

  const updated = await materialsRepository.updateRequestById(request._id, {
    items: nextItems,
    status: nextStatus,
    approvalSummary: {
      approvalType,
      approvedBy: req.user.id,
      approvedAt: new Date(),
      notes,
    },
    $push: {
      approvals: {
        action,
        approvedBy: req.user.id,
        approvedAt: new Date(),
        comment: notes,
        beforeSnapshot,
        afterSnapshot: {
          status: nextStatus,
          items: nextItems.map((item) => ({
            material: String(item.material?._id || item.material),
            requestedQty: item.requestedQty,
            approvedQty: item.approvedQty,
            lineStatus: item.lineStatus,
          })),
        },
      },
    },
  });

  const requesterId = request.assignedPreparer?._id
    || request.assignedPreparer
    || request.requestedBy?._id
    || request.requestedBy;
  await notificationService.notifySystem(
    requesterId,
    nextStatus === 'REJECTED' ? 'رفض طلب المواد' : 'اعتماد طلب المواد',
    nextStatus === 'REJECTED'
      ? `تم رفض طلب المواد رقم ${request.requestNo}.`
      : `تم اعتماد طلب المواد رقم ${request.requestNo} (${approvalType === 'PARTIAL' ? 'اعتماد جزئي' : 'اعتماد كامل'}).`,
    {
      requestId: String(request._id),
      requestNo: request.requestNo,
      status: nextStatus,
    },
  );

  const recipientPhone = await resolveRecipientPhone({
    userId: requesterId,
    fallback: env.attendanceAdminWhatsapp,
  });

  const detailsUrl = appDetailsUrl(`/materials?requestId=${request._id}`);
  const whatsappMessage = buildRequestWhatsappMessage({ request: updated, detailsUrl });
  const whatsapp = await sendWhatsappOps({ to: recipientPhone, message: whatsappMessage });

  await auditService.log({
    actorId: req.user.id,
    action: nextStatus === 'REJECTED' ? 'MATERIAL_REQUEST_REJECTED' : 'MATERIAL_REQUEST_REVIEWED',
    entityType: 'MATERIAL_REQUEST',
    entityId: request._id,
    before: beforeSnapshot,
    after: {
      status: nextStatus,
      approvalType,
      approvedQtyTotal,
      reviewerId: req.user.id,
      whatsappDelivery: whatsapp.delivery,
    },
    req,
  });

  const reviewRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: request.requestedBy?._id || request.requestedBy,
    watchPermission: NotificationWatchPermission.OPERATION,
    excludeUserIds: [req.user.id],
  });
  await notificationService.notifyOperationActivity(reviewRecipients, {
    titleAr: nextStatus === 'REJECTED' ? 'رفض طلب مواد' : 'اعتماد طلب مواد',
    actorName: req.user.name || req.user.fullName || 'مستخدم النظام',
    actionLabel: nextStatus === 'REJECTED' ? 'رفض طلب مواد' : 'اعتماد طلب مواد',
    entityLabel: request.requestNo,
    occurredAt: new Date(),
    metadata: {
      entityType: 'MATERIAL_REQUEST',
      entityId: String(request._id),
      action: nextStatus === 'REJECTED' ? 'MATERIAL_REQUEST_REJECTED' : 'MATERIAL_REQUEST_REVIEWED',
      status: nextStatus,
      approvalType,
    },
  });

  res.json({ request: updated, whatsapp });
});

export const prepareMaterialRequest = asyncHandler(async (req, res) => {
  const request = await materialsRepository.findRequestById(req.params.id);
  if (!request) {
    throw new AppError('Material request not found', 404);
  }

  await assertRequestReadable(req, request);

  if (!['APPROVED', 'PREPARING', 'PREPARED', 'DELIVERED'].includes(request.status)) {
    throw new AppError('Request is not ready for preparation', 409);
  }

  const warehouse = await ensureWarehouseOptional(req.body.warehouseId || req.body.warehouse);
  const itemsPayload = parseArrayPayload(req.body.items, 'items');
  if (!itemsPayload.length) {
    throw new AppError('At least one preparation item is required', 400);
  }

  const itemInputByMaterial = new Map();
  itemsPayload.forEach((item) => {
    const materialId = toCleanString(item.materialId || item.material);
    if (!materialId) {
      throw new AppError('Each preparation item requires materialId', 400);
    }

    itemInputByMaterial.set(materialId, {
      preparedQty: toPositiveQty(item.preparedQty, 'preparedQty'),
      batchNo: toCleanString(item.batchNo),
      serials: Array.isArray(item.serials) ? item.serials.map((s) => toCleanString(s)).filter(Boolean) : [],
      notes: toCleanString(item.notes),
    });
  });

  const updatedItems = [];
  const preparationLines = [];

  for (const line of request.items || []) {
    const materialId = String(line.material?._id || line.material);
    const input = itemInputByMaterial.get(materialId);

    if (!input) {
      updatedItems.push(line.toObject());
      continue;
    }

    const approvedQty = roundQty(line.approvedQty || 0);
    if (!approvedQty) {
      throw new AppError(`Material ${line.materialName || materialId} has zero approved quantity`, 400);
    }

    const alreadyPrepared = roundQty(line.preparedQty || 0);
    const remainingAllowed = roundQty(approvedQty - alreadyPrepared);
    if (remainingAllowed <= 0) {
      throw new AppError(`Material ${line.materialName || materialId} is already fully prepared`, 409);
    }

    const toPrepare = roundQty(Math.min(remainingAllowed, input.preparedQty));
    if (toPrepare <= 0) {
      throw new AppError('preparedQty must be greater than zero', 400);
    }

    if (warehouse?._id) {
      const balance = await materialsRepository.findStockBalance(materialId, warehouse._id);
      const available = computeQtyAvailable(balance);
      if (available < toPrepare) {
        throw new AppError(
          `Insufficient stock for material ${line.materialName || materialId}. Available: ${available}, requested: ${toPrepare}`,
          409,
        );
      }

      await adjustOnHandStock({
        materialId,
        warehouseId: warehouse._id,
        qtyDelta: -toPrepare,
        avgCost: toNumber(balance?.avgCost, 0),
        transactionType: 'OUT',
        projectId: request.project?._id || request.project,
        requestId: request._id,
        referenceType: 'MATERIAL_PREPARATION',
        referenceId: request.requestNo,
        notes: `Preparation for request ${request.requestNo}`,
        actorId: req.user.id,
      });
    }

    const preparedQty = roundQty(alreadyPrepared + toPrepare);

    updatedItems.push({
      ...line.toObject(),
      preparedQty,
      lineStatus: preparedQty >= approvedQty ? line.lineStatus : 'PARTIAL',
      lineNotes: input.notes || line.lineNotes,
    });

    preparationLines.push({
      material: materialId,
      preparedQty: toPrepare,
      unavailableQty: roundQty(Math.max(0, input.preparedQty - toPrepare)),
      batchNo: input.batchNo,
      serials: input.serials,
      notes: input.notes,
    });
  }

  if (!preparationLines.length) {
    throw new AppError('No valid preparation lines were provided', 400);
  }

  const allPrepared = updatedItems
    .filter((line) => roundQty(line.approvedQty || 0) > 0)
    .every((line) => roundQty(line.preparedQty || 0) >= roundQty(line.approvedQty || 0));

  const mode = allPrepared ? 'FULL' : 'PARTIAL';

  const updated = await materialsRepository.updateRequestById(request._id, {
    items: updatedItems,
    status: allPrepared ? 'PREPARED' : 'PREPARING',
    $push: {
      preparations: {
        preparedBy: req.user.id,
        preparedAt: new Date(),
        warehouse: warehouse?._id || null,
        mode,
        notes: toCleanString(req.body.notes),
        items: preparationLines,
      },
    },
  });

  const requesterId = request.requestedBy?._id || request.requestedBy;
  await notificationService.notifySystem(
    requesterId,
    'تجهيز طلب مواد',
    `تم تجهيز ${mode === 'FULL' ? 'كامل' : 'جزئي'} لطلب المواد رقم ${request.requestNo}.`,
    {
      requestId: String(request._id),
      requestNo: request.requestNo,
      mode,
    },
  );

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_REQUEST_PREPARED',
    entityType: 'MATERIAL_REQUEST',
    entityId: request._id,
    after: {
      requestNo: request.requestNo,
      mode,
      status: updated.status,
      preparedLines: preparationLines.length,
      warehouseId: warehouse?._id ? String(warehouse._id) : null,
    },
    req,
  });

  const prepareRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: request.requestedBy?._id || request.requestedBy,
    watchPermission: NotificationWatchPermission.OPERATION,
    excludeUserIds: [req.user.id],
  });
  await notificationService.notifyOperationActivity(prepareRecipients, {
    titleAr: 'تجهيز طلب مواد',
    actorName: req.user.name || req.user.fullName || 'مستخدم النظام',
    actionLabel: mode === 'FULL' ? 'تجهيز كامل لطلب مواد' : 'تجهيز جزئي لطلب مواد',
    entityLabel: request.requestNo,
    occurredAt: new Date(),
    metadata: {
      entityType: 'MATERIAL_REQUEST',
      entityId: String(request._id),
      action: 'MATERIAL_REQUEST_PREPARED',
      mode,
      status: updated.status,
    },
  });

  res.json({ request: updated });
});

export const dispatchMaterialRequest = asyncHandler(async (req, res) => {
  const request = await materialsRepository.findRequestById(req.params.id);
  if (!request) {
    throw new AppError('Material request not found', 404);
  }

  await assertRequestReadable(req, request);

  if (!['PREPARING', 'PREPARED', 'DELIVERED'].includes(request.status)) {
    throw new AppError('Request is not ready for dispatch', 409);
  }

  const warehouse = await ensureWarehouseOptional(req.body.warehouseId || req.body.warehouse);
  const itemsPayload = parseArrayPayload(req.body.items, 'items');
  if (!itemsPayload.length) {
    throw new AppError('At least one dispatch line is required', 400);
  }

  const recipientId = toCleanString(req.body.recipientId || req.body.recipient)
    || String(request.requestedFor?._id || request.requestedFor || request.requestedBy?._id || request.requestedBy || '');

  if (!recipientId) {
    throw new AppError('recipientId is required', 400);
  }

  const recipient = await userRepository.findById(recipientId);
  if (!recipient || !recipient.active) {
    throw new AppError('Recipient user not found', 404);
  }

  const itemInputByMaterial = new Map();
  itemsPayload.forEach((item) => {
    const materialId = toCleanString(item.materialId || item.material);
    if (!materialId) {
      throw new AppError('Each dispatch item requires materialId', 400);
    }

    itemInputByMaterial.set(materialId, {
      deliveredQty: toPositiveQty(item.deliveredQty, 'deliveredQty'),
      batchNo: toCleanString(item.batchNo),
      serials: Array.isArray(item.serials) ? item.serials.map((s) => toCleanString(s)).filter(Boolean) : [],
      conditionAtDelivery: toCleanString(item.conditionAtDelivery),
      notes: toCleanString(item.notes),
    });
  });

  const updatedItems = [];
  const dispatchItems = [];

  for (const line of request.items || []) {
    const materialId = String(line.material?._id || line.material);
    const input = itemInputByMaterial.get(materialId);

    if (!input) {
      updatedItems.push(line.toObject());
      continue;
    }

    const approvedQty = roundQty(line.approvedQty || 0);
    const preparedQty = roundQty(line.preparedQty || 0);
    const deliveredQty = roundQty(line.deliveredQty || 0);

    if (!approvedQty) {
      throw new AppError(`Material ${line.materialName || materialId} has zero approved quantity`, 400);
    }

    const remainingPrepared = roundQty(preparedQty - deliveredQty);
    if (remainingPrepared <= 0) {
      throw new AppError(`Material ${line.materialName || materialId} has no prepared quantity pending dispatch`, 409);
    }

    if (input.deliveredQty > remainingPrepared) {
      throw new AppError(
        `Dispatch quantity for ${line.materialName || materialId} exceeds prepared balance (${remainingPrepared})`,
        409,
      );
    }

    const nextDelivered = roundQty(deliveredQty + input.deliveredQty);

    updatedItems.push({
      ...line.toObject(),
      deliveredQty: nextDelivered,
      lineStatus: nextDelivered >= approvedQty ? 'DELIVERED' : 'PARTIAL',
      lineNotes: input.notes || line.lineNotes,
    });

    dispatchItems.push({
      material: materialId,
      materialName: line.materialName || line.material?.name || '',
      unit: line.unitSnapshot || line.material?.unit || '',
      deliveredQty: input.deliveredQty,
      batchNo: input.batchNo,
      serials: input.serials,
      conditionAtDelivery: input.conditionAtDelivery,
      notes: input.notes,
    });
  }

  if (!dispatchItems.length) {
    throw new AppError('No valid dispatch lines were provided', 400);
  }

  const dispatchNo = await sequenceService.next('MATERIAL_DISPATCH', { prefix: 'DN', digits: 5 });

  const dispatch = await materialsRepository.createDispatch({
    dispatchNo,
    request: request._id,
    project: request.project?._id || request.project,
    recipient: recipient._id,
    deliveredBy: req.user.id,
    preparedBy: request.assignedPreparer?._id || request.assignedPreparer || req.user.id,
    warehouse: warehouse?._id || null,
    deliveredAt: new Date(),
    confirmationMethod: toUpper(req.body.confirmationMethod || 'CHECKBOX'),
    status: 'CONFIRMED',
    notes: toCleanString(req.body.notes),
    items: dispatchItems,
  });

  let custody = request.custodyRef
    ? await materialsRepository.findCustodyById(request.custodyRef)
    : null;

  if (!custody) {
    const custodyNo = await sequenceService.next('MATERIAL_CUSTODY', { prefix: 'CU', digits: 5 });
    custody = await materialsRepository.createCustody({
      custodyNo,
      request: request._id,
      project: request.project?._id || request.project,
      holder: recipient._id,
      openedAt: new Date(),
      dueDate: toDateOrNull(req.body.custodyDueDate),
      status: 'OPEN',
      dispatchNotes: [dispatch._id],
      notes: toCleanString(req.body.custodyNotes),
      items: dispatchItems.map((line) => ({
        material: line.material,
        materialName: line.materialName,
        unit: line.unit,
        receivedQty: line.deliveredQty,
        consumedQty: 0,
        remainingQty: line.deliveredQty,
        returnedQty: 0,
        damagedQty: 0,
        lostQty: 0,
        lineStatus: 'OPEN',
        notes: line.notes,
      })),
    });
  } else {
    const nextByMaterial = new Map();

    (custody.items || []).forEach((line) => {
      nextByMaterial.set(String(line.material?._id || line.material), line.toObject());
    });

    dispatchItems.forEach((line) => {
      const materialId = String(line.material);
      const existing = nextByMaterial.get(materialId);

      if (!existing) {
        nextByMaterial.set(materialId, {
          material: line.material,
          materialName: line.materialName,
          unit: line.unit,
          receivedQty: line.deliveredQty,
          consumedQty: 0,
          remainingQty: line.deliveredQty,
          returnedQty: 0,
          damagedQty: 0,
          lostQty: 0,
          lineStatus: 'OPEN',
          notes: line.notes,
        });
      } else {
        existing.receivedQty = roundQty(existing.receivedQty + line.deliveredQty);
        existing.remainingQty = roundQty(existing.remainingQty + line.deliveredQty);
        existing.lineStatus = 'OPEN';
        existing.notes = line.notes || existing.notes;
        nextByMaterial.set(materialId, existing);
      }
    });

    const dispatchIds = [...new Set([...(custody.dispatchNotes || []).map((id) => String(id)), String(dispatch._id)])];

    custody = await materialsRepository.updateCustodyById(custody._id, {
      holder: recipient._id,
      status: 'OPEN',
      dispatchNotes: dispatchIds,
      items: [...nextByMaterial.values()],
    });
  }

  const fullyDelivered = updatedItems
    .filter((line) => roundQty(line.approvedQty || 0) > 0)
    .every((line) => roundQty(line.deliveredQty || 0) >= roundQty(line.approvedQty || 0));

  const updatedRequest = await materialsRepository.updateRequestById(request._id, {
    items: updatedItems,
    status: fullyDelivered ? 'PENDING_RECONCILIATION' : 'DELIVERED',
    dispatchRef: dispatch._id,
    custodyRef: custody._id,
  });

  await notificationService.notifySystem(
    recipient._id,
    'تسليم مواد للمشروع',
    `تم تسليم مواد على ذمتك ضمن الطلب رقم ${request.requestNo}.`,
    {
      requestId: String(request._id),
      dispatchId: String(dispatch._id),
      custodyId: String(custody._id),
    },
  );

  const recipientPhone = await resolveRecipientPhone({
    userId: recipient._id,
    fallback: env.attendanceAdminWhatsapp,
  });

  const detailsUrl = appDetailsUrl(`/materials?custodyId=${custody._id}`);
  const whatsappMessage = buildCustodyWhatsappMessage({ custody, detailsUrl });
  const whatsapp = await sendWhatsappOps({ to: recipientPhone, message: whatsappMessage });

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_REQUEST_DISPATCHED',
    entityType: 'MATERIAL_REQUEST',
    entityId: request._id,
    after: {
      requestNo: request.requestNo,
      dispatchNo: dispatch.dispatchNo,
      custodyNo: custody.custodyNo,
      status: updatedRequest.status,
      dispatchLines: dispatchItems.length,
      recipientId: String(recipient._id),
      whatsappDelivery: whatsapp.delivery,
    },
    req,
  });

  const dispatchRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: recipient._id,
    watchPermission: NotificationWatchPermission.OPERATION,
    excludeUserIds: [req.user.id],
  });
  await notificationService.notifyOperationActivity(dispatchRecipients, {
    titleAr: 'تسليم مواد للمشروع',
    actorName: req.user.name || req.user.fullName || 'مستخدم النظام',
    actionLabel: 'تسليم مواد للمشروع',
    entityLabel: request.requestNo,
    occurredAt: dispatch.deliveredAt || new Date(),
    metadata: {
      entityType: 'MATERIAL_REQUEST',
      entityId: String(request._id),
      action: 'MATERIAL_REQUEST_DISPATCHED',
      dispatchId: String(dispatch._id),
      custodyId: String(custody._id),
      recipientId: String(recipient._id),
    },
  });

  res.json({ request: updatedRequest, dispatch, custody, whatsapp });
});

export const requestWhatsappLink = asyncHandler(async (req, res) => {
  const request = await materialsRepository.findRequestById(req.params.id);
  if (!request) {
    throw new AppError('Material request not found', 404);
  }

  await assertRequestReadable(req, request);

  const requesterId = request.requestedBy?._id || request.requestedBy;
  const recipientPhone = await resolveRecipientPhone({
    userId: requesterId,
    fallback: env.attendanceAdminWhatsapp,
  });

  const detailsUrl = appDetailsUrl(`/materials?requestId=${request._id}`);
  const message = buildRequestWhatsappMessage({ request, detailsUrl });
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

export const listMaterialRequestsForApprovals = asyncHandler(async (req, res) => {
  const managedUserIds = await resolveManagedScope(req);
  const filter = {
    status: { $in: ['NEW', 'UNDER_REVIEW'] },
  };

  applyMaterialRequestScopeFilter({
    filter,
    managedUserIds,
    userId: req.user.id,
  });

  const requests = await materialsRepository.listRequests(filter, { limit: 200 });
  const pending = requests.filter((request) => {
    const requesterId = String(request.requestedBy?._id || request.requestedBy || '');
    const targetIds = resolveRequestedUserIdsFromRequest(request);
    if (requesterId === String(req.user.id)) {
      return false;
    }
    if (!Array.isArray(managedUserIds)) {
      return true;
    }
    return targetIds.some((id) => isWithinScope(managedUserIds, id));
  });

  res.json({ requests: pending });
});
