import { ProjectRepository } from '../../infrastructure/db/repositories/ProjectRepository.js';
import mongoose from 'mongoose';
import { MaterialsRepository } from '../../infrastructure/db/repositories/MaterialsRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { CustomerRepository } from '../../infrastructure/db/repositories/CustomerRepository.js';
import { DailyWorkPlanRepository } from '../../infrastructure/db/repositories/DailyWorkPlanRepository.js';
import { buildProjectWarehouseExcelBuffer } from '../../infrastructure/reports/projectWarehouseExcelBuilder.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import {
  NotificationWatchPermission,
  resolveNotificationAudience,
} from '../../application/services/notificationAudienceService.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const projectRepository = new ProjectRepository();
const materialsRepository = new MaterialsRepository();
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

const PROJECT_DOCUMENT_TYPES = new Set(['PHOTO', 'PLAN', 'CONTRACT', 'REQUIREMENT', 'OTHER']);
const PROJECT_SUPERVISOR_ROLES = new Set(['PROJECT_MANAGER', 'SUPERVISOR']);

const normalizeWorkCategories = (value) => (
  Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || '').trim()).filter((item) => PROJECT_WORK_CATEGORIES.has(item)))]
    : []
);

const cleanString = (value) => String(value ?? '').trim();
const normalizeProjectDocumentType = (value) => {
  const normalized = cleanString(value || 'OTHER').toUpperCase();
  return PROJECT_DOCUMENT_TYPES.has(normalized) ? normalized : 'OTHER';
};
const projectDocumentFromFile = (file, req) => ({
  documentType: normalizeProjectDocumentType(req.body.documentType),
  title: cleanString(req.body.title) || file.originalname || '',
  notes: cleanString(req.body.notes),
  fileName: file.filename || '',
  originalName: file.originalname || '',
  mimeType: file.mimetype || '',
  size: Number(file.size || 0),
  publicUrl: `/uploads/${file.filename}`,
  uploadedBy: req.user.id,
  uploadedAt: new Date(),
});
const roundQty = (value) => Number(Number(value || 0).toFixed(4));
const dateText = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ar-IQ');
};

const mapProjectWarehouseRows = (dispatches = []) => dispatches.flatMap((dispatch) => {
  const dispatchId = String(dispatch._id || '');
  return (dispatch.items || []).map((item) => ({
    id: `${dispatchId}-${String(item._id || item.material?._id || item.material || '')}`,
    dispatchId,
    dispatchNo: dispatch.dispatchNo || '-',
    requestNo: dispatch.request?.requestNo || '-',
    deliveredAt: dateText(dispatch.deliveredAt || dispatch.createdAt),
    deliveredAtRaw: dispatch.deliveredAt || dispatch.createdAt || null,
    warehouseName: dispatch.warehouse?.name || '-',
    warehouseCode: dispatch.warehouse?.code || '',
    materialCode: item.material?.code || '',
    materialName: item.materialName || item.material?.name || '-',
    unit: item.unit || item.material?.unit || '-',
    deliveredQty: roundQty(item.deliveredQty),
    recipientName: dispatch.recipient?.fullName || '-',
    deliveredByName: dispatch.deliveredBy?.fullName || '-',
    status: dispatch.status || '-',
    dispatchNotes: dispatch.notes || '',
    itemNotes: item.notes || '',
  }));
});

const summarizeProjectWarehouse = (dispatches = [], rows = []) => ({
  dispatchesCount: dispatches.length,
  itemsCount: rows.length,
  uniqueMaterialsCount: new Set(rows.map((row) => row.materialCode || row.materialName).filter(Boolean)).size,
  warehousesCount: new Set(rows.map((row) => row.warehouseName).filter((name) => name && name !== '-')).size,
});

const loadProjectWarehouseData = async (projectId) => {
  const project = await projectRepository.findById(projectId);
  if (!project || project.archived) throw new AppError('Project not found', 404);

  const dispatches = await materialsRepository.listDispatches(
    { project: project._id, status: { $ne: 'CANCELLED' } },
    { limit: 5000, sort: { deliveredAt: -1, createdAt: -1 } },
  );
  const rows = mapProjectWarehouseRows(dispatches);
  const summary = summarizeProjectWarehouse(dispatches, rows);

  return { project, rows, summary };
};

const normalizeObjectIdArray = (value, fieldName) => {
  if (!Array.isArray(value)) throw new AppError(`${fieldName} يجب أن يكون قائمة`, 400);
  return [...new Set(value.map((item) => cleanString(item)).filter(Boolean))].map((id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError(`${fieldName} يحتوي معرف غير صالح`, 400);
    return id;
  });
};

