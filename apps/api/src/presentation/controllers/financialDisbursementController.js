import { sequenceService } from '../../application/services/sequenceService.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import {
  buildApprovalPointEvents,
  buildClosurePointEvents,
  buildSubmissionPointEvents,
  FinancialDisbursementStatus,
  FinancialDisbursementType,
  FinancialWorkflowAction,
  getFinancialStatusLabel,
  resolveApprovalChain,
  resolveFinancialReviewers,
  shouldRequireGeneralManagerApproval,
  summarizeFinancialRequests,
} from '../../application/services/financialDisbursementService.js';
import { financialDisbursementPointsService } from '../../application/services/financialDisbursementPointsService.js';
import { FinancialDisbursementRepository } from '../../infrastructure/db/repositories/FinancialDisbursementRepository.js';
import { buildFinancialDisbursementPdfBuffer } from '../../infrastructure/reports/financialDisbursementPdfBuilder.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { Permission, Roles } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { buildWhatsAppSendUrl } from '../../shared/attendanceUtils.js';
import { sendWhatsappOps, resolveRecipientPhone, appDetailsUrl } from './materialsCommon.js';

const financialDisbursementRepository = new FinancialDisbursementRepository();
const userRepository = new UserRepository();

const canCreateFinancialRequest = (user = {}) =>
  hasPermission(user, Permission.CREATE_FINANCIAL_DISBURSEMENTS);

const canReviewFinancialRequest = (user = {}) =>
  hasPermission(user, Permission.REVIEW_FINANCIAL_DISBURSEMENTS);

const canEscalateFinancialRequest = (user = {}) =>
  hasPermission(user, Permission.ESCALATE_FINANCIAL_DISBURSEMENTS);

const canDisburseFinancialFunds = (user = {}) =>
  hasPermission(user, Permission.DISBURSE_FINANCIAL_FUNDS);

const toCleanString = (value) => String(value || '').trim();

const toPositiveAmount = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('amount must be greater than 0', 400);
  }
  if (amount > 1000000000) {
    throw new AppError('amount is too large', 400);
  }
  return Math.round(amount * 100) / 100;
};

const normalizeType = (value) => {
  const type = toCleanString(value || FinancialDisbursementType.TRANSPORT_EXPENSE).toUpperCase();
  if (!Object.values(FinancialDisbursementType).includes(type)) {
    throw new AppError('Invalid request type', 400);
  }
  return type;
};

const toBoolean = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const parseApprovedAmount = (value, originalAmount) => {
  if (value == null || value === '') {
    return null;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new AppError('Approved amount must be a non-negative number', 400);
  }

  if (amount > originalAmount) {
    throw new AppError('Approved amount cannot exceed the original amount', 400);
  }

  return Math.round(amount * 100) / 100;
};

const parseBatchRequests = (value) => {
  if (value == null || value === '') {
    return [];
  }

  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new AppError('Invalid requests payload', 400);
    }
  }

  if (!Array.isArray(parsed)) {
    throw new AppError('requests must be an array', 400);
  }

  return parsed;
};

const serializeAttachment = (file, actorId) => ({
  url: `/uploads/${file.filename}`,
  originalName: file.originalname || '',
  mimeType: file.mimetype || '',
  size: Number(file.size || 0),
  uploadedBy: actorId || null,
  uploadedAt: new Date(),
});

const buildWorkflowEntry = ({
  action,
  actorId,
  actorRole,
  beforeStatus,
  afterStatus,
  notes = '',
}) => ({
  action,
  actor: actorId,
  actorRole: actorRole || null,
  beforeStatus: beforeStatus || null,
  afterStatus: afterStatus || null,
  notes,
  occurredAt: new Date(),
});

const sumPointEvents = (request = {}) =>
  (request.pointsEvents || []).reduce((sum, entry) => sum + Number(entry.points || 0), 0);

const buildAccessibleFilter = (req) => {
  if (req.user?.role === Roles.GENERAL_MANAGER) {
    return {};
  }

  return {
    $or: [
      { employee: req.user.id },
      { projectManagerReviewer: req.user.id },
      { financialManagerReviewer: req.user.id },
      { generalManagerReviewer: req.user.id },
    ],
  };
};

const canReadRequest = (req, request) => {
  if (!request) {
    return false;
  }

  if (req.user?.role === Roles.GENERAL_MANAGER) {
    return true;
  }

  const userId = String(req.user?.id || '');
  const candidates = [
    request.employee?._id || request.employee,
    request.projectManagerReviewer?._id || request.projectManagerReviewer,
    request.financialManagerReviewer?._id || request.financialManagerReviewer,
    request.generalManagerReviewer?._id || request.generalManagerReviewer,
  ].map((item) => String(item || ''));

  return candidates.includes(userId);
};

const ensureReadableRequest = (req, request) => {
  if (!canReadRequest(req, request)) {
    throw new AppError('Financial request not found', 404);
  }
};

const canEditRequest = (req, request) =>
  String(request.employee?._id || request.employee) === String(req.user.id)
  && [FinancialDisbursementStatus.DRAFT, FinancialDisbursementStatus.RETURNED_FOR_REVIEW].includes(request.status)
  && !request.projectManagerApprovedAt
  && !request.financiallyApprovedAt
  && !request.generalManagerApprovedAt;

