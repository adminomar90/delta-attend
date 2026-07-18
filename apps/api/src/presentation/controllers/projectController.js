import { ProjectRepository } from '../../infrastructure/db/repositories/ProjectRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { CustomerRepository } from '../../infrastructure/db/repositories/CustomerRepository.js';
import { DailyWorkPlanRepository } from '../../infrastructure/db/repositories/DailyWorkPlanRepository.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import {
  NotificationWatchPermission,
  resolveNotificationAudience,
} from '../../application/services/notificationAudienceService.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const projectRepository = new ProjectRepository();
const userRepository = new UserRepository();
const customerRepository = new CustomerRepository();
const dailyWorkPlanRepository = new DailyWorkPlanRepository();

const PROJECT_WORK_CATEGORIES = new Set([
  'كاميرات مراقبة',
  'بدالة داخلية',
  'شبكة نيت ورك',
  'أنظمة إنذار وإطفاء الحريق',
  'برمجيات',
  'أنظمة الصوت',
  'طاقة شمسية',
  'أخرى',
]);

const normalizeWorkCategories = (value) => (
  Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || '').trim()).filter((item) => PROJECT_WORK_CATEGORIES.has(item)))]
    : []
);

export const createProject = asyncHandler(async (req, res) => {
  const {
    name,
    code,
    description = '',
    teamMembers = [],
    startDate,
    endDate,
    budget = 0,
    customerId = null,
    workCategories = [],
    clientName = '', clientPhone = '', location = '', notes = '', projectManager = null,
  } = req.body;

  if (!name || !code || !customerId) {
    throw new AppError('اسم المشروع والرمز والزبون مطلوبة', 400);
  }
  const normalizedWorkCategories = normalizeWorkCategories(workCategories);
  if (!normalizedWorkCategories.length) throw new AppError('اختر تصنيفًا واحدًا على الأقل لنوع أعمال المشروع', 400);

  const duplicate = await projectRepository.findDuplicate({ name, code });
  if (duplicate) throw new AppError('يوجد مشروع مسجل بنفس الاسم أو الرمز', 409);

  const customer = customerId ? await customerRepository.findById(customerId) : null;
  if (customerId && (!customer || customer.archived)) throw new AppError('الزبون المحدد غير موجود أو مؤرشف', 404);

  const project = await projectRepository.create({
    name,
    code,
    description,
    teamMembers,
    startDate,
    endDate,
    budget,
    status: 'ACTIVE',
    requiredApprovalRoles: [],
    approvedAt: new Date(),
    customer: customer?._id || null,
    clientName: customer?.name || clientName,
    clientPhone: customer?.phone || clientPhone,
    workCategories: normalizedWorkCategories,
    location,
    notes,
    projectManager: projectManager || req.user.id,
    owner: req.user.id,
  });
  if (customer) await customerRepository.updateById(customer._id, { $addToSet: { linkedProjects: project._id } });

  const projectFull = await projectRepository.findById(project._id);

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_CREATED',
    entityType: 'PROJECT',
    entityId: project._id,
    after: {
      name,
      code,
      status: project.status,
      activationMode: 'DIRECT_WITHOUT_APPROVAL',
    },
    req,
  });

  const operationRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: req.user.id,
    watchPermission: NotificationWatchPermission.OPERATION,
  });

  if (operationRecipients.length) {
    await notificationService.notifyOperationActivity(operationRecipients, {
      titleAr: 'إنشاء مشروع',
      actorName: req.user.fullName || req.user.name || 'الموظف',
      actionLabel: 'إنشاء مشروع',
      entityLabel: projectFull.name || project.name || 'مشروع',
      occurredAt: projectFull.createdAt || project.createdAt || new Date(),
      metadata: {
        entityType: 'PROJECT',
        entityId: String(projectFull._id || project._id),
        action: 'PROJECT_CREATED',
        projectCode: projectFull.code || project.code || '',
      },
    });
  }

  res.status(201).json({ project: projectFull });
});

export const listProjects = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const projects = await projectRepository.list(filter);
  res.json({ projects });
});

export const listProjectCustomers = asyncHandler(async (req, res) => {
  const customers = await customerRepository.list({ archived: { $ne: true } }, { limit: 1000, sort: { name: 1 } });
  res.json({
    customers: customers.map((customer) => ({
      _id: customer._id,
      name: customer.name,
      phone: customer.phone || '',
      province: customer.province || '',
      address: customer.address || '',
    })),
  });
});

