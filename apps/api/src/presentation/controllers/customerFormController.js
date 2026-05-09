import { CustomerRepository } from '../../infrastructure/db/repositories/CustomerRepository.js';
import { CustomerFormRequestRepository } from '../../infrastructure/db/repositories/CustomerFormRequestRepository.js';
import { auditService } from '../../application/services/auditService.js';
import {
  buildCustomerFormAttachment,
  buildCustomerPayloadFromForm,
  CustomerFormStatus,
  generateCustomerFormToken,
  normalizeCustomerFormPayload,
} from '../../application/services/customerFormService.js';
import { normalizePhone, toCleanString } from '../../application/services/customerService.js';
import { Roles } from '../../shared/constants.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const customerFormRepository = new CustomerFormRequestRepository();
const customerRepository = new CustomerRepository();

const toId = (value) => String(value?._id || value?.id || value || '').trim();
const actorLabel = (req) => req.user?.fullName || req.user?.name || 'مستخدم النظام';
const isAdmin = (user) => user?.role === Roles.GENERAL_MANAGER;
const isExpired = (request) => request?.expiresAt && new Date(request.expiresAt).getTime() < Date.now();

const normalizeRequestFiles = (req) => {
  if (Array.isArray(req.files)) return req.files;
  if (req.files && Array.isArray(req.files.attachments)) return req.files.attachments;
  return [];
};

const publicShape = (request) => ({
  id: toId(request),
  status: request.status,
  sentAt: request.sentAt,
  expiresAt: request.expiresAt,
  sentByName: request.sentByName,
});

const buildFormUrl = (req, token) => {
  const configuredOrigin = String(process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item && !item.includes('localhost'));
  const origin = configuredOrigin || `${req.protocol}://${req.get('host')}`.replace(/\/api$/, '');
  return `${origin.replace(/\/$/, '')}/customer-form/${token}`;
};

const findDuplicatesForRequest = async (request, excludeId = '') => customerRepository.findByContactNumbers(
  [request.data?.normalizedPhone, request.data?.normalizedWhatsapp],
  excludeId,
);

export const createCustomerFormLink = asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(60, Number(req.body.expiresInDays || 7)));
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const request = await customerFormRepository.create({
    token: generateCustomerFormToken(),
    status: CustomerFormStatus.NEW,
    sentBy: req.user.id,
    sentByName: actorLabel(req),
    sentAt: new Date(),
    expiresAt,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'CUSTOMER_FORM_LINK_CREATED',
    entityType: 'CUSTOMER_FORM_REQUEST',
    entityId: toId(request),
    after: { status: request.status, expiresAt },
    req,
  });

  res.status(201).json({ request, url: buildFormUrl(req, request.token) });
});

export const listCustomerFormRequests = asyncHandler(async (req, res) => {
  const filter = {};
  const status = toCleanString(req.query.status);
  if (status) filter.status = status;
  const requests = await customerFormRepository.list(filter, { limit: 500 });
  res.json({ requests });
});

export const getCustomerFormRequest = asyncHandler(async (req, res) => {
  const request = await customerFormRepository.findById(req.params.id);
  if (!request) throw new AppError('Customer form request not found', 404);
  const duplicateCustomers = await findDuplicatesForRequest(request);
  res.json({ request, duplicateCustomers });
});

export const updateCustomerFormRequest = asyncHandler(async (req, res) => {
  const request = await customerFormRepository.findById(req.params.id);
  if (!request) throw new AppError('Customer form request not found', 404);
  const data = normalizeCustomerFormPayload({ ...(request.data?.toObject?.() || request.data || {}), ...req.body });
  const duplicateCustomers = await customerRepository.findByContactNumbers([data.normalizedPhone, data.normalizedWhatsapp]);
  const updated = await customerFormRepository.updateById(req.params.id, {
    data,
    duplicateCustomers: duplicateCustomers.map((customer) => customer._id),
    status: request.status === CustomerFormStatus.NEW ? CustomerFormStatus.PENDING_REVIEW : request.status,
  });
  res.json({ request: updated, duplicateCustomers });
});

export const cancelCustomerFormRequest = asyncHandler(async (req, res) => {
  const request = await customerFormRepository.updateById(req.params.id, {
    status: CustomerFormStatus.CANCELLED,
    cancelledAt: new Date(),
    cancelledBy: req.user.id,
  });
  if (!request) throw new AppError('Customer form request not found', 404);
  res.json({ request });
});

export const rejectCustomerFormRequest = asyncHandler(async (req, res) => {
  const reason = toCleanString(req.body.reason);
  if (!reason) throw new AppError('Rejection reason is required', 400);
  const request = await customerFormRepository.updateById(req.params.id, {
    status: CustomerFormStatus.REJECTED,
    rejectionReason: reason,
    reviewedBy: req.user.id,
    reviewedByName: actorLabel(req),
    reviewedAt: new Date(),
  });
  if (!request) throw new AppError('Customer form request not found', 404);
  res.json({ request });
});