const serializeRequest = (request, currentUser = null) => {
  const currentUserId = String(currentUser?.id || currentUser?._id || '');
  const status = request.status || '';
  const employeeId = String(request.employee?._id || request.employee || '');
  const projectManagerId = String(request.projectManagerReviewer?._id || request.projectManagerReviewer || '');
  const financialManagerId = String(request.financialManagerReviewer?._id || request.financialManagerReviewer || '');
  const generalManagerId = String(request.generalManagerReviewer?._id || request.generalManagerReviewer || '');

  return {
    id: String(request._id || request.id || ''),
    requestNo: request.requestNo || '',
    transactionNo: request.transactionNo || '',
    transactionDate: request.transactionDate || request.createdAt || null,
    transactionTotalAmount: Number(request.transactionTotalAmount || request.amount || 0),
    requestType: request.requestType || '',
    amount: Number(request.amount || 0),
    approvedAmount: request.approvedAmount != null ? Number(request.approvedAmount) : null,
    approvedAmountSetBy: request.approvedAmountSetBy ? {
      id: String(request.approvedAmountSetBy._id || request.approvedAmountSetBy),
      fullName: request.approvedAmountSetBy.fullName || '',
      role: request.approvedAmountSetBy.role || '',
    } : null,
    approvedAmountSetAt: request.approvedAmountSetAt || null,
    currency: request.currency || 'IQD',
    description: request.description || '',
    notes: request.notes || '',
    status,
    statusLabel: getFinancialStatusLabel(status),
    currentReviewerRole: request.currentReviewerRole || null,
    requiresGeneralManagerApproval: !!request.requiresGeneralManagerApproval,
    generalManagerRequestReason: request.generalManagerRequestReason || '',
    employeeRole: request.employeeRole || null,
    projectManagerStepSkipped: !!request.projectManagerStepSkipped,
    submittedAt: request.submittedAt || null,
    projectManagerApprovedAt: request.projectManagerApprovedAt || null,
    financiallyApprovedAt: request.financiallyApprovedAt || null,
    generalManagerApprovedAt: request.generalManagerApprovedAt || null,
    disbursedAt: request.disbursedAt || null,
    receivedAt: request.receivedAt || null,
    closedAt: request.closedAt || null,
    createdAt: request.createdAt || null,
    updatedAt: request.updatedAt || null,
    employee: request.employee ? {
      id: employeeId,
      fullName: request.employee.fullName || '',
      role: request.employee.role || '',
      level: Number(request.employee.level || 1),
      pointsTotal: Number(request.employee.pointsTotal || 0),
      avatarUrl: request.employee.avatarUrl || '',
      employeeCode: request.employee.employeeCode || '',
    } : null,
    projectManagerReviewer: request.projectManagerReviewer ? {
      id: projectManagerId,
      fullName: request.projectManagerReviewer.fullName || '',
      role: request.projectManagerReviewer.role || '',
    } : null,
    financialManagerReviewer: request.financialManagerReviewer ? {
      id: financialManagerId,
      fullName: request.financialManagerReviewer.fullName || '',
      role: request.financialManagerReviewer.role || '',
    } : null,
    generalManagerReviewer: request.generalManagerReviewer ? {
      id: generalManagerId,
      fullName: request.generalManagerReviewer.fullName || '',
      role: request.generalManagerReviewer.role || '',
    } : null,
    attachments: (request.attachments || []).map((attachment) => ({
      id: String(attachment._id || ''),
      url: attachment.url || '',
      originalName: attachment.originalName || '',
      mimeType: attachment.mimeType || '',
      size: Number(attachment.size || 0),
      uploadedAt: attachment.uploadedAt || null,
      uploadedBy: attachment.uploadedBy ? {
        id: String(attachment.uploadedBy._id || attachment.uploadedBy),
        fullName: attachment.uploadedBy.fullName || '',
        role: attachment.uploadedBy.role || '',
      } : null,
    })),
    workflowTrail: (request.workflowTrail || []).map((entry) => ({
      id: String(entry._id || ''),
      action: entry.action || '',
      actor: entry.actor ? {
        id: String(entry.actor._id || entry.actor),
        fullName: entry.actor.fullName || '',
        role: entry.actor.role || entry.actorRole || '',
      } : null,
      actorRole: entry.actorRole || entry.actor?.role || '',
      beforeStatus: entry.beforeStatus || '',
      beforeStatusLabel: getFinancialStatusLabel(entry.beforeStatus || ''),
      afterStatus: entry.afterStatus || '',
      afterStatusLabel: getFinancialStatusLabel(entry.afterStatus || ''),
      notes: entry.notes || '',
      occurredAt: entry.occurredAt || null,
    })),
    pointsEvents: (request.pointsEvents || []).map((entry) => ({
      id: String(entry._id || ''),
      eventKey: entry.eventKey || '',
      points: Number(entry.points || 0),
      reason: entry.reason || '',
      appliedAt: entry.appliedAt || null,
      ledgerId: String(entry.ledger?._id || entry.ledger || ''),
    })),
    pointsImpact: sumPointEvents(request),
    awaitingReceiptConfirmation: status === FinancialDisbursementStatus.DISBURSED,
    canEdit:
      currentUserId === employeeId
      && [FinancialDisbursementStatus.DRAFT, FinancialDisbursementStatus.RETURNED_FOR_REVIEW].includes(status)
      && !request.projectManagerApprovedAt
      && !request.financiallyApprovedAt
      && !request.generalManagerApprovedAt,
    canSubmit:
      currentUserId === employeeId
      && [FinancialDisbursementStatus.DRAFT, FinancialDisbursementStatus.RETURNED_FOR_REVIEW].includes(status)
      && !request.projectManagerApprovedAt
      && !request.financiallyApprovedAt
      && !request.generalManagerApprovedAt,
    canReviewAsProjectManager:
      !request.projectManagerStepSkipped
      && currentUserId === projectManagerId
      && status === FinancialDisbursementStatus.PENDING_PROJECT_MANAGER_APPROVAL,
    canReviewAsFinancialManager:
      currentUserId === financialManagerId
      && status === FinancialDisbursementStatus.PENDING_FINANCIAL_MANAGER_APPROVAL,
    canRequestGeneralManager:
      currentUserId === financialManagerId
      && status === FinancialDisbursementStatus.PENDING_FINANCIAL_MANAGER_APPROVAL
      && canEscalateFinancialRequest(currentUser || {}),
    canReviewAsGeneralManager:
      (currentUserId === generalManagerId || currentUser?.role === Roles.GENERAL_MANAGER)
      && status === FinancialDisbursementStatus.PENDING_GENERAL_MANAGER_APPROVAL,
    canDeliverFunds:
      currentUserId === financialManagerId
      && status === FinancialDisbursementStatus.READY_FOR_DISBURSEMENT,
    canConfirmReceipt:
      currentUserId === employeeId
      && status === FinancialDisbursementStatus.DISBURSED,
  };
};

const resolveCurrentReviewers = async (employeeId, employeeRole) => {
  const users = await userRepository.listForManagement({ includeManager: true, includeInactive: false });
  const chain = resolveApprovalChain({
    employeeId,
    employeeRole,
    users,
  });

  if (!chain.skipProjectManager && !chain.projectManagerId) {
    throw new AppError('No active project manager found for this request', 409);
  }

  if (!chain.skipFinancialManager && !chain.financialManagerId) {
    throw new AppError('No active financial manager found for this request', 409);
  }

  if (chain.skipProjectManager && chain.skipFinancialManager && !chain.generalManagerId) {
    throw new AppError('No active general manager found for this request', 409);
  }

  return chain;
};