export const listProjectDailyWorkPlans = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project || project.archived) throw new AppError('Project not found', 404);

  const filter = { project: project._id };
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : null;
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    throw new AppError('Invalid project plan date range', 400);
  }
  if (from || to) {
    filter.planDate = {};
    if (from) filter.planDate.$gte = from;
    if (to) filter.planDate.$lte = to;
  }

  const plans = await dailyWorkPlanRepository.list(filter, { limit: 2000, sort: { planDate: 1, createdAt: 1 } });
  res.json({ project, plans });
});

export const updateProject = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project) {
    throw new AppError('Project not found', 404);
  }
  if (project.archived) throw new AppError('Cannot update an archived project', 409);

  const duplicate = await projectRepository.findDuplicate({
    name: req.body.name || project.name,
    code: req.body.code || project.code,
    excludeId: project._id,
  });
  if (duplicate) throw new AppError('يوجد مشروع مسجل بنفس الاسم أو الرمز', 409);

  const requestedCustomerId = req.body.customerId ?? req.body.customer;
  let nextCustomer = project.customer || null;
  if (requestedCustomerId !== undefined) {
    if (!requestedCustomerId) throw new AppError('اختيار الزبون مطلوب', 400);
    nextCustomer = requestedCustomerId ? await customerRepository.findById(requestedCustomerId) : null;
    if (requestedCustomerId && (!nextCustomer || nextCustomer.archived)) throw new AppError('الزبون المحدد غير موجود أو مؤرشف', 404);
  }

  if (['DONE', 'REJECTED'].includes(project.status)) {
    throw new AppError('Cannot update closed project', 400);
  }

  const before = {
    name: project.name,
    status: project.status,
    budget: project.budget,
    requiredApprovalRoles: project.requiredApprovalRoles,
  };

  const payload = {
    ...req.body,
  };
  delete payload.requiredApprovalRoles;
  delete payload.approvalTrail;
  delete payload.customerId;
  if (requestedCustomerId !== undefined) {
    payload.customer = nextCustomer?._id || null;
    payload.clientName = nextCustomer?.name || '';
    payload.clientPhone = nextCustomer?.phone || '';
  }
  if (req.body.workCategories !== undefined) {
    payload.workCategories = normalizeWorkCategories(req.body.workCategories);
    if (!payload.workCategories.length) throw new AppError('اختر تصنيفًا واحدًا على الأقل لنوع أعمال المشروع', 400);
  }
  if (payload.status && !['ACTIVE', 'ON_HOLD', 'DONE'].includes(payload.status)) {
    throw new AppError('Project status must be ACTIVE, ON_HOLD, or DONE', 400);
  }

  const updatedProject = await projectRepository.updateById(req.params.id, payload);

  const previousCustomerId = String(project.customer?._id || project.customer || '');
  const nextCustomerId = String(nextCustomer?._id || nextCustomer || '');
  if (previousCustomerId !== nextCustomerId) {
    if (previousCustomerId) await customerRepository.updateById(previousCustomerId, { $pull: { linkedProjects: project._id } });
    if (nextCustomerId) await customerRepository.updateById(nextCustomerId, { $addToSet: { linkedProjects: project._id } });
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_UPDATED',
    entityType: 'PROJECT',
    entityId: project._id,
    before,
    after: {
      name: updatedProject.name,
      status: updatedProject.status,
      budget: updatedProject.budget,
      requiredApprovalRoles: updatedProject.requiredApprovalRoles,
    },
    req,
  });

  res.json({ project: updatedProject });
});
export const archiveProject = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project) throw new AppError('Project not found', 404);
  if (project.archived) throw new AppError('Project is already deleted', 409);

  const archivedAt = new Date();
  const updatedProject = await projectRepository.updateById(project._id, {
    archived: true,
    archivedAt,
    archivedBy: req.user.id,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_ARCHIVED',
    entityType: 'PROJECT',
    entityId: project._id,
    before: { archived: false, name: project.name, code: project.code },
    after: { archived: true, archivedAt, archivedBy: req.user.id },
    req,
  });

  res.json({ project: updatedProject });
});