const normalizeProjectSupervisors = (value, actorId) => {
  if (!Array.isArray(value)) throw new AppError('مسؤولو المشروع يجب أن يكونوا قائمة', 400);
  const seen = new Set();
  return value.map((item) => {
    const employee = cleanString(item.employee?._id || item.employee || item.employeeId || '');
    if (!employee || !mongoose.Types.ObjectId.isValid(employee)) throw new AppError('اختر موظفًا صالحًا من النظام', 400);
    const role = cleanString(item.role || 'SUPERVISOR').toUpperCase();
    if (!PROJECT_SUPERVISOR_ROLES.has(role)) throw new AppError('دور المسؤول غير صالح', 400);
    const key = `${employee}:${role}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      ...(item._id && mongoose.Types.ObjectId.isValid(String(item._id)) ? { _id: item._id } : {}),
      employee,
      role,
      title: cleanString(item.title) || (role === 'PROJECT_MANAGER' ? 'مدير مشروع' : 'مسؤول مشروع'),
      notes: cleanString(item.notes),
      active: item.active !== false,
      addedBy: item.addedBy || actorId,
      addedAt: item.addedAt || new Date(),
    };
  }).filter(Boolean);
};

const normalizeDailyLaborers = (value, actorId) => {
  if (!Array.isArray(value)) throw new AppError('عمال الأجر اليومي يجب أن يكونوا قائمة', 400);
  return value.map((item) => {
    const fullName = cleanString(item.fullName);
    if (!fullName) throw new AppError('اسم موظف الأجر اليومي مطلوب', 400);
    const dailyWage = Number(item.dailyWage || 0);
    if (!Number.isFinite(dailyWage) || dailyWage < 0) throw new AppError('الأجر اليومي غير صالح', 400);
    return {
      ...(item._id && mongoose.Types.ObjectId.isValid(String(item._id)) ? { _id: item._id } : {}),
      fullName,
      phone: cleanString(item.phone),
      jobTitle: cleanString(item.jobTitle),
      dailyWage,
      currency: cleanString(item.currency || 'IQD').toUpperCase(),
      startDate: item.startDate ? new Date(item.startDate) : null,
      notes: cleanString(item.notes),
      active: item.active !== false,
      addedBy: item.addedBy || actorId,
      addedAt: item.addedAt || new Date(),
    };
  });
};

const normalizeProjectDepartments = (value, actorId) => {
  if (!Array.isArray(value)) throw new AppError('أقسام المشروع يجب أن تكون قائمة', 400);
  return value.map((item) => {
    const name = cleanString(item.name);
    if (!name) throw new AppError('اسم القسم مطلوب', 400);
    const manager = cleanString(item.manager?._id || item.manager || '');
    const members = normalizeObjectIdArray(item.members || [], 'كادر القسم');
    if (manager && !mongoose.Types.ObjectId.isValid(manager)) throw new AppError('مسؤول القسم غير صالح', 400);
    return {
      ...(item._id && mongoose.Types.ObjectId.isValid(String(item._id)) ? { _id: item._id } : {}),
      name,
      description: cleanString(item.description),
      manager: manager || null,
      members,
      notes: cleanString(item.notes),
      active: item.active !== false,
      addedBy: item.addedBy || actorId,
      addedAt: item.addedAt || new Date(),
    };
  });
};

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
  if (req.query.stage || req.query.stageId) filter.stage = req.query.stage || req.query.stageId;
  if (req.query.task || req.query.taskId) filter.task = req.query.task || req.query.taskId;

  const plans = await dailyWorkPlanRepository.list(filter, { limit: 2000, sort: { planDate: 1, createdAt: 1 } });
  res.json({ project, plans });
});

export const listProjectWarehouseMaterials = asyncHandler(async (req, res) => {
  const { project, rows, summary } = await loadProjectWarehouseData(req.params.id);
  res.json({
    project: {
      _id: project._id,
      name: project.name,
      code: project.code,
    },
    summary,
    materials: rows,
  });
});

export const exportProjectWarehouseMaterialsExcel = asyncHandler(async (req, res) => {
  const { project, rows, summary } = await loadProjectWarehouseData(req.params.id);
  const buffer = await buildProjectWarehouseExcelBuffer({ project, rows, summary });
  const filename = `project-warehouse-${project.code || project._id}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

export const listProjectDocuments = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project || project.archived) throw new AppError('Project not found', 404);
  res.json({ documents: project.documents || [] });
});