const applyPointEvents = async ({
  request,
  events = [],
  actorId,
  req,
}) => {
  let updatedRequest = request;

  for (const event of events) {
    const eventKey = String(event.eventKey || '').trim().toUpperCase();
    if (!eventKey) {
      continue;
    }

    const alreadyApplied = (updatedRequest.pointsEvents || []).some(
      (entry) => String(entry.eventKey || '').toUpperCase() === eventKey,
    );
    if (alreadyApplied) {
      continue;
    }

    const pointsResult = await financialDisbursementPointsService.applyPoints({
      userId: updatedRequest.employee?._id || updatedRequest.employee,
      points: Number(event.points || 0),
      reason: event.reason,
      actorId,
      sourceAction: eventKey,
      metadata: {
        requestId: String(updatedRequest._id),
        requestNo: updatedRequest.requestNo,
        requestType: updatedRequest.requestType,
      },
      req,
    });

    if (!pointsResult.applied || !pointsResult.ledger) {
      continue;
    }

    updatedRequest = await financialDisbursementRepository.addPointsEvent(updatedRequest._id, {
      eventKey,
      points: pointsResult.points,
      reason: event.reason,
      ledger: pointsResult.ledger._id,
      appliedBy: actorId,
      appliedAt: new Date(),
      metadata: event.metadata || null,
    });

    await auditService.log({
      actorId,
      action: 'FINANCIAL_REQUEST_POINTS_APPLIED',
      entityType: 'FINANCIAL_DISBURSEMENT',
      entityId: updatedRequest._id,
      after: {
        requestNo: updatedRequest.requestNo,
        eventKey,
        points: pointsResult.points,
        reason: event.reason,
      },
      req,
    });
  }

  return updatedRequest;
};

const notifyStatusUpdate = async ({
  request,
  previousStatus = '',
  action = '',
  titleAr,
  messageAr,
  recipients = [],
}) =>
  notificationService.notifyFinancialRequestStatus(recipients, {
    requestId: String(request._id),
    requestNo: request.requestNo,
    status: request.status,
    previousStatus,
    amount: request.amount,
    action,
    titleAr,
    messageAr,
  });

const buildRequestPayload = ({
  body = {},
  attachments = [],
  existingRequest = null,
}) => {
  const requestType = normalizeType(body.requestType || existingRequest?.requestType);
  const amount = toPositiveAmount(body.amount ?? existingRequest?.amount);
  const currency = toCleanString(body.currency || existingRequest?.currency || 'IQD').toUpperCase() || 'IQD';
  const description = toCleanString(body.description || existingRequest?.description);
  const notes = toCleanString(body.notes || existingRequest?.notes);
  const transactionDate = body.transactionDate
    ? new Date(body.transactionDate)
    : (existingRequest?.transactionDate || null);

  if (!description) {
    throw new AppError('description is required', 400);
  }

  const mergedAttachments = [
    ...(existingRequest?.attachments || []).map((item) => (item.toObject ? item.toObject() : item)),
    ...attachments,
  ];

  return {
    requestType,
    amount,
    currency,
    description,
    notes,
    attachments: mergedAttachments,
    transactionDate,
  };
};

export const listFinancialDisbursements = asyncHandler(async (req, res) => {
  const filter = buildAccessibleFilter(req);

  if (req.query.status) {
    filter.status = String(req.query.status || '').toUpperCase();
  }

  if (String(req.query.mine || '').toLowerCase() === 'true') {
    filter.employee = req.user.id;
  }

  const requests = await financialDisbursementRepository.list(filter);
  res.json({
    requests: requests.map((request) => serializeRequest(request, req.user)),
  });
});

export const financialDisbursementSummary = asyncHandler(async (req, res) => {
  const requests = await financialDisbursementRepository.list(buildAccessibleFilter(req));
  const serialized = requests.map((request) => serializeRequest(request, req.user));

  res.json({
    summary: summarizeFinancialRequests(serialized),
    readyForDisbursement: serialized
      .filter((request) => request.status === FinancialDisbursementStatus.READY_FOR_DISBURSEMENT)
      .slice(0, 10),
    recentlyClosed: serialized
      .filter((request) => request.status === FinancialDisbursementStatus.CLOSED)
      .slice(0, 10),
  });
});

export const createFinancialDisbursement = asyncHandler(async (req, res) => {
  if (!canCreateFinancialRequest(req.user)) {
    throw new AppError('Insufficient permissions', 403);
  }

  const submitNow = toBoolean(req.body.submitNow);
  const uploadedAttachments = (Array.isArray(req.files) ? req.files : []).map((file) =>
    serializeAttachment(file, req.user.id),
  );
  const batchItems = parseBatchRequests(req.body.requests);
  const isBatchCreate = batchItems.length > 0;

  if (isBatchCreate && batchItems.length > 25) {
    throw new AppError('Too many requests in one transaction', 400);
  }

  const payloads = isBatchCreate
    ? batchItems.map((item) =>
        buildRequestPayload({
          body: {
            ...(item || {}),
            currency: item?.currency || req.body.currency,
          },
          attachments: uploadedAttachments,
        }))
    : [
        buildRequestPayload({
          body: req.body,
          attachments: uploadedAttachments,
        }),
      ];

  const reviewers = submitNow
    ? await resolveCurrentReviewers(req.user.id, req.user.role)
    : {
        projectManagerId: null,
        financialManagerId: null,
        generalManagerId: null,
        skipProjectManager: false,
        skipFinancialManager: false,
        initialStatus: null,
        initialReviewerRole: null,
      };
  const transactionNo = payloads.length > 1
    ? await sequenceService.next('FINANCIAL_DISBURSEMENT_TRANSACTION', { prefix: 'FDT', digits: 5 })
    : null;
  const transactionDate = payloads[0]?.transactionDate || new Date();
  const transactionTotalAmount = payloads.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const initialStatus = submitNow
    ? reviewers.initialStatus
    : FinancialDisbursementStatus.DRAFT;

  const createdRequests = [];

  for (const payload of payloads) {
    const requestNo = await sequenceService.next('FINANCIAL_DISBURSEMENT', { prefix: 'FD', digits: 5 });
    const requiresGeneralManagerApproval = shouldRequireGeneralManagerApproval({
      amount: payload.amount,
      requestType: payload.requestType,
    });

    let request = await financialDisbursementRepository.create({
      requestNo,
      transactionNo,
      transactionDate,
      transactionTotalAmount,
      employee: req.user.id,
      ...payload,
      status: initialStatus,
      currentReviewerRole: submitNow ? reviewers.initialReviewerRole : null,
      projectManagerReviewer: reviewers.projectManagerId || null,
      financialManagerReviewer: reviewers.financialManagerId || null,
      generalManagerReviewer: reviewers.generalManagerId || null,
      requiresGeneralManagerApproval,
      employeeRole: req.user.role,
      projectManagerStepSkipped: !!reviewers.skipProjectManager,
      submittedAt: submitNow ? new Date() : null,
      workflowTrail: [
        buildWorkflowEntry({
          action: submitNow ? FinancialWorkflowAction.SUBMIT : FinancialWorkflowAction.SAVE_DRAFT,
          actorId: req.user.id,
          actorRole: req.user.role,
          beforeStatus: null,
          afterStatus: initialStatus,
          notes: payload.notes,
        }),
      ],
    });

    if (submitNow) {
      request = await applyPointEvents({
        request,
        events: buildSubmissionPointEvents({
          requestType: request.requestType,
          attachmentCount: request.attachments.length,
        }),
        actorId: req.user.id,
        req,
      });

      await notificationService.notifyFinancialRequestAssigned(
        [reviewers.skipProjectManager ? reviewers.generalManagerId : reviewers.projectManagerId, req.user.id],
        {
          requestId: String(request._id),
          requestNo: request.requestNo,
          status: request.status,
          stage: reviewers.skipProjectManager ? 'GENERAL_MANAGER' : 'PROJECT_MANAGER',
          amount: request.amount,
          titleAr: reviewers.skipProjectManager
            ? 'طلب صرف بانتظار اعتماد المدير العام'
            : 'طلب صرف بانتظار اعتماد مدير المشاريع',
          messageAr: reviewers.skipProjectManager
            ? `تم إرسال طلب الصرف ${request.requestNo} مباشرة إلى المدير العام للاعتماد.`
            : `تم إرسال طلب الصرف ${request.requestNo} وبات بانتظار اعتماد مدير المشاريع.`,
        },
      );
    }

    await auditService.log({
      actorId: req.user.id,
      action: submitNow ? 'FINANCIAL_REQUEST_SUBMITTED' : 'FINANCIAL_REQUEST_CREATED',
      entityType: 'FINANCIAL_DISBURSEMENT',
      entityId: request._id,
      after: {
        requestNo: request.requestNo,
        transactionNo: request.transactionNo,
        transactionDate: request.transactionDate,
        transactionTotalAmount: request.transactionTotalAmount,
        status: request.status,
        amount: request.amount,
        requestType: request.requestType,
        attachmentsCount: request.attachments.length,
      },
      req,
    });

    createdRequests.push(request);
  }

  if (createdRequests.length === 1) {
    return res.status(201).json({ request: serializeRequest(createdRequests[0], req.user) });
  }

  return res.status(201).json({
    transactionNo,
    transactionDate,
    transactionTotalAmount,
    requests: createdRequests.map((request) => serializeRequest(request, req.user)),
  });
});

