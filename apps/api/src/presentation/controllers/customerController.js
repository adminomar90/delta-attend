import { CustomerRepository } from '../../infrastructure/db/repositories/CustomerRepository.js';
import { DailyWorkPlanRepository } from '../../infrastructure/db/repositories/DailyWorkPlanRepository.js';
import { auditService } from '../../application/services/auditService.js';
import {
  buildCustomerAttachment,
  CustomerStatus,
  CustomerType,
  FollowUpStatus,
  FollowUpType,
  normalizePhone,
  parseJsonField,
  toCleanString,
  toDateValue,
} from '../../application/services/customerService.js';
import { Permission, Roles } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const customerRepository = new CustomerRepository();
const dailyWorkPlanRepository = new DailyWorkPlanRepository();

const toId = (value) => String(value?._id || value?.id || value || '').trim();
const actorLabel = (req) => req.user.fullName || req.user.name || 'مستخدم النظام';

const normalizeRequestFiles = (req) => {
  if (Array.isArray(req.files)) return req.files;
  if (req.files && Array.isArray(req.files.attachments)) return req.files.attachments;
  return [];
};

const escapeRegex = (value) => toCleanString(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeContactPersons = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => ({
      name: toCleanString(item.name),
      position: toCleanString(item.position),
      phone: toCleanString(item.phone),
      whatsapp: toCleanString(item.whatsapp || item.phone),
      isDecisionMaker: !!item.isDecisionMaker,
      isTechnical: !!item.isTechnical,
      isFinancial: !!item.isFinancial,
    }))
    .filter((item) => item.name || item.phone || item.whatsapp);

const normalizeSites = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => ({
      name: toCleanString(item.name),
      address: toCleanString(item.address),
      mapUrl: toCleanString(item.mapUrl),
      managerName: toCleanString(item.managerName),
      managerPhone: toCleanString(item.managerPhone),
      notes: toCleanString(item.notes),
    }))
    .filter((item) => item.name || item.address || item.managerName);

const normalizeFollowUps = (value, req) =>
  (Array.isArray(value) ? value : [])
    .map((item) => ({
      type: Object.values(FollowUpType).includes(item.type) ? item.type : FollowUpType.CALL,
      employee: item.employee || null,
      employeeName: toCleanString(item.employeeName || actorLabel(req)),
      note: toCleanString(item.note),
      nextFollowUpAt: toDateValue(item.nextFollowUpAt),
      status: Object.values(FollowUpStatus).includes(item.status) ? item.status : FollowUpStatus.OPEN,
      createdBy: item.createdBy || req.user.id,
      createdByName: toCleanString(item.createdByName || actorLabel(req)),
      createdAt: toDateValue(item.createdAt) || new Date(),
    }))
    .filter((item) => item.note || item.employeeName || item.nextFollowUpAt);

const buildCustomerPayload = async (req, existingCustomer = null) => {
  const name = toCleanString(req.body.name);
  const customerType = toCleanString(req.body.customerType || CustomerType.COMPANY);
  const status = toCleanString(req.body.status || CustomerStatus.NEW);
  const phone = toCleanString(req.body.phone);
  const whatsapp = toCleanString(req.body.whatsapp || phone);
  const normalizedPhone = normalizePhone(phone);
  const normalizedWhatsapp = normalizePhone(whatsapp);
  const contactPersons = normalizeContactPersons(parseJsonField(req.body.contactPersons, req.body.contactPersons || []));
  const sites = normalizeSites(parseJsonField(req.body.sites, req.body.sites || []));
  const followUps = normalizeFollowUps(parseJsonField(req.body.followUps, req.body.followUps || []), req);
  const linkedProjects = parseJsonField(req.body.linkedProjects, req.body.linkedProjects || []);
  const attachments = normalizeRequestFiles(req).map((file) => buildCustomerAttachment(file, req.user));

  if (!name) throw new AppError('Customer name is required', 400);
  if (!Object.values(CustomerType).includes(customerType)) throw new AppError('Invalid customer type', 400);
  if (!Object.values(CustomerStatus).includes(status)) throw new AppError('Invalid customer status', 400);

  const duplicate = await customerRepository.findByNormalizedPhone(normalizedPhone, toId(existingCustomer));
  if (duplicate) {
    throw new AppError('يوجد زبون مسجل بنفس رقم الهاتف', 409);
  }

  return {
    name,
    customerType,
    phone,
    normalizedPhone,
    whatsapp,
    normalizedWhatsapp,
    email: toCleanString(req.body.email).toLowerCase(),
    province: toCleanString(req.body.province),
    address: toCleanString(req.body.address),
    mapUrl: toCleanString(req.body.mapUrl),
    notes: toCleanString(req.body.notes),
    status,
    contactPersons,
    sites,
    followUps,
    linkedProjects: Array.isArray(linkedProjects) ? linkedProjects.filter(Boolean) : [],
    attachments,
    lastModifiedBy: req.user.id,
    lastModifiedByName: actorLabel(req),
    lastModifiedAt: new Date(),
  };
};

const userCanManageCustomers = (user) =>
  hasPermission(user, Permission.MANAGE_CUSTOMERS) || hasPermission(user, Permission.CREATE_CUSTOMERS);