export const uploadProjectDocuments = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project || project.archived) throw new AppError('Project not found', 404);
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) throw new AppError('اختر ملفًا واحدًا على الأقل', 400);

  const documents = files.map((file) => projectDocumentFromFile(file, req));
  const updatedProject = await projectRepository.updateById(project._id, {
    $push: { documents: { $each: documents } },
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_DOCUMENTS_UPLOADED',
    entityType: 'PROJECT',
    entityId: project._id,
    after: {
      documentsCount: documents.length,
      documentType: normalizeProjectDocumentType(req.body.documentType),
    },
    req,
  });

  res.status(201).json({ project: updatedProject, documents: updatedProject.documents || [] });
});

export const deleteProjectDocument = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project || project.archived) throw new AppError('Project not found', 404);
  const document = (project.documents || []).find((item) => String(item._id) === String(req.params.documentId));
  if (!document) throw new AppError('Project document not found', 404);

  const updatedProject = await projectRepository.updateById(project._id, {
    $pull: { documents: { _id: req.params.documentId } },
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_DOCUMENT_DELETED',
    entityType: 'PROJECT',
    entityId: project._id,
    before: {
      documentId: req.params.documentId,
      title: document.title || document.originalName || '',
    },
    req,
  });

  res.json({ project: updatedProject, documents: updatedProject.documents || [] });
});

export const updateProjectTeam = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project || project.archived) throw new AppError('المشروع غير موجود أو مؤرشف', 404);

  const teamMembers = normalizeObjectIdArray(req.body.teamMembers || [], 'الموظفون الموجودون');
  const dailyLaborers = normalizeDailyLaborers(req.body.dailyLaborers || [], req.user.id);

  if (teamMembers.length) {
    const users = await userRepository.listByIds(teamMembers);
    if (users.length !== teamMembers.length) throw new AppError('يوجد موظف محدد غير موجود في النظام', 404);
  }

  const updatedProject = await projectRepository.updateById(project._id, {
    teamMembers,
    dailyLaborers,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_TEAM_UPDATED',
    entityType: 'PROJECT',
    entityId: project._id,
    before: {
      teamMembers: (project.teamMembers || []).map((item) => item._id || item),
      dailyLaborersCount: (project.dailyLaborers || []).length,
    },
    after: {
      teamMembers,
      dailyLaborersCount: dailyLaborers.length,
    },
    req,
  });

  res.json({ project: updatedProject });
});

export const updateProjectDepartments = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project || project.archived) throw new AppError('المشروع غير موجود أو مؤرشف', 404);

  const projectDepartments = normalizeProjectDepartments(req.body.projectDepartments || [], req.user.id);
  const userIds = [...new Set(projectDepartments.flatMap((department) => [
    department.manager,
    ...(department.members || []),
  ]).filter(Boolean).map(String))];
  if (userIds.length) {
    const users = await userRepository.listByIds(userIds);
    if (users.length !== userIds.length) throw new AppError('يوجد موظف محدد غير موجود في النظام', 404);
  }

  const updatedProject = await projectRepository.updateById(project._id, { projectDepartments });

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_DEPARTMENTS_UPDATED',
    entityType: 'PROJECT',
    entityId: project._id,
    before: { departmentsCount: (project.projectDepartments || []).length },
    after: { departmentsCount: projectDepartments.length },
    req,
  });

  res.json({ project: updatedProject });
});

export const updateProjectSupervisors = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project || project.archived) throw new AppError('المشروع غير موجود أو مؤرشف', 404);

  const projectSupervisors = normalizeProjectSupervisors(req.body.projectSupervisors || [], req.user.id);
  const employeeIds = [...new Set(projectSupervisors.map((item) => String(item.employee)))];
  if (employeeIds.length) {
    const users = await userRepository.listByIds(employeeIds);
    if (users.length !== employeeIds.length) throw new AppError('يوجد موظف محدد غير موجود في النظام', 404);
  }

  const projectManagerSupervisor = projectSupervisors.find((item) => item.role === 'PROJECT_MANAGER' && item.active !== false);
  const payload = {
    projectSupervisors,
    ...(projectManagerSupervisor ? { projectManager: projectManagerSupervisor.employee } : {}),
  };

  const updatedProject = await projectRepository.updateById(project._id, payload);

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_SUPERVISORS_UPDATED',
    entityType: 'PROJECT',
    entityId: project._id,
    before: { supervisorsCount: (project.projectSupervisors || []).length },
    after: {
      supervisorsCount: projectSupervisors.length,
      projectManager: projectManagerSupervisor?.employee || project.projectManager?._id || project.projectManager || null,
    },
    req,
  });

  res.json({ project: updatedProject });
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