export const updateFinancialDisbursement = asyncHandler(async (req, res) => {
  const request = await financialDisbursementRepository.findById(req.params.id);
  if (!request) {
    throw new AppError('Financial request not found', 404);
  }

  ensureReadableRequest(req, request);
  if (!canEditRequest(req, request)) {
    throw new AppError('This request cannot be edited', 409);
  }

  const uploadedAttachments = (Array.isArray(req.files) ? req.files : []).map((file) =>
    serializeAttachment(file, req.user.id),
  );
  const payload = buildRequestPayload({
    body: req.body,
    attachments: uploadedAttachments,
    existingRequest: request,
  });
  let reviewers = {
    projectManagerId: request.projectManagerReviewer?._id || request.projectManagerReviewer || null,
    financialManagerId: request.financialManagerReviewer?._id || request.financialManagerReviewer || null,
    generalManagerId: request.generalManagerReviewer?._id || request.generalManagerReviewer || null,
  };

  try {
    reviewers = await resolveCurrentReviewers(req.user.id, req.user.role);
  } catch (error) {
    if (request.status !== FinancialDisbursementStatus.DRAFT) {
      throw error;
    }
  }
  const requiresGeneralManagerApproval = shouldRequireGeneralManagerApproval({
    amount: payload.amount,
    requestType: payload.requestType,
  });

  const updatedRequest = await financialDisbursementRepository.updateById(request._id, {
    ...payload,
    projectManagerReviewer: reviewers.projectManagerId || null,
    financialManagerReviewer: reviewers.financialManagerId || null,
    generalManagerReviewer: reviewers.generalManagerId || null,
    requiresGeneralManagerApproval,
    $push: {
      workflowTrail: buildWorkflowEntry({
        action: 'UPDATE',
        actorId: req.user.id,
        actorRole: req.user.role,
        beforeStatus: request.status,
        afterStatus: request.status,
        notes: toCleanString(req.body.notes || request.notes),
      }),
    },
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'FINANCIAL_REQUEST_UPDATED',
    entityType: 'FINANCIAL_DISBURSEMENT',
    entityId: request._id,
    before: {
      status: request.status,
      amount: request.amount,
      requestType: request.requestType,
      attachmentsCount: request.attachments.length,
    },
    after: {
      status: updatedRequest.status,
      amount: updatedRequest.amount,
      requestType: updatedRequest.requestType,
      attachmentsCount: updatedRequest.attachments.length,
    },
    req,
  });

  res.json({ request: serializeRequest(updatedRequest, req.user) });
});

export const submitFinancialDisbursement = asyncHandler(async (req, res) => {
  const request = await financialDisbursementRepository.findById(req.params.id);
  if (!request) {
    throw new AppError('Financial request not found', 404);
  }

  ensureReadableRequest(req, request);
  if (!canEditRequest(req, request)) {
    throw new AppError('This request cannot be submitted', 409);
  }

  const reviewers = await resolveCurrentReviewers(req.user.id, req.user.role);
  const previousStatus = request.status;

  let updatedRequest = await financialDisbursementRepository.updateById(request._id, {
    status: reviewers.initialStatus,
    currentReviewerRole: reviewers.initialReviewerRole,
    projectManagerReviewer: reviewers.projectManagerId || null,
    financialManagerReviewer: reviewers.financialManagerId || null,
    generalManagerReviewer: reviewers.generalManagerId || null,
    employeeRole: req.user.role,
    projectManagerStepSkipped: !!reviewers.skipProjectManager,
    requiresGeneralManagerApproval: reviewers.skipProjectManager
      ? true
      : shouldRequireGeneralManagerApproval({
        amount: request.amount,
        requestType: request.requestType,
      }),
    submittedAt: request.submittedAt || new Date(),
    $push: {
      workflowTrail: buildWorkflowEntry({
        action: FinancialWorkflowAction.SUBMIT,
        actorId: req.user.id,
        actorRole: req.user.role,
        beforeStatus: previousStatus,
        afterStatus: reviewers.initialStatus,
        notes: toCleanString(req.body.notes),
      }),
    },
  });

  updatedRequest = await applyPointEvents({
    request: updatedRequest,
    events: buildSubmissionPointEvents({
      requestType: updatedRequest.requestType,
      attachmentCount: updatedRequest.attachments.length,
    }),
    actorId: req.user.id,
    req,
  });

  await notificationService.notifyFinancialRequestAssigned(
    [reviewers.skipProjectManager ? reviewers.generalManagerId : reviewers.projectManagerId, req.user.id],
    {
      requestId: String(updatedRequest._id),
      requestNo: updatedRequest.requestNo,
      status: updatedRequest.status,
      stage: reviewers.skipProjectManager ? 'GENERAL_MANAGER' : 'PROJECT_MANAGER',
      amount: updatedRequest.amount,
      titleAr: reviewers.skipProjectManager
        ? 'طلب صرف بانتظار اعتماد المدير العام'
        : 'تم إرسال طلب صرف مالي',
      messageAr: reviewers.skipProjectManager
        ? `تم إرسال طلب الصرف ${updatedRequest.requestNo} مباشرة إلى المدير العام للاعتماد.`
        : `تم إرسال طلب الصرف ${updatedRequest.requestNo} إلى مدير المشاريع للمراجعة.`,
    },
  );

  await auditService.log({
    actorId: req.user.id,
    action: 'FINANCIAL_REQUEST_SUBMITTED',
    entityType: 'FINANCIAL_DISBURSEMENT',
    entityId: request._id,
    before: {
      status: previousStatus,
    },
    after: {
      status: updatedRequest.status,
    },
    req,
  });

  res.json({ request: serializeRequest(updatedRequest, req.user) });
});