const userCanSeeCustomer = async (req, customer) => {
  if (userCanManageCustomers(req.user) || req.user.role === Roles.GENERAL_MANAGER) return true;
  if (hasPermission(req.user, Permission.VIEW_CUSTOMER_FINANCIAL_INFO)) return true;
  if (!hasPermission(req.user, Permission.VIEW_CUSTOMERS)) return false;

  const actorId = toId(req.user.id);
  if (toId(customer.createdBy) === actorId) return true;
  const linkedPlanIds = (customer.linkedDailyWorkPlans || []).map(toId).filter(Boolean);
  if (!linkedPlanIds.length) return false;

  const visiblePlans = await dailyWorkPlanRepository.list({
    _id: { $in: linkedPlanIds },
    $or: [
      { 'assignees.user': actorId },
      { teamLeader: actorId },
      { supervisor: actorId },
      { createdBy: actorId },
    ],
  }, { limit: 1 });
  return visiblePlans.length > 0;
};

const redactForFinancialOnly = (customer, req) => {
  if (
    hasPermission(req.user, Permission.VIEW_CUSTOMERS)
    || hasPermission(req.user, Permission.MANAGE_CUSTOMERS)
    || hasPermission(req.user, Permission.CREATE_CUSTOMERS)
  ) {
    return customer;
  }

  return {
    _id: customer._id,
    id: customer.id,
    name: customer.name,
    customerType: customer.customerType,
    status: customer.status,
    province: customer.province,
    archived: customer.archived,
    lastModifiedAt: customer.lastModifiedAt,
  };
};

const buildFilterFromQuery = (req) => {
  const filter = {};
  const search = toCleanString(req.query.search || req.query.q);
  const province = toCleanString(req.query.province);
  const status = toCleanString(req.query.status);
  const phone = normalizePhone(req.query.phone);
  const archivedQuery = toCleanString(req.query.archived).toLowerCase();

  if (archivedQuery === 'true') filter.archived = true;
  else if (archivedQuery !== 'all') filter.archived = { $ne: true };

  if (province) filter.province = new RegExp(escapeRegex(province), 'i');
  if (status) filter.status = status;
  if (phone) {
    filter.$or = [
      { normalizedPhone: new RegExp(escapeRegex(phone), 'i') },
      { normalizedWhatsapp: new RegExp(escapeRegex(phone), 'i') },
    ];
  }
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const searchOr = [
      { name: regex },
      { phone: regex },
      { whatsapp: regex },
      { normalizedPhone: regex },
      { province: regex },
      { address: regex },
      { 'sites.name': regex },
      { 'sites.address': regex },
      { 'sites.managerName': regex },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
      delete filter.$or;
    } else {
      filter.$or = searchOr;
    }
  }

  return filter;
};

const snapshotCustomer = (customer) => ({
  id: toId(customer),
  name: customer?.name || '',
  phone: customer?.phone || '',
  province: customer?.province || '',
  status: customer?.status || '',
  archived: !!customer?.archived,
});

export const listCustomers = asyncHandler(async (req, res) => {
  const customers = await customerRepository.list(buildFilterFromQuery(req), { limit: 500 });
  const visible = [];
  for (const customer of customers) {
    if (await userCanSeeCustomer(req, customer)) {
      visible.push(redactForFinancialOnly(customer, req));
    }
  }
  res.json({ customers: visible });
});

export const getCustomerById = asyncHandler(async (req, res) => {
  const customer = await customerRepository.findById(req.params.id);
  if (!customer) throw new AppError('Customer not found', 404);
  if (!(await userCanSeeCustomer(req, customer))) throw new AppError('You are not allowed to access this customer', 403);
  res.json({ customer: redactForFinancialOnly(customer, req) });
});

export const createCustomer = asyncHandler(async (req, res) => {
  const payload = await buildCustomerPayload(req);
  const customer = await customerRepository.create({
    ...payload,
    createdBy: req.user.id,
  });
  await auditService.log({
    actorId: req.user.id,
    action: 'CUSTOMER_CREATED',
    entityType: 'CUSTOMER',
    entityId: toId(customer),
    after: snapshotCustomer(customer),
    req,
  });
  res.status(201).json({ customer });
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const existingCustomer = await customerRepository.findById(req.params.id);
  if (!existingCustomer) throw new AppError('Customer not found', 404);
  const before = snapshotCustomer(existingCustomer);
  const payload = await buildCustomerPayload(req, existingCustomer);
  const updatePayload = {
    ...payload,
    $push: payload.attachments.length ? { attachments: { $each: payload.attachments } } : undefined,
  };
  delete updatePayload.attachments;
  if (!updatePayload.$push) delete updatePayload.$push;
  const customer = await customerRepository.updateById(req.params.id, updatePayload);
  await auditService.log({
    actorId: req.user.id,
    action: 'CUSTOMER_UPDATED',
    entityType: 'CUSTOMER',
    entityId: toId(customer),
    before,
    after: snapshotCustomer(customer),
    req,
  });
  res.json({ customer });
});

export const archiveCustomer = asyncHandler(async (req, res) => {
  const customer = await customerRepository.findById(req.params.id);
  if (!customer) throw new AppError('Customer not found', 404);
  const updated = await customerRepository.archiveById(req.params.id, req.user.id, actorLabel(req));
  await auditService.log({
    actorId: req.user.id,
    action: 'CUSTOMER_ARCHIVED',
    entityType: 'CUSTOMER',
    entityId: toId(updated),
    before: snapshotCustomer(customer),
    after: snapshotCustomer(updated),
    req,
  });
  res.json({ customer: updated });
});

export const unarchiveCustomer = asyncHandler(async (req, res) => {
  const customer = await customerRepository.findById(req.params.id);
  if (!customer) throw new AppError('Customer not found', 404);
  const updated = await customerRepository.unarchiveById(req.params.id, req.user.id, actorLabel(req));
  res.json({ customer: updated });
});
