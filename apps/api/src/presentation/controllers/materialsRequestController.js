import { reviewInventoryRequest, prepareInventoryRequest, acceptInventoryReceipt, isWarehouseOperator, cancelRemainingInventoryRequest, withInventoryRequestLock, deleteInventoryRequest } from '../../application/services/inventoryWorkflowService.js';
import { sendWorkflowResult } from './inventoryWorkflowResponse.js';
import { CustomerRepository } from '../../infrastructure/db/repositories/CustomerRepository.js';
import { userCanSeeCustomer } from '../../application/services/customerAccessService.js';
import { resolveMaterialRequestTarget } from '../../application/services/materialRequestTargetService.js';
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
import { Permission, Roles } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';
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
  ensureWarehouse,
  ensureMaterial,
  ensureWarehouseOptional,
  ensureMaterialFromItem,
  adjustOnHandStock,
  resolveRecipientPhone,
  sendWhatsappOps,
  buildRequestWhatsappMessage,
  buildCustodyWhatsappMessage,
  appDetailsUrl,
} from './materialsCommon.js';

const customerRepository = new CustomerRepository();
const ensureRequestMaterial = async (item, warehouse) => {
  const materialId = toCleanString(item.materialId || item.material);
  if (!materialId) throw new AppError('اختر المادة من منتجات المخزن؛ لا يمكن إنشاء مادة من الطلب', 400);
  const material = await ensureMaterial(materialId);
  const balance = await materialsRepository.findStockBalance(materialId, warehouse._id);
  if (!balance || computeQtyAvailable(balance) <= 0) throw new AppError('المادة غير متوفرة في المخزن المحدد', 409);
  return material;
};
const resolveTarget = (req, body) => resolveMaterialRequestTarget(body, {
  findProject: (id) => projectRepository.findById(id),
  findCustomer: (id) => customerRepository.findById(id),
  canSeeCustomer: (customer) => userCanSeeCustomer(req, customer),
});

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
  if (req.body.operationKey) {
    const previous = await materialsRepository.findRequestByOperationKey(req.body.operationKey);
    if (previous) { await assertRequestReadable(req, previous); if (previous.deletedAt) throw new AppError('الطلب السابق محذوف؛ أنشئ طلباً جديداً', 409); return res.json({ request: previous, alreadyApplied: true }); }
  }
  const target = await resolveTarget(req, req.body);
  const projectId = target.project;
  const requestedForId = toCleanString(req.body.requestedForId || req.body.requestedFor) || req.user.id;
  if (requestedForId !== req.user.id && !isWarehouseOperator(req.user)) throw new AppError('طلب المواد لموظف آخر يحتاج صلاحية أمين المخزن', 403);
  const recipient = await userRepository.findById(requestedForId);
  if (!recipient?.active) throw new AppError('الفني المستلم غير موجود أو غير فعال', 400);
  const assignedPreparerId = toCleanString(req.body.assignedPreparerId || req.body.assignedPreparer);
  if (!req.body.warehouseId && !req.body.warehouse) throw new AppError('اختيار المخزن إلزامي', 400);
  const warehouse = await ensureWarehouse(req.body.warehouseId || req.body.warehouse);
  if (warehouse.type === 'DAMAGED') throw new AppError('لا يمكن طلب مواد من مخزن التالف', 400);

  let assignedPreparer = null;
  if (assignedPreparerId) {
    assignedPreparer = await userRepository.findById(assignedPreparerId);
    if (!assignedPreparer || !assignedPreparer.active) {
      throw new AppError('Assigned preparer user not found', 404);
    }
    if (!isWarehouseOperator(assignedPreparer)) throw new AppError('مجهز الطلب يجب أن يكون أمين مخزن مخولاً', 400);
  }

  const itemsPayload = parseArrayPayload(req.body.items, 'items');
  if (!itemsPayload.length) {
    throw new AppError('At least one item is required', 400);
  }

  const requestItems = [];
  const seen = new Set();

  for (const item of itemsPayload) {
    const requestedQty = toPositiveQty(item.requestedQty, 'requestedQty');
    const material = await ensureRequestMaterial(item, warehouse);
    if (seen.has(String(material._id))) throw new AppError('المادة مكررة في الطلب', 400);
    seen.add(String(material._id));
    const balance = warehouse
      ? await materialsRepository.findStockBalance(material._id, warehouse._id)
      : null;
    const requestedName = toCleanString(item.materialName || item.name);

    requestItems.push({
      material: material._id,
      materialName: material.name,
      categorySnapshot: material.category || 'GENERAL',
      unitSnapshot: material.unit || 'PIECE',
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
    operationKey: req.body.operationKey || '',
    warehouse: warehouse._id,
    workflowVersion: 2,
    ...target,
    requestedBy: req.user.id,
    requestedFor: requestedForId || null,
    assignedPreparer: assignedPreparer?._id || null,
    requestDate: toDateOrNull(req.body.requestDate) || new Date(),
    priority: mapPriority(req.body.priority),
    generalNotes: toCleanString(req.body.generalNotes || req.body.notes),
    status: 'PENDING_MANAGER_APPROVAL',
    items: requestItems,
    approvals: [],
    preparations: [],
  });

  const request = await materialsRepository.findRequestById(created._id);

  const warehouseReviewers = (await userRepository.listActive({ includeManager: false }))
    .filter((user) => isWarehouseOperator(user) && String(user._id) !== requestedForId);
  await Promise.all(warehouseReviewers.map((user) => notificationService.notifySystem(
    user._id, 'طلب مواد بانتظار اعتماد المخزن',
    `الطلب ${request.requestNo} بانتظار مراجعة الكميات ثم التجهيز.`,
    { requestId: String(request._id), url: '/warehouses?tab=requests' },
  )));

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
      requestTarget: target.requestTarget,
      customerId: target.customer,
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

  /* by default exclude archived requests unless explicitly asked */
  if (req.query.archived === 'true') {
    filter.archived = true;
  } else if (req.query.archived === 'all') {
    /* no filter — return everything */
  } else {
    filter.archived = { $ne: true };
  }

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
  const canSeeAllMaterialRequests = hasPermission(req.user, Permission.MANAGE_MATERIAL_INVENTORY)
    || hasPermission(req.user, Permission.REVIEW_MATERIAL_REQUESTS)
    || hasPermission(req.user, Permission.PREPARE_MATERIAL_REQUESTS)
    || hasPermission(req.user, Permission.DISPATCH_MATERIAL_REQUESTS);

  if (String(req.query.mine || '').toLowerCase() === 'true') {
    filter.requestedBy = req.user.id;
  } else if (canSeeAllMaterialRequests) {
    /* material management and warehouse operators need the full workflow queue */
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

export const updateMaterialRequest = asyncHandler(async (req, res) => withInventoryRequestLock(req.params.id, async () => {
  const request = await materialsRepository.findRequestById(req.params.id);
  if (!request) {
    throw new AppError('Material request not found', 404);
  }

  await assertRequestReadable(req, request);
  if (request.deletedAt) throw new AppError('الطلب محذوف ولا يمكن تعديله', 409);
  if (request.pendingReceipt) throw new AppError('توجد دفعة مجهزة أو عملية جارية على الطلب', 409);

  const editableStatuses = ['REJECTED', 'PENDING_MANAGER_APPROVAL', 'PENDING_SUPPLIER_APPROVAL', 'NEW', 'UNDER_REVIEW', 'APPROVED'];
  if (!editableStatuses.includes(request.status)) {
    throw new AppError('لا يمكن تعديل الطلب بعد اعتماد المجهز أو بدء التجهيز', 409);
  }

  const hasPreparation = (request.preparations || []).length > 0
    || (request.items || []).some((item) => roundQty(item.preparedQty || 0) > 0 || roundQty(item.deliveredQty || 0) > 0);
  if (hasPreparation) {
    throw new AppError('لا يمكن تعديل طلب تم تجهيزه أو تسليمه', 409);
  }

  const actorId = String(req.user.id);
  const requestedById = String(request.requestedBy?._id || request.requestedBy || '');
  const requestedForId = String(request.requestedFor?._id || request.requestedFor || '');
  const canEdit = actorId === requestedById
    || actorId === requestedForId
    || req.user.role === 'GENERAL_MANAGER'
    || hasPermission(req.user, Permission.MANAGE_MATERIAL_INVENTORY)
    || hasPermission(req.user, Permission.REVIEW_MATERIAL_REQUESTS);
  if (!canEdit) {
    throw new AppError('لا تملك صلاحية تعديل هذا الطلب', 403);
  }

  const target = await resolveTarget(req, { ...req.body, requestTarget: req.body.requestTarget || request.requestTarget, customerId: req.body.customerId ?? request.customer?._id ?? request.customer });
  const projectId = target.project;
  const clientName = target.clientName;
  const requestedForBody = toCleanString(req.body.requestedForId || req.body.requestedFor) || requestedForId || requestedById;
  if (requestedForBody !== (requestedForId || requestedById) && requestedForBody !== req.user.id && !isWarehouseOperator(req.user)) throw new AppError('لا يمكنك تغيير الفني المستلم إلى موظف آخر', 403);
  const assignedPreparerId = toCleanString(req.body.assignedPreparerId || req.body.assignedPreparer);

  let requestedFor = null;
  if (requestedForBody) {
    requestedFor = await userRepository.findById(requestedForBody);
    if (!requestedFor || !requestedFor.active) {
      throw new AppError('Requested user not found', 404);
    }
  }

  let assignedPreparer = null;
  if (assignedPreparerId) {
    assignedPreparer = await userRepository.findById(assignedPreparerId);
    if (!assignedPreparer || !assignedPreparer.active) {
      throw new AppError('Assigned preparer user not found', 404);
    }
    if (!isWarehouseOperator(assignedPreparer)) throw new AppError('مجهز الطلب يجب أن يكون أمين مخزن مخولاً', 400);
  }

  const itemsPayload = parseArrayPayload(req.body.items, 'items');
  if (!itemsPayload.length) {
    throw new AppError('At least one item is required', 400);
  }

  const requestItems = [];
  const warehouse = await ensureWarehouse(req.body.warehouseId || request.warehouse?._id || request.warehouse);
  if (warehouse.type === 'DAMAGED') throw new AppError('لا يمكن طلب مواد من مخزن التالف', 400);
  const seen = new Set();
  for (const item of itemsPayload) {
    const requestedQty = toPositiveQty(item.requestedQty, 'requestedQty');
    const material = await ensureRequestMaterial(item, warehouse);
    if (seen.has(String(material._id))) throw new AppError('المادة مكررة في الطلب', 400);
    seen.add(String(material._id));
    const requestedName = toCleanString(item.materialName || item.name);
    requestItems.push({
      material: material._id,
      materialName: material.name,
      categorySnapshot: material.category || 'GENERAL',
      unitSnapshot: material.unit || 'PIECE',
      requestedQty,
      availableQtyAtRequest: 0,
      approvedQty: 0,
      preparedQty: 0,
      deliveredQty: 0,
      lineStatus: 'PENDING',
      lineNotes: toCleanString(item.notes || item.lineNotes),
    });
  }

  const beforeSnapshot = {
    status: request.status,
    projectId: String(request.project?._id || request.project || ''),
    manualProjectName: request.manualProjectName,
    clientName: request.clientName,
    requestTarget: request.requestTarget,
    customerId: String(request.customer?._id || request.customer || ''),
    priority: request.priority,
    requestedForId,
    assignedPreparerId: String(request.assignedPreparer?._id || request.assignedPreparer || ''),
    generalNotes: request.generalNotes,
    items: (request.items || []).map((item) => ({
      material: String(item.material?._id || item.material),
      materialName: item.materialName,
      requestedQty: item.requestedQty,
      unitSnapshot: item.unitSnapshot,
      lineNotes: item.lineNotes,
    })),
  };

  const updated = await materialsRepository.updateRequestById(request._id, {
    warehouse: warehouse._id,
    ...target,
    requestedFor: requestedFor?._id || null,
    assignedPreparer: assignedPreparer?._id || null,
    priority: mapPriority(req.body.priority),
    generalNotes: toCleanString(req.body.generalNotes || req.body.notes),
    status: 'PENDING_MANAGER_APPROVAL',
    approvalSummary: {
      approvalType: 'NONE',
      approvedBy: null,
      approvedAt: null,
      notes: '',
    },
    items: requestItems,
    preparations: [],
    $push: {
      approvals: {
        action: 'MODIFY',
        approvedBy: req.user.id,
        approvedAt: new Date(),
        comment: toCleanString(req.body.editReason || req.body.notes || 'تعديل الطلب قبل اعتماد المجهز'),
        beforeSnapshot,
        afterSnapshot: {
          status: 'PENDING_MANAGER_APPROVAL',
          projectId,
          manualProjectName: target.manualProjectName,
          requestTarget: target.requestTarget,
          customerId: target.customer,
          clientName,
          priority: mapPriority(req.body.priority),
          requestedForId: requestedFor?._id || null,
          assignedPreparerId: assignedPreparer?._id || null,
          items: requestItems.map((item) => ({
            material: String(item.material),
            materialName: item.materialName,
            requestedQty: item.requestedQty,
            unitSnapshot: item.unitSnapshot,
            lineNotes: item.lineNotes,
          })),
        },
      },
    },
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_REQUEST_UPDATED_BEFORE_PREPARER_APPROVAL',
    entityType: 'MATERIAL_REQUEST',
    entityId: request._id,
    before: beforeSnapshot,
    after: {
      status: updated.status,
      projectId,
      itemsCount: updated.items.length,
      assignedPreparerId: updated.assignedPreparer?._id || updated.assignedPreparer || null,
    },
    req,
  });

  res.json({ request: updated });
}));

export const reviewMaterialRequest = asyncHandler(async (req, res) => {
  return sendWorkflowResult(req, res, 'MATERIAL_REQUEST_REVIEWED', await reviewInventoryRequest(req.params.id, req.user, req.body));
});

export const deleteMaterialRequest = asyncHandler(async (req, res) => {
  const result = await deleteInventoryRequest(req.params.id, req.user, req.body, { maxFailures: env.maxAuthFailures, lockMinutes: env.lockMinutes });
  if (!result.alreadyApplied) await auditService.log({ actorId: req.user.id, action: 'MATERIAL_REQUEST_DELETED', entityType: 'MATERIAL_REQUEST', entityId: req.params.id, after: result, req });
  res.json(result);
});

export const prepareMaterialRequest = asyncHandler(async (req, res) => {
  return sendWorkflowResult(req, res, 'MATERIAL_REQUEST_PREPARED', await prepareInventoryRequest(req.params.id, req.user, req.body));
});

export const dispatchMaterialRequest = asyncHandler(async (req, res) => {
  return Promise.reject(new AppError('الصرف يتم عند تأكيد الفني للاستلام حصراً', 409));
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
    status: { $in: ['PENDING_MANAGER_APPROVAL', 'NEW', 'UNDER_REVIEW'] },
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

/* ════════════════════════════════════════════════════════════════════════════
   SUPPLIER (PREPARER) APPROVAL — step 3 in workflow
   ════════════════════════════════════════════════════════════════════════════ */
export const supplierApproveMaterialRequest = asyncHandler(async (req, res) => {
  return Promise.reject(new AppError('اعتماد الكميات من أمين المخزن ثم تجهيزها من شاشة المخازن', 409));
});

export const confirmReceipt = asyncHandler(async (req, res) => {
  return sendWorkflowResult(req, res, 'MATERIAL_RECEIPT_CONFIRMED', await acceptInventoryReceipt(req.params.id, req.user, req.body));
});

export const cancelRemainingRequest = asyncHandler(async (req, res) => sendWorkflowResult(req, res, 'MATERIAL_REMAINDER_CANCELLED', await cancelRemainingInventoryRequest(req.params.id, req.user, req.body)));

export const archiveMaterialRequest = asyncHandler(async (req, res) => {
  const request = await materialsRepository.findRequestById(req.params.id);
  if (!request) {
    throw new AppError('Material request not found', 404);
  }

  await assertRequestReadable(req, request);
  if (request.pendingReceipt) throw new AppError('أكمل عملية الدفعة المعلقة قبل الأرشفة', 409);
  if (!['CLOSED', 'RECONCILED', 'CANCELLED'].includes(request.status)) {
    throw new AppError('يمكن أرشفة الطلبات المغلقة فقط', 400);
  }

  if (request.archived) {
    throw new AppError('هذا الطلب مؤرشف بالفعل', 409);
  }

  const updated = await materialsRepository.updateRequestById(request._id, {
    archived: true,
    archivedAt: new Date(),
    archivedBy: req.user.id,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_REQUEST_ARCHIVED',
    entityType: 'MATERIAL_REQUEST',
    entityId: request._id,
    before: { archived: false },
    after: { archived: true, archivedAt: updated.archivedAt, archivedBy: req.user.id },
    req,
  });

  await notificationService.notifySystem(
    req.user.id,
    'أرشفة طلب مواد',
    `تم أرشفة طلب المواد رقم ${request.requestNo} بنجاح.`,
    { requestId: String(request._id), requestNo: request.requestNo },
  );

  const audience = await resolveNotificationAudience({
    userRepository,
    actorId: req.user.id,
    watchPermission: NotificationWatchPermission.OPERATION,
  });
  await notificationService.notifyOperationActivity(audience, {
    titleAr: 'أرشفة طلب مواد',
    actorName: req.user.name || req.user.fullName || 'مستخدم النظام',
    actionLabel: 'أرشفة طلب',
    entityLabel: request.requestNo,
    occurredAt: new Date(),
    metadata: {
      entityType: 'MATERIAL_REQUEST',
      entityId: String(request._id),
      action: 'MATERIAL_REQUEST_ARCHIVED',
    },
  });

  res.json({ request: updated });
});

/* ────────── OPEN CUSTODIES SUMMARY ────────── */
export const openCustodiesSummary = asyncHandler(async (req, res) => {
  const userId = String(req.user.id);
  const canSeeAllCustodies = hasPermission(req.user, Permission.MANAGE_MATERIAL_INVENTORY)
    || hasPermission(req.user, Permission.RECONCILE_OTHERS_MATERIAL_CUSTODY);

  /* 1. load all non-closed custodies with deep population */
  const allCustodies = await materialsRepository.listCustodies(
    { status: { $in: ['OPEN', 'PARTIALLY_RECONCILED', 'OVERDUE', 'PENDING_RECONCILIATION'] } },
    { limit: 5000 },
  );

  /* deep-populate request sub-refs (requestedBy, requestedFor, assignedPreparer) */
  const { MaterialRequestModel } = await import('../../infrastructure/db/models/MaterialRequestModel.js');
  const requestIds = [...new Set(allCustodies.map((c) => c.request?._id || c.request).filter(Boolean).map(String))];
  const deepRequests = await MaterialRequestModel.find({ _id: { $in: requestIds } })
    .populate('requestedBy', 'fullName role employeeCode phone')
    .populate('requestedFor', 'fullName role employeeCode phone')
    .populate('assignedPreparer', 'fullName role employeeCode phone')
    .populate('project', 'name code')
    .populate('approvals.approvedBy', 'fullName role employeeCode')
    .populate('preparations.preparedBy', 'fullName role employeeCode')
    .populate('preparations.warehouse', 'name code')
    .lean();
  const requestMap = new Map(deepRequests.map((r) => [String(r._id), r]));

  /* 2. role-based filtering (server-enforced) */
  const managedUserIds = await resolveManagedScope(req);
  const custodies = allCustodies.filter((cu) => {
    const holderId = String(cu.holder?._id || cu.holder || '');
    const reqData = requestMap.get(String(cu.request?._id || cu.request || ''));
    const preparerId = String(reqData?.assignedPreparer?._id || reqData?.assignedPreparer || '');
    if (canSeeAllCustodies) return true;
    /* holder can always see own custodies */
    if (holderId === userId) return true;
    /* preparer can see custodies of requests they prepared */
    if (preparerId === userId) return true;
    /* managers / GM see within their managed scope */
    if (isWithinScope(managedUserIds, holderId)) return true;
    return false;
  });

  /* 3. group by holder — enriched data */
  const byHolder = new Map();
  for (const cu of custodies) {
    const holderId = String(cu.holder?._id || cu.holder || 'unknown');
    if (!byHolder.has(holderId)) {
      byHolder.set(holderId, {
        holderId,
        holderName: cu.holder?.fullName || '-',
        employeeCode: cu.holder?.employeeCode || '',
        custodies: [],
        totalItems: 0,
        totalRemaining: 0,
        projects: new Set(),
        lastReceivedAt: null,
      });
    }
    const entry = byHolder.get(holderId);
    const rq = requestMap.get(String(cu.request?._id || cu.request || '')) || {};
    entry.custodies.push({
      custodyId: cu._id,
      custodyNo: cu.custodyNo,
      project: cu.project?.name || cu.manualProjectName || '-',
      projectCode: cu.project?.code || '',
      status: cu.status,
      itemsCount: (cu.items || []).length,
      remainingQty: (cu.items || []).reduce((s, i) => s + (i.remainingQty || 0), 0),
      openedAt: cu.openedAt,
      dueDate: cu.dueDate || null,
      notes: cu.notes || '',
      /* request details (deep-populated) */
      requestId: rq._id || cu.request?._id || null,
      requestNo: rq.requestNo || cu.request?.requestNo || '-',
      requestStatus: rq.status || '-',
      requestedByName: rq.requestedBy?.fullName || '-',
      requestedForName: rq.requestedFor?.fullName || '-',
      preparerName: rq.assignedPreparer?.fullName || '-',
      preparerId: String(rq.assignedPreparer?._id || rq.assignedPreparer || ''),
      requestDate: rq.requestDate || rq.createdAt || null,
      generalNotes: rq.generalNotes || '',
      priority: rq.priority || 'NORMAL',
      /* request items (what was requested/approved/prepared/delivered) */
      requestItems: (rq.items || []).map((ri) => ({
        materialName: ri.materialName || ri.material?.name || '-',
        materialCode: ri.material?.code || '',
        unit: ri.unitSnapshot || ri.unit || '-',
        requestedQty: ri.requestedQty || 0,
        approvedQty: ri.approvedQty || 0,
        preparedQty: ri.preparedQty || 0,
        deliveredQty: ri.deliveredQty || 0,
        lineNotes: ri.lineNotes || '',
      })),
      /* approval trail */
      approvals: (rq.approvals || []).map((a) => ({
        action: a.action,
        approvedBy: a.approvedBy?.fullName || '-',
        approvedAt: a.approvedAt,
        comment: a.comment || '',
      })),
      /* preparation log */
      preparations: (rq.preparations || []).map((p) => ({
        preparedBy: p.preparedBy?.fullName || '-',
        preparedAt: p.preparedAt,
        warehouse: p.warehouse?.name || '-',
        mode: p.mode || '-',
        notes: p.notes || '',
      })),
      /* dispatch info */
      dispatchInfo: (cu.dispatchNotes || []).map((d) => ({
        dispatchNo: d.dispatchNo,
        deliveredAt: d.deliveredAt,
        status: d.status,
      })),
      /* enriched custody items */
      items: (cu.items || []).map((it) => ({
        materialName: it.materialName || it.material?.name || '-',
        materialCode: it.material?.code || '',
        unit: it.unit || '-',
        receivedQty: it.receivedQty || 0,
        consumedQty: it.consumedQty || 0,
        remainingQty: it.remainingQty || 0,
        returnedQty: it.returnedQty || 0,
        damagedQty: it.damagedQty || 0,
        lostQty: it.lostQty || 0,
        lineStatus: it.lineStatus || 'OPEN',
        notes: it.notes || '',
      })),
    });
    entry.totalItems += (cu.items || []).length;
    entry.totalRemaining += (cu.items || []).reduce((s, i) => s + (i.remainingQty || 0), 0);
    if (cu.project?.name) entry.projects.add(cu.project.name);
    if (cu.manualProjectName) entry.projects.add(cu.manualProjectName);
    const opened = cu.openedAt || cu.createdAt;
    if (opened && (!entry.lastReceivedAt || new Date(opened) > new Date(entry.lastReceivedAt))) {
      entry.lastReceivedAt = opened;
    }
  }

  const holders = Array.from(byHolder.values()).map((h) => ({
    ...h,
    projects: Array.from(h.projects),
    custodiesCount: h.custodies.length,
  }));

  holders.sort((a, b) => b.totalRemaining - a.totalRemaining);

  res.json({ holders, totalHolders: holders.length });
});