const assertProjectManagerReview = (req, request) => {
  if (!canReviewFinancialRequest(req.user)) {
    throw new AppError('Insufficient permissions', 403);
  }

  if (request.status !== FinancialDisbursementStatus.PENDING_PROJECT_MANAGER_APPROVAL) {
    throw new AppError('Request is not pending project manager approval', 409);
  }

  if (String(request.projectManagerReviewer?._id || request.projectManagerReviewer) !== String(req.user.id)) {
    throw new AppError('Request is not assigned to you', 403);
  }
};

const assertFinancialManagerReview = (req, request) => {
  if (!canReviewFinancialRequest(req.user)) {
    throw new AppError('Insufficient permissions', 403);
  }

  if (request.status !== FinancialDisbursementStatus.PENDING_FINANCIAL_MANAGER_APPROVAL) {
    throw new AppError('Request is not pending financial manager approval', 409);
  }

  if (String(request.financialManagerReviewer?._id || request.financialManagerReviewer) !== String(req.user.id)) {
    throw new AppError('Request is not assigned to you', 403);
  }
};

const assertGeneralManagerReview = (req, request) => {
  if (req.user.role !== Roles.GENERAL_MANAGER) {
    throw new AppError('Only general manager can review this stage', 403);
  }

  if (request.status !== FinancialDisbursementStatus.PENDING_GENERAL_MANAGER_APPROVAL) {
    throw new AppError('Request is not pending general manager approval', 409);
  }
};