export const approveCustomerFormRequest = asyncHandler(async (req, res) => {
  const request = await customerFormRepository.findById(req.params.id);
  if (!request) throw new AppError('Customer form request not found', 404);
  if (!request.data?.customerName) throw new AppError('Customer name is required', 400);

  const duplicateCustomers = await findDuplicatesForRequest(request);
  const duplicateAction = toCleanString(req.body.duplicateAction || 'create');
  const existingCustomerId = toCleanString(req.body.existingCustomerId);
  let customer = null;

  if (duplicateCustomers.length && duplicateAction === 'create' && !isAdmin(req.user)) {
    res.status(409).json({
      message: 'هذا الزبون موجود مسبقاً',
      duplicateCustomers,
    });
    return;
  }

  if (duplicateAction === 'update') {
    if (!existingCustomerId) throw new AppError('Existing customer id is required', 400);
    const existingCustomer = await customerRepository.findById(existingCustomerId);
    if (!existingCustomer) throw new AppError('Existing customer not found', 404);
    const payload = buildCustomerPayloadFromForm(request, req.user);
    const updatePayload = {
      ...payload,
      createdBy: existingCustomer.createdBy,
      $push: {
        attachments: { $each: payload.attachments },
        formSubmissions: { $each: payload.formSubmissions },
      },
    };
    delete updatePayload.attachments;
    delete updatePayload.formSubmissions;
    customer = await customerRepository.updateById(existingCustomerId, updatePayload);
  } else {
    const payload = buildCustomerPayloadFromForm(request, req.user);
    customer = await customerRepository.create(payload);
  }

  const updated = await customerFormRepository.updateById(req.params.id, {
    status: CustomerFormStatus.SAVED_TO_CUSTOMERS,
    reviewedBy: req.user.id,
    reviewedByName: actorLabel(req),
    reviewedAt: new Date(),
    approvedAt: new Date(),
    savedCustomer: customer._id,
    duplicateCustomers: duplicateCustomers.map((item) => item._id),
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'CUSTOMER_FORM_APPROVED',
    entityType: 'CUSTOMER_FORM_REQUEST',
    entityId: toId(request),
    after: { customerId: toId(customer), status: updated.status },
    req,
  });

  res.json({ request: updated, customer, duplicateCustomers });
});

export const getPublicCustomerForm = asyncHandler(async (req, res) => {
  const request = await customerFormRepository.findByToken(req.params.token);
  if (!request) throw new AppError('رابط الاستمارة غير صحيح', 404);
  if (request.status === CustomerFormStatus.CANCELLED) throw new AppError('تم إلغاء رابط الاستمارة', 410);
  if (isExpired(request)) {
    await customerFormRepository.updateById(request._id, { status: CustomerFormStatus.EXPIRED });
    throw new AppError('انتهت صلاحية رابط الاستمارة', 410);
  }
  res.json({ request: publicShape(request) });
});

export const submitPublicCustomerForm = asyncHandler(async (req, res) => {
  const request = await customerFormRepository.findByToken(req.params.token);
  if (!request) throw new AppError('رابط الاستمارة غير صحيح', 404);
  if ([CustomerFormStatus.CANCELLED, CustomerFormStatus.EXPIRED].includes(request.status)) {
    throw new AppError('رابط الاستمارة غير فعال', 410);
  }
  if (isExpired(request)) {
    await customerFormRepository.updateById(request._id, { status: CustomerFormStatus.EXPIRED });
    throw new AppError('انتهت صلاحية رابط الاستمارة', 410);
  }

  const data = normalizeCustomerFormPayload(req.body);
  if (!data.customerName) throw new AppError('اسم الزبون مطلوب', 400);
  if (!data.phone && !data.whatsapp) throw new AppError('رقم الهاتف أو الواتساب مطلوب', 400);

  const attachments = normalizeRequestFiles(req).map((file) => buildCustomerFormAttachment(file));
  const duplicateCustomers = await customerRepository.findByContactNumbers([
    normalizePhone(data.phone),
    normalizePhone(data.whatsapp),
  ]);

  const updatePayload = {
    data,
    status: CustomerFormStatus.PENDING_REVIEW,
    submittedAt: new Date(),
    duplicateCustomers: duplicateCustomers.map((customer) => customer._id),
  };
  if (attachments.length) updatePayload.$push = { attachments: { $each: attachments } };

  const updated = await customerFormRepository.updateByToken(req.params.token, updatePayload);

  res.status(201).json({
    message: 'تم إرسال الاستمارة بنجاح',
    request: publicShape(updated),
  });
});