export const reviewFinancialDisbursementAsProjectManager = asyncHandler(async (req, res) => {
  const request = await financialDisbursementRepository.findById(req.params.id);
  if (!request) {
    throw new AppError('Financial request not found', 404);
  }

  ensureReadableRequest(req, request);
  assertProjectManagerReview(req, request);

  const action = toCleanString(req.body.action).toUpperCase();
  const notes = toCleanString(req.body.notes || req.body.comment);
  const previousStatus = request.status;
  const approvedAmount = action === FinancialWorkflowAction.APPROVE
    ? parseApprovedAmount(req.body.approvedAmount, request.amount)
    : null;

  if (![
    FinancialWorkflowAction.APPROVE,
    FinancialWorkflowAction.REJECT,
    FinancialWorkflowAction.RETURN_FOR_REVIEW,
  ].includes(action)) {
    throw new AppError('Invalid project manager action', 400);
  }

  const nextStatus =
    action === FinancialWorkflowAction.APPROVE
      ? FinancialDisbursementStatus.PENDING_FINANCIAL_MANAGER_APPROVAL
      : action === FinancialWorkflowAction.REJECT
        ? FinancialDisbursementStatus.REJECTED_BY_PROJECT_MANAGER
        : FinancialDisbursementStatus.RETURNED_FOR_REVIEW;
  const currentReviewerRole =
    action === FinancialWorkflowAction.APPROVE
      ? Roles.FINANCIAL_MANAGER
      : action === FinancialWorkflowAction.RETURN_FOR_REVIEW
        ? 'EMPLOYEE'
        : null;

  const amountNotes = approvedAmount != null && approvedAmount !== request.amount
    ? `تم تعديل المبلغ من ${request.amount} إلى ${approvedAmount}`
    : '';
  const combinedNotes = [notes, amountNotes].filter(Boolean).join(' | ');

  const updatedRequest = await financialDisbursementRepository.updateById(request._id, {
    status: nextStatus,
    currentReviewerRole,
    projectManagerApprovedAt: action === FinancialWorkflowAction.APPROVE ? new Date() : request.projectManagerApprovedAt,
    ...(approvedAmount != null ? {
      approvedAmount,
      approvedAmountSetBy: req.user.id,
      approvedAmountSetAt: new Date(),
    } : {}),
    $push: {
      workflowTrail: buildWorkflowEntry({
        action,
        actorId: req.user.id,
        actorRole: req.user.role,
        beforeStatus: previousStatus,
        afterStatus: nextStatus,
        notes: combinedNotes,
      }),
    },
  });

  const recipients = [updatedRequest.employee?._id || updatedRequest.employee];
  if (action === FinancialWorkflowAction.APPROVE) {
    recipients.push(updatedRequest.financialManagerReviewer?._id || updatedRequest.financialManagerReviewer);
    await notificationService.notifyFinancialRequestAssigned(recipients, {
      requestId: String(updatedRequest._id),
      requestNo: updatedRequest.requestNo,
      status: updatedRequest.status,
      stage: 'FINANCIAL_MANAGER',
      amount: updatedRequest.amount,
      titleAr: 'تم اعتماد الطلب من مدير المشاريع',
      messageAr: `تم اعتماد طلب الصرف ${updatedRequest.requestNo} من مدير المشاريع وتحويله إلى المدير المالي.`,
    });
  } else {
    await notifyStatusUpdate({
      request: updatedRequest,
      previousStatus,
      action,
      recipients,
      titleAr: action === FinancialWorkflowAction.REJECT ? 'رفض طلب صرف مالي' : 'إعادة طلب صرف للمراجعة',
      messageAr:
        action === FinancialWorkflowAction.REJECT
          ? `تم رفض طلب الصرف ${updatedRequest.requestNo} من مدير المشاريع.`
          : `تمت إعادة طلب الصرف ${updatedRequest.requestNo} للمراجعة.`,
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action:
      action === FinancialWorkflowAction.APPROVE
        ? 'FINANCIAL_REQUEST_PROJECT_MANAGER_APPROVED'
        : action === FinancialWorkflowAction.REJECT
          ? 'FINANCIAL_REQUEST_PROJECT_MANAGER_REJECTED'
          : 'FINANCIAL_REQUEST_PROJECT_MANAGER_RETURNED',
    entityType: 'FINANCIAL_DISBURSEMENT',
    entityId: request._id,
    before: {
      status: previousStatus,
      notes,
    },
    after: {
      status: nextStatus,
      notes,
    },
    req,
  });

  res.json({ request: serializeRequest(updatedRequest, req.user) });
});

export const reviewFinancialDisbursementAsFinancialManager = asyncHandler(async (req, res) => {
  const request = await financialDisbursementRepository.findById(req.params.id);
  if (!request) {
    throw new AppError('Financial request not found', 404);
  }

  ensureReadableRequest(req, request);
  assertFinancialManagerReview(req, request);

  let action = toCleanString(req.body.action).toUpperCase();
  const notes = toCleanString(req.body.notes || req.body.comment);
  const previousStatus = request.status;
  const approvedAmount = (action === FinancialWorkflowAction.APPROVE || action === FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL)
    ? parseApprovedAmount(req.body.approvedAmount, request.amount)
    : null;
  const mustEscalate = shouldRequireGeneralManagerApproval({
    amount: request.amount,
    requestType: request.requestType,
    forceGeneralManagerApproval: toBoolean(req.body.forceGeneralManagerApproval),
  });

  if (![
    FinancialWorkflowAction.APPROVE,
    FinancialWorkflowAction.REJECT,
    FinancialWorkflowAction.RETURN_FOR_REVIEW,
    FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL,
  ].includes(action)) {
    throw new AppError('Invalid financial manager action', 400);
  }

  if (
    action === FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL
    && !canEscalateFinancialRequest(req.user)
  ) {
    throw new AppError('You cannot escalate this request to the general manager', 403);
  }

  if (action === FinancialWorkflowAction.APPROVE && mustEscalate) {
    action = FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL;
  }

  const nextStatus =
    action === FinancialWorkflowAction.APPROVE
      ? FinancialDisbursementStatus.READY_FOR_DISBURSEMENT
      : action === FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL
        ? FinancialDisbursementStatus.PENDING_GENERAL_MANAGER_APPROVAL
        : action === FinancialWorkflowAction.REJECT
          ? FinancialDisbursementStatus.REJECTED_BY_FINANCIAL_MANAGER
          : FinancialDisbursementStatus.RETURNED_FOR_REVIEW;
  const currentReviewerRole =
    action === FinancialWorkflowAction.APPROVE
      ? Roles.FINANCIAL_MANAGER
      : action === FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL
        ? Roles.GENERAL_MANAGER
        : action === FinancialWorkflowAction.RETURN_FOR_REVIEW
          ? 'EMPLOYEE'
          : null;

  if (action === FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL && !request.generalManagerReviewer) {
    throw new AppError('No general manager available for escalation', 409);
  }

  const fmAmountNotes = approvedAmount != null && approvedAmount !== request.amount
    ? `تم تعديل المبلغ من ${request.amount} إلى ${approvedAmount}`
    : '';
  const fmCombinedNotes = [notes, fmAmountNotes].filter(Boolean).join(' | ');

  let updatedRequest = await financialDisbursementRepository.updateById(request._id, {
    status: nextStatus,
    currentReviewerRole,
    financiallyApprovedAt:
      action === FinancialWorkflowAction.APPROVE
      || action === FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL
        ? new Date()
        : request.financiallyApprovedAt,
    ...(approvedAmount != null ? {
      approvedAmount,
      approvedAmountSetBy: req.user.id,
      approvedAmountSetAt: new Date(),
    } : {}),
    requiresGeneralManagerApproval:
      action === FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL
        ? true
        : request.requiresGeneralManagerApproval,
    generalManagerRequestReason:
      action === FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL
        ? notes || 'Escalated by financial manager'
        : request.generalManagerRequestReason,
    $push: {
      workflowTrail: buildWorkflowEntry({
        action,
        actorId: req.user.id,
        actorRole: req.user.role,
        beforeStatus: previousStatus,
        afterStatus: nextStatus,
        notes: fmCombinedNotes,
      }),
    },
  });

  if (action === FinancialWorkflowAction.APPROVE) {
    updatedRequest = await applyPointEvents({
      request: updatedRequest,
      events: buildApprovalPointEvents(),
      actorId: req.user.id,
      req,
    });
  }

  const recipients = [updatedRequest.employee?._id || updatedRequest.employee];

  if (action === FinancialWorkflowAction.APPROVE) {
    recipients.push(updatedRequest.financialManagerReviewer?._id || updatedRequest.financialManagerReviewer);
    await notifyStatusUpdate({
      request: updatedRequest,
      previousStatus,
      action,
      recipients,
      titleAr: 'الطلب جاهز لتسليم المبلغ',
      messageAr: `تم اعتماد طلب الصرف ${updatedRequest.requestNo} ماليا وهو الآن جاهز لتسليم المبلغ.`,
    });
  } else if (action === FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL) {
    recipients.push(updatedRequest.generalManagerReviewer?._id || updatedRequest.generalManagerReviewer);
    await notificationService.notifyFinancialRequestAssigned(recipients, {
      requestId: String(updatedRequest._id),
      requestNo: updatedRequest.requestNo,
      status: updatedRequest.status,
      stage: 'GENERAL_MANAGER',
      amount: updatedRequest.amount,
      titleAr: 'طلب صرف بانتظار اعتماد المدير العام',
      messageAr: `تم رفع طلب الصرف ${updatedRequest.requestNo} إلى المدير العام لاعتماده.`,
    });
  } else {
    await notifyStatusUpdate({
      request: updatedRequest,
      previousStatus,
      action,
      recipients,
      titleAr: action === FinancialWorkflowAction.REJECT ? 'رفض طلب صرف مالي' : 'إعادة طلب صرف للمراجعة',
      messageAr:
        action === FinancialWorkflowAction.REJECT
          ? `تم رفض طلب الصرف ${updatedRequest.requestNo} من المدير المالي.`
          : `تمت إعادة طلب الصرف ${updatedRequest.requestNo} إلى الموظف للمراجعة.`,
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action:
      action === FinancialWorkflowAction.APPROVE
        ? 'FINANCIAL_REQUEST_FINANCIAL_MANAGER_APPROVED'
        : action === FinancialWorkflowAction.REQUEST_GENERAL_MANAGER_APPROVAL
          ? 'FINANCIAL_REQUEST_GENERAL_MANAGER_REQUESTED'
          : action === FinancialWorkflowAction.REJECT
            ? 'FINANCIAL_REQUEST_FINANCIAL_MANAGER_REJECTED'
            : 'FINANCIAL_REQUEST_FINANCIAL_MANAGER_RETURNED',
    entityType: 'FINANCIAL_DISBURSEMENT',
    entityId: request._id,
    before: {
      status: previousStatus,
      notes,
    },
    after: {
      status: nextStatus,
      notes,
      requiresGeneralManagerApproval: updatedRequest.requiresGeneralManagerApproval,
    },
    req,
  });

  res.json({ request: serializeRequest(updatedRequest, req.user) });
});

export const reviewFinancialDisbursementAsGeneralManager = asyncHandler(async (req, res) => {
  const request = await financialDisbursementRepository.findById(req.params.id);
  if (!request) {
    throw new AppError('Financial request not found', 404);
  }

  ensureReadableRequest(req, request);
  assertGeneralManagerReview(req, request);

  const action = toCleanString(req.body.action).toUpperCase();
  const notes = toCleanString(req.body.notes || req.body.comment);
  const previousStatus = request.status;
  const approvedAmount = action === FinancialWorkflowAction.APPROVE
    ? parseApprovedAmount(req.body.approvedAmount, request.amount)
    : null;

  if (![
    FinancialWorkflowAction.APPROVE,
    FinancialWorkflowAction.REJECT,
    FinancialWorkflowAction.RETURN_FOR_REVIEW,
  ].includes(action)) {
    throw new AppError('Invalid general manager action', 400);
  }

  const nextStatus =
    action === FinancialWorkflowAction.APPROVE
      ? FinancialDisbursementStatus.READY_FOR_DISBURSEMENT
      : action === FinancialWorkflowAction.REJECT
        ? FinancialDisbursementStatus.REJECTED_BY_GENERAL_MANAGER
        : FinancialDisbursementStatus.RETURNED_FOR_REVIEW;
  const currentReviewerRole =
    action === FinancialWorkflowAction.APPROVE
      ? Roles.FINANCIAL_MANAGER
      : action === FinancialWorkflowAction.RETURN_FOR_REVIEW
        ? 'EMPLOYEE'
        : null;

  const gmAmountNotes = approvedAmount != null && approvedAmount !== request.amount
    ? `تم تعديل المبلغ من ${request.amount} إلى ${approvedAmount}`
    : '';
  const gmCombinedNotes = [notes, gmAmountNotes].filter(Boolean).join(' | ');

  let updatedRequest = await financialDisbursementRepository.updateById(request._id, {
    status: nextStatus,
    currentReviewerRole,
    generalManagerApprovedAt:
      action === FinancialWorkflowAction.APPROVE
        ? new Date()
        : request.generalManagerApprovedAt,
    ...(approvedAmount != null ? {
      approvedAmount,
      approvedAmountSetBy: req.user.id,
      approvedAmountSetAt: new Date(),
    } : {}),
    $push: {
      workflowTrail: buildWorkflowEntry({
        action,
        actorId: req.user.id,
        actorRole: req.user.role,
        beforeStatus: previousStatus,
        afterStatus: nextStatus,
        notes: gmCombinedNotes,
      }),
    },
  });

  if (action === FinancialWorkflowAction.APPROVE) {
    updatedRequest = await applyPointEvents({
      request: updatedRequest,
      events: buildApprovalPointEvents(),
      actorId: req.user.id,
      req,
    });
  }

  await notifyStatusUpdate({
    request: updatedRequest,
    previousStatus,
    action,
    recipients: [
      updatedRequest.employee?._id || updatedRequest.employee,
      updatedRequest.financialManagerReviewer?._id || updatedRequest.financialManagerReviewer,
    ],
    titleAr:
      action === FinancialWorkflowAction.APPROVE
        ? 'اعتماد المدير العام لطلب الصرف'
        : action === FinancialWorkflowAction.REJECT
          ? 'رفض المدير العام لطلب الصرف'
          : 'إعادة طلب الصرف للمراجعة',
    messageAr:
      action === FinancialWorkflowAction.APPROVE
        ? `تم اعتماد طلب الصرف ${updatedRequest.requestNo} من المدير العام وعاد إلى المدير المالي لإكمال التسليم.`
        : action === FinancialWorkflowAction.REJECT
          ? `تم رفض طلب الصرف ${updatedRequest.requestNo} من المدير العام.`
          : `تمت إعادة طلب الصرف ${updatedRequest.requestNo} للمراجعة من المدير العام.`,
  });

  await auditService.log({
    actorId: req.user.id,
    action:
      action === FinancialWorkflowAction.APPROVE
        ? 'FINANCIAL_REQUEST_GENERAL_MANAGER_APPROVED'
        : action === FinancialWorkflowAction.REJECT
          ? 'FINANCIAL_REQUEST_GENERAL_MANAGER_REJECTED'
          : 'FINANCIAL_REQUEST_GENERAL_MANAGER_RETURNED',
    entityType: 'FINANCIAL_DISBURSEMENT',
    entityId: request._id,
    before: {
      status: previousStatus,
      notes,
    },
    after: {
      status: nextStatus,
      notes,
    },
    req,
  });

  res.json({ request: serializeRequest(updatedRequest, req.user) });
});

export const deliverFinancialDisbursement = asyncHandler(async (req, res) => {
  const request = await financialDisbursementRepository.findById(req.params.id);
  if (!request) {
    throw new AppError('Financial request not found', 404);
  }

  ensureReadableRequest(req, request);

  if (!canDisburseFinancialFunds(req.user)) {
    throw new AppError('Insufficient permissions', 403);
  }

  if (request.status !== FinancialDisbursementStatus.READY_FOR_DISBURSEMENT) {
    throw new AppError('Request is not ready for disbursement', 409);
  }

  if (String(request.financialManagerReviewer?._id || request.financialManagerReviewer) !== String(req.user.id)) {
    throw new AppError('Only assigned financial manager can deliver funds', 403);
  }

  const notes = toCleanString(req.body.notes || req.body.comment);
  const previousStatus = request.status;

  const updatedRequest = await financialDisbursementRepository.updateById(request._id, {
    status: FinancialDisbursementStatus.DISBURSED,
    currentReviewerRole: 'EMPLOYEE',
    disbursedAt: new Date(),
    $push: {
      workflowTrail: buildWorkflowEntry({
        action: FinancialWorkflowAction.DELIVER_FUNDS,
        actorId: req.user.id,
        actorRole: req.user.role,
        beforeStatus: previousStatus,
        afterStatus: FinancialDisbursementStatus.DISBURSED,
        notes,
      }),
    },
  });

  await notifyStatusUpdate({
    request: updatedRequest,
    previousStatus,
    action: FinancialWorkflowAction.DELIVER_FUNDS,
    recipients: [
      updatedRequest.employee?._id || updatedRequest.employee,
      updatedRequest.financialManagerReviewer?._id || updatedRequest.financialManagerReviewer,
    ],
    titleAr: 'تم تسليم مبلغ الطلب',
    messageAr: `تم تسليم مبلغ طلب الصرف ${updatedRequest.requestNo} وبات بانتظار تأكيد الاستلام من الموظف.`,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'FINANCIAL_REQUEST_DISBURSED',
    entityType: 'FINANCIAL_DISBURSEMENT',
    entityId: request._id,
    before: {
      status: previousStatus,
      notes,
    },
    after: {
      status: updatedRequest.status,
      notes,
    },
    req,
  });

  res.json({ request: serializeRequest(updatedRequest, req.user) });
});

export const confirmFinancialDisbursementReceipt = asyncHandler(async (req, res) => {
  const request = await financialDisbursementRepository.findById(req.params.id);
  if (!request) {
    throw new AppError('Financial request not found', 404);
  }

  ensureReadableRequest(req, request);

  if (String(request.employee?._id || request.employee) !== String(req.user.id)) {
    throw new AppError('Only request owner can confirm receipt', 403);
  }

  if (request.status !== FinancialDisbursementStatus.DISBURSED) {
    throw new AppError('Request is not awaiting receipt confirmation', 409);
  }

  const notes = toCleanString(req.body.notes || req.body.comment);
  const previousStatus = request.status;

  let updatedRequest = await financialDisbursementRepository.updateById(request._id, {
    status: FinancialDisbursementStatus.CLOSED,
    currentReviewerRole: null,
    receivedAt: new Date(),
    closedAt: new Date(),
    $push: {
      workflowTrail: buildWorkflowEntry({
        action: FinancialWorkflowAction.CONFIRM_RECEIPT,
        actorId: req.user.id,
        actorRole: req.user.role,
        beforeStatus: previousStatus,
        afterStatus: FinancialDisbursementStatus.CLOSED,
        notes,
      }),
    },
  });

  updatedRequest = await applyPointEvents({
    request: updatedRequest,
    events: buildClosurePointEvents({
      request: updatedRequest,
    }),
    actorId: req.user.id,
    req,
  });

  await notifyStatusUpdate({
    request: updatedRequest,
    previousStatus,
    action: FinancialWorkflowAction.CONFIRM_RECEIPT,
    recipients: [
      updatedRequest.employee?._id || updatedRequest.employee,
      updatedRequest.financialManagerReviewer?._id || updatedRequest.financialManagerReviewer,
    ],
    titleAr: 'تم تأكيد استلام مبلغ الطلب',
    messageAr: `أكد الموظف استلام مبلغ طلب الصرف ${updatedRequest.requestNo} وتم إغلاق المعاملة.`,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'FINANCIAL_REQUEST_RECEIPT_CONFIRMED',
    entityType: 'FINANCIAL_DISBURSEMENT',
    entityId: request._id,
    before: {
      status: previousStatus,
      notes,
    },
    after: {
      status: updatedRequest.status,
      notes,
    },
    req,
  });

  res.json({ request: serializeRequest(updatedRequest, req.user) });
});

export const getFinancialDisbursement = asyncHandler(async (req, res) => {
  const request = await financialDisbursementRepository.findById(req.params.id);
  if (!request) {
    throw new AppError('Financial request not found', 404);
  }

  ensureReadableRequest(req, request);
  res.json({ request: serializeRequest(request, req.user) });
});

export const exportFinancialDisbursementPdf = asyncHandler(async (req, res) => {
  const request = await financialDisbursementRepository.findById(req.params.id);
  if (!request) {
    throw new AppError('Financial request not found', 404);
  }

  ensureReadableRequest(req, request);

  const serialized = serializeRequest(request, req.user);
  const buffer = await buildFinancialDisbursementPdfBuffer({
    request: serialized,
    generatedAt: new Date(),
  });

  const filename = `financial-disbursement-${serialized.requestNo || req.params.id}.pdf`;
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  res.send(buffer);
});

const buildFinancialDisbursementWhatsappMessage = ({ request, detailsUrl }) => {
  const employeeName = request.employee?.fullName || '-';
  const typeLabel = request.requestType || '-';
  const approvedAmt = request.approvedAmount != null ? request.approvedAmount : request.amount;

  return [
    'إشعار صرف مالي - Delta Plus',
    `رقم الطلب: ${request.requestNo}`,
    `رقم المعاملة: ${request.transactionNo || '-'}`,
    `الموظف: ${employeeName}`,
    `نوع الصرف: ${typeLabel}`,
    `المبلغ المطلوب: ${request.amount} ${request.currency}`,
    request.approvedAmount != null ? `المبلغ المعتمد: ${approvedAmt} ${request.currency}` : '',
    `الحالة: ${request.statusLabel || request.status}`,
    detailsUrl ? `رابط التفاصيل: ${detailsUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

export const financialDisbursementWhatsappLink = asyncHandler(async (req, res) => {
  const request = await financialDisbursementRepository.findById(req.params.id);
  if (!request) {
    throw new AppError('Financial request not found', 404);
  }

  ensureReadableRequest(req, request);

  const serialized = serializeRequest(request, req.user);
  const employeeId = request.employee?._id || request.employee;
  const recipientPhone = await resolveRecipientPhone({
    userId: employeeId,
    fallback: '',
  });

  const detailsUrl = appDetailsUrl(`/financial-disbursements?requestId=${request._id}`);
  const message = buildFinancialDisbursementWhatsappMessage({ request: serialized, detailsUrl });

  if (!recipientPhone) {
    const directUrl = buildWhatsAppSendUrl('', message);
    return res.json({
      whatsapp: {
        recipient: '',
        url: directUrl,
        delivery: null,
        mode: 'MANUAL_LINK',
      },
    });
  }

  const whatsapp = await sendWhatsappOps({ to: recipientPhone, message });
  const directUrl = buildWhatsAppSendUrl(recipientPhone, message);

  res.json({
    whatsapp: {
      recipient: recipientPhone,
      url: whatsapp.url || directUrl,
      delivery: whatsapp.delivery,
      mode: whatsapp.delivery?.sent ? 'AUTO' : 'MANUAL_LINK',
    },
  });
});
