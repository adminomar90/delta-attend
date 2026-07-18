import { DailyWorkPlanRepository } from '../../infrastructure/db/repositories/DailyWorkPlanRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { ProjectRepository } from '../../infrastructure/db/repositories/ProjectRepository.js';
import { CustomerRepository } from '../../infrastructure/db/repositories/CustomerRepository.js';
import { FieldInspectionTicketRepository } from '../../infrastructure/db/repositories/FieldInspectionTicketRepository.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { performancePointsService } from '../../application/services/performancePointsService.js';
import {
  NotificationWatchPermission,
  resolveNotificationAudience,
} from '../../application/services/notificationAudienceService.js';
import {
  buildDailyProductivitySummary,
  buildDailyWorkPlanSummary,
  buildTimelineEntry,
  clampAwardedPoints,
  clampProgress,
  combinePlanDateTime,
  createStoredAttachment,
  DailyWorkPlanPriority,
  DailyWorkPlanStatus,
  DailyWorkPlanTaskType,
  dailyWorkPlanPriorityLabelMap,
  dailyWorkPlanStatusLabelMap,
  dailyWorkPlanTaskTypeLabelMap,
  formatPlanDateKey,
  getNextPlanDate,
  normalizeAssigneeInput,
  recalculatePlanState,
  sanitizeTimeValue,
  syncOverdueDailyWorkPlans,
  toDateOnly,
} from '../../application/services/dailyWorkPlanService.js';
import { createCustomerSnapshot } from '../../application/services/customerService.js';
import { buildTimelineEntry as buildFieldInspectionTimelineEntry, FieldInspectionStatus } from '../../application/services/fieldInspectionService.js';
import { buildDailyWorkPlansExcelBuffer } from '../../infrastructure/reports/dailyWorkPlansExcelBuilder.js';
import { buildDailyWorkPlansPdfBuffer } from '../../infrastructure/reports/dailyWorkPlansPdfBuilder.js';
import {
  applyManagedScopeOnFilter,
  isUserWithinManagedScope,
  resolveManagedUserIds,
} from '../../shared/accessScope.js';
import { Permission } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const dailyWorkPlanRepository = new DailyWorkPlanRepository();
const userRepository = new UserRepository();
const projectRepository = new ProjectRepository();
const customerRepository = new CustomerRepository();
const fieldInspectionTicketRepository = new FieldInspectionTicketRepository();

const toId = (value) => String(value?._id || value?.id || value || '').trim();

const toCleanString = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const toDateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeRequestFiles = (req) => {
  if (Array.isArray(req.files)) return req.files;
  if (req.files && Array.isArray(req.files.attachments)) return req.files.attachments;
  return [];
};

const normalizeLocalizedDigits = (value) =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

const actorLabel = (req) => req.user.fullName || req.user.name || 'مستخدم النظام';

const formatDateTimeAr = (value) => {
  const date = toDateValue(value);
  if (!date) return '';

  return date.toLocaleString('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const assertEnumValue = (value, enumValues, fieldName) => {
  if (!enumValues.includes(value)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }
};

const toBoundedNumber = (value, {
  min = 0,
  max = 1000,
  fallback = 0,
  fieldName = 'value',
} = {}) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(normalizeLocalizedDigits(value));
  if (!Number.isFinite(parsed)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }

  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) {
    throw new AppError(`${fieldName} must be between ${min} and ${max}`, 400);
  }

  return rounded;
};

const parseApprovalPointsInput = (value) => {
  const parsed = parseJsonField(value, value || {});
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    return {};
  }

  return parsed;
};

const resolveApprovalPoints = (plan, rawPoints = {}) => {
  const pointsSource = parseApprovalPointsInput(rawPoints);
  const assigneeAwards = (plan.assignees || []).map((assignee) => {
    const userId = toId(assignee.user);
    const points = toBoundedNumber(pointsSource[userId], {
      min: 0,
      max: 1000,
      fallback: clampAwardedPoints(assignee.pointsAwarded),
      fieldName: `points for ${userId || 'assignee'}`,
    });

    return {
      userId,
      fullName: assignee.user?.fullName || '',
      points,
    };
  });

  const teamLeaderId = toId(plan.teamLeader);
  const assigneeIds = new Set(assigneeAwards.map((a) => a.userId));
  if (teamLeaderId && !assigneeIds.has(teamLeaderId)) {
    const tlPoints = toBoundedNumber(pointsSource[teamLeaderId], {
      min: 0,
      max: 1000,
      fallback: 0,
      fieldName: `points for team leader ${teamLeaderId}`,
    });
    assigneeAwards.push({
      userId: teamLeaderId,
      fullName: plan.teamLeader?.fullName || '',
      points: tlPoints,
      isTeamLeader: true,
    });
  }

  return {
    assigneeAwards,
    totalAwardedPoints: assigneeAwards.reduce((sum, item) => sum + Number(item.points || 0), 0),
  };
};

const snapshotPlan = (plan) => ({
  id: toId(plan),
  title: plan?.title || '',
  status: plan?.status || '',
  progressPercent: Number(plan?.progressPercent || 0),
  pointsAwardedTotal: Number(plan?.pointsAwardedTotal || 0),
  planDate: plan?.planDate || null,
  dueAt: plan?.dueAt || null,
  priority: plan?.priority || '',
  taskType: plan?.taskType || '',
  customerName: plan?.customerName || '',
  customer: toId(plan?.customer),
  customerSnapshot: plan?.customerSnapshot || null,
  projectName: plan?.project?.name || plan?.projectNameSnapshot || '',
  assignees: (plan?.assignees || []).map((assignee) => ({
    userId: toId(assignee.user),
    fullName: assignee.user?.fullName || '',
    status: assignee.status,
    progressPercent: Number(assignee.progressPercent || 0),
    pointsAwarded: Number(assignee.pointsAwarded || 0),
  })),
  approvedAt: plan?.approvedAt || null,
  approvedBy: toId(plan?.approvedBy),
  archived: !!plan?.archived,
  archivedAt: plan?.archivedAt || null,
  archivedBy: toId(plan?.archivedBy),
  postponedTo: plan?.postponedTo || null,
});

const userCanManageDailyWorkPlans = (user) =>
  hasPermission(user, Permission.MANAGE_DAILY_WORK_PLANS)
  || hasPermission(user, Permission.CREATE_DAILY_WORK_PLANS)
  || hasPermission(user, Permission.APPROVE_DAILY_WORK_PLANS);

const userCanUpdateAssignments = (user) =>
  hasPermission(user, Permission.UPDATE_ASSIGNED_DAILY_WORK_PLANS)
  || userCanManageDailyWorkPlans(user);

const userCanApproveDailyWorkPlans = (user) =>
  hasPermission(user, Permission.APPROVE_DAILY_WORK_PLANS);

const userCanViewAllDailyWorkPlanEmployees = (user) =>
  hasPermission(user, Permission.VIEW_ALL_DAILY_WORK_PLAN_EMPLOYEES);

const isPlanReadyForArchive = (plan) =>
  Number(plan?.progressPercent || 0) >= 100
  || [DailyWorkPlanStatus.PENDING_APPROVAL, DailyWorkPlanStatus.COMPLETED].includes(plan?.status);

const userCanArchivePlan = (user, plan) => {
  const actorId = toId(user?.id);
  return (
    userCanManageDailyWorkPlans(user)
    || userCanApproveDailyWorkPlans(user)
    || actorId === toId(plan?.teamLeader)
    || actorId === toId(plan?.supervisor)
    || actorId === toId(plan?.createdBy)
  );
};

const ensureManagedUsers = async (req) =>
  resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

const planHasVisibleAssignee = (plan, managedUserIds) => {
  if (!Array.isArray(managedUserIds)) return true;
  return (plan.assignees || []).some((assignee) => managedUserIds.includes(toId(assignee.user)));
};

const ensurePlanVisibleToActor = async (req, plan) => {
  const managedUserIds = await ensureManagedUsers(req);
  const actorId = toId(req.user.id);
  if (
    !planHasVisibleAssignee(plan, managedUserIds)
    && actorId !== toId(plan.createdBy)
    && actorId !== toId(plan.supervisor)
    && actorId !== toId(plan.teamLeader)
  ) {
    throw new AppError('You are not allowed to access this daily work plan', 403);
  }
  return managedUserIds;
};

const buildFilterFromQuery = async (req) => {
  const filter = {};
  const search = toCleanString(req.query.search);
  const planDate = toCleanString(req.query.planDate || req.query.date);
  const dateFrom = toCleanString(req.query.dateFrom);
  const dateTo = toCleanString(req.query.dateTo);
  const managedUserIds = await ensureManagedUsers(req);

  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.taskType) filter.taskType = req.query.taskType;
  if (req.query.project) filter.project = req.query.project;
  if (req.query.supervisor) filter.supervisor = req.query.supervisor;

  const archivedQuery = toCleanString(req.query.archived).toLowerCase();
  if (archivedQuery === 'true') {
    filter.archived = true;
  } else if (archivedQuery !== 'all') {
    filter.archived = { $ne: true };
  }

  if (planDate) {
    const from = combinePlanDateTime(planDate, '00:00', '00:00');
    const to = combinePlanDateTime(planDate, '23:59', '23:59');
    if (from && to) filter.planDate = { $gte: from, $lte: to };
  } else if (dateFrom || dateTo) {
    filter.planDate = {};
    if (dateFrom) filter.planDate.$gte = combinePlanDateTime(dateFrom, '00:00', '00:00');
    if (dateTo) filter.planDate.$lte = combinePlanDateTime(dateTo, '23:59', '23:59');
  }

  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { title: regex },
      { description: regex },
      { customerName: regex },
      { projectNameSnapshot: regex },
      { location: regex },
    ];
  }

  /* --- scope: assignee-based + actor own roles (teamLeader / supervisor / createdBy) --- */
  const requestedUserId = req.query.assignee || req.query.employee;
  const actorId = req.user.id;

  if (requestedUserId) {
    // specific employee requested – keep the old strict filter
    applyManagedScopeOnFilter({
      filter,
      managedUserIds,
      field: 'assignees.user',
      requestedUserId,
    });
  } else {
    // build an $or so the actor also sees plans where they are teamLeader / supervisor / createdBy
    const assigneeCondition = {};
    applyManagedScopeOnFilter({
      filter: assigneeCondition,
      managedUserIds,
      field: 'assignees.user',
    });

    const orConditions = [
      assigneeCondition,              // plans with assignees in managed scope
      { teamLeader: actorId },        // plans where actor is team leader
      { supervisor: actorId },        // plans where actor is supervisor
      { createdBy: actorId },         // plans created by actor
    ];

    if (filter.$or) {
      // search regex already occupies $or – wrap with $and
      const searchOr = filter.$or;
      delete filter.$or;
      filter.$and = [
        { $or: searchOr },
        { $or: orConditions },
      ];
    } else {
      filter.$or = orConditions;
    }
  }

  return { filter };
};

const parseAssigneePayload = (body) => {
  const parsedAssignees = parseJsonField(body.assignees, body.assignees || []);
  const parsedIds = parseJsonField(body.assigneeIds, body.assigneeIds || []);
  if (Array.isArray(parsedAssignees) && parsedAssignees.length) return parsedAssignees;
  if (Array.isArray(parsedIds) && parsedIds.length) return parsedIds.map((item) => ({ user: item }));
  return [];
};

const resolveAssignees = async ({ assigneePayload, req, allowExisting = [] } = {}) => {
  const normalized = (Array.isArray(assigneePayload) ? assigneePayload : [])
    .map((entry) => normalizeAssigneeInput(typeof entry === 'string' ? { user: entry } : entry))
    .filter((entry) => toId(entry.user));
  const uniqueIds = [...new Set(normalized.map((entry) => toId(entry.user)))];
  if (!uniqueIds.length) throw new AppError('At least one assignee is required', 400);

  const managedUserIds = await ensureManagedUsers(req);
  uniqueIds.forEach((userId) => {
    if (!isUserWithinManagedScope({ managedUserIds, userId })) {
      throw new AppError('You can only assign daily plans within your management scope', 403);
    }
  });

  const activeUsers = await userRepository.listByIds(uniqueIds);
  if (activeUsers.length !== uniqueIds.length) {
    throw new AppError('One or more assignees are not available', 404);
  }

  return normalized.map((entry) => {
    const previous = allowExisting.find((item) => toId(item.user) === toId(entry.user));
    const base = previous ? normalizeAssigneeInput(previous) : entry;
    return {
      ...base,
      user: entry.user,
      status: entry.status || base.status || DailyWorkPlanStatus.NEW,
      progressPercent: entry.progressPercent ?? base.progressPercent,
      employeeNotes: entry.employeeNotes || base.employeeNotes || '',
      adminNotes: entry.adminNotes || base.adminNotes || '',
      lastUpdatedAt: new Date(),
    };
  });
};

const buildPlanPayload = async ({ req, existingPlan = null } = {}) => {
  const title = toCleanString(req.body.title);
  const description = toCleanString(req.body.description);
  const customerName = toCleanString(req.body.customerName);
  const location = toCleanString(req.body.location);
  const customerId = toCleanString(req.body.customer || req.body.customerId || toId(existingPlan?.customer));
  const selectedSiteId = toCleanString(req.body.customerSiteId || req.body.siteId || existingPlan?.customerSnapshot?.siteId);
  const planDate = toDateOnly(req.body.planDate);
  const startTime = sanitizeTimeValue(req.body.startTime);
  const expectedEndTime = sanitizeTimeValue(req.body.expectedEndTime, '23:59');
  const priority = toCleanString(req.body.priority || DailyWorkPlanPriority.MEDIUM);
  const taskType = toCleanString(req.body.taskType || DailyWorkPlanTaskType.OTHER);
  const adminNotes = toCleanString(req.body.adminNotes);
  const status = toCleanString(req.body.status || existingPlan?.status || DailyWorkPlanStatus.NEW);
  const supervisor = toCleanString(req.body.supervisor || req.body.supervisorId || toId(existingPlan?.supervisor));
  const teamLeader = toCleanString(req.body.teamLeader || req.body.teamLeaderId || toId(existingPlan?.teamLeader));
  const projectId = toCleanString(req.body.project || req.body.projectId || toId(existingPlan?.project));
  const attachments = normalizeRequestFiles(req).map((file) => createStoredAttachment(file, req.user));

  if (!title) throw new AppError('Title is required', 400);
  if (!planDate) throw new AppError('Plan date is required', 400);

  assertEnumValue(priority, Object.values(DailyWorkPlanPriority), 'priority');
  assertEnumValue(taskType, Object.values(DailyWorkPlanTaskType), 'taskType');
  assertEnumValue(status, Object.values(DailyWorkPlanStatus), 'status');

  let project = null;
  let projectNameSnapshot = existingPlan?.projectNameSnapshot || '';
  if (projectId) {
    project = projectId;
    const projectDoc = await projectRepository.findById(projectId).catch(() => null);
    projectNameSnapshot = projectDoc?.name || projectNameSnapshot;
  }

  let customer = null;
  let customerSnapshot = existingPlan?.customerSnapshot || {};
  let resolvedCustomerName = customerName;
  let resolvedLocation = location;
  if (customerId) {
    const customerDoc = await customerRepository.findById(customerId);
    if (!customerDoc) throw new AppError('Customer not found', 404);
    const selectedSite = (customerDoc.sites || []).find((site) => toId(site) === selectedSiteId) || null;
    customer = customerId;
    customerSnapshot = createCustomerSnapshot(customerDoc, selectedSite);
    resolvedCustomerName = customerName || customerSnapshot.customerName;
    resolvedLocation = location || customerSnapshot.address || customerDoc.address || '';
  }

  const assignees = req.body.assignees !== undefined || req.body.assigneeIds !== undefined || !existingPlan
    ? await resolveAssignees({
        assigneePayload: parseAssigneePayload(req.body),
        req,
        allowExisting: existingPlan?.assignees || [],
      })
    : (existingPlan?.assignees || []).map((item) => normalizeAssigneeInput(item));

  const dueAt = combinePlanDateTime(planDate, expectedEndTime);
  const recalculated = recalculatePlanState(
    {
      status,
      progressPercent: existingPlan?.progressPercent || 0,
      assignees,
      planDate,
      expectedEndTime,
      dueAt,
    },
    { now: new Date() },
  );

  return {
    title,
    description,
    customerName: resolvedCustomerName,
    customer,
    customerSnapshot,
    location: resolvedLocation,
    planDate,
    startTime,
    expectedEndTime,
    dueAt: dueAt || recalculated.dueAt,
    priority,
    taskType,
    status: recalculated.status,
    progressPercent: recalculated.progressPercent,
    assignees: recalculated.assignees,
    supervisor: supervisor || null,
    teamLeader: teamLeader || null,
    project,
    projectNameSnapshot,
    adminNotes,
    attachments,
  };
};

const buildPlanRecipients = async ({ plan, excludeUserIds = [] } = {}) => {
  const recipients = new Set();
  const assigneeIds = (plan.assignees || []).map((assignee) => toId(assignee.user)).filter(Boolean);
  assigneeIds.forEach((userId) => recipients.add(userId));
  const teamLeaderId = toId(plan.teamLeader);
  if (teamLeaderId) recipients.add(teamLeaderId);

  for (const assigneeId of assigneeIds) {
    const audience = await resolveNotificationAudience({
      userRepository,
      actorId: assigneeId,
      watchPermission: NotificationWatchPermission.OPERATION,
      excludeUserIds: [],
    });
    audience.forEach((userId) => recipients.add(userId));
  }

  excludeUserIds.forEach((userId) => recipients.delete(toId(userId)));
  return [...recipients].filter(Boolean);
};

const notifyPlanEvent = async ({ req, plan, type, titleAr, messageAr, action, metadata = {}, excludeUserIds = [] } = {}) => {
  const recipients = await buildPlanRecipients({ plan, excludeUserIds });
  await notificationService.notifyDailyWorkPlanEvent(recipients, {
    type,
    titleAr,
    messageAr,
    planId: toId(plan),
    planTitle: plan.title,
    status: plan.status,
    planDate: plan.planDate,
    progressPercent: plan.progressPercent,
    actorId: req.user.id,
    createdBy: req.user.id,
    action,
    metadata,
  });

  const operationRecipients = await buildPlanRecipients({ plan, excludeUserIds: [req.user.id] });
  await notificationService.notifyOperationActivity(operationRecipients, {
    titleAr,
    actorName: actorLabel(req),
    actionLabel: titleAr,
    entityLabel: plan.title || 'بلان يومي',
    occurredAt: new Date(),
    metadata: {
      entityType: 'DAILY_WORK_PLAN',
      entityId: toId(plan),
      action,
      ...metadata,
    },
  });
};

const loadPlanOrThrow = async (id) => {
  const plan = await dailyWorkPlanRepository.findById(id);
  if (!plan) throw new AppError('Daily work plan not found', 404);
  return plan;
};

const syncOverduePlans = async () => {
  await syncOverdueDailyWorkPlans({
    repository: dailyWorkPlanRepository,
    now: new Date(),
  });
};

export const listDailyWorkPlans = asyncHandler(async (req, res) => {
  await syncOverduePlans();
  const { filter } = await buildFilterFromQuery(req);
  const plans = await dailyWorkPlanRepository.list(filter, { limit: 500 });
  const summary = buildDailyWorkPlanSummary(plans, { today: new Date() });
  const productivity = buildDailyProductivitySummary(plans).slice(0, 10);

  res.json({ plans, summary, productivity });
});

export const getDailyWorkPlanSummary = asyncHandler(async (req, res) => {
  await syncOverduePlans();
  const { filter } = await buildFilterFromQuery(req);
  const plans = await dailyWorkPlanRepository.list(filter, { limit: 500 });
  res.json({
    summary: buildDailyWorkPlanSummary(plans, { today: new Date() }),
    productivity: buildDailyProductivitySummary(plans),
  });
});

export const getDailyWorkPlanById = asyncHandler(async (req, res) => {
  await syncOverduePlans();
  const plan = await loadPlanOrThrow(req.params.id);
  await ensurePlanVisibleToActor(req, plan);
  res.json({ plan });
});

export const createDailyWorkPlan = asyncHandler(async (req, res) => {
  const payload = await buildPlanPayload({ req });
  const timeline = [
    buildTimelineEntry({
      type: 'PLAN_CREATED',
      actorId: req.user.id,
      actorName: actorLabel(req),
      actorRole: req.user.role,
      message: `تم إنشاء بلان عمل يومي بعنوان "${payload.title}".`,
      metadata: {
        planDate: payload.planDate,
        assigneesCount: payload.assignees.length,
      },
    }),
    buildTimelineEntry({
      type: 'PLAN_ASSIGNED',
      actorId: req.user.id,
      actorName: actorLabel(req),
      actorRole: req.user.role,
      message: 'تم إسناد البلان إلى الموظفين المحددين.',
      metadata: {
        assigneeIds: payload.assignees.map((item) => toId(item.user)),
      },
    }),
  ];

  const plan = await dailyWorkPlanRepository.create({
    ...payload,
    supervisor: payload.supervisor || req.user.id,
    createdBy: req.user.id,
    timeline,
    attachments: payload.attachments,
    lastUpdatedAt: new Date(),
  });

  if (payload.customer) {
    await customerRepository.updateById(payload.customer, {
      $addToSet: { linkedDailyWorkPlans: toId(plan) },
      lastModifiedAt: new Date(),
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'DAILY_WORK_PLAN_CREATED',
    entityType: 'DAILY_WORK_PLAN',
    entityId: toId(plan),
    after: snapshotPlan(plan),
    req,
  });

  await notifyPlanEvent({
    req,
    plan,
    type: 'DAILY_WORK_PLAN_CREATED',
    titleAr: 'إنشاء بلان عمل يومي',
    messageAr: `تم إنشاء البلان "${plan.title}" وإسناده إلى ${payload.assignees.length} موظف/موظفين.`,
    action: 'DAILY_WORK_PLAN_CREATED',
  });

  res.status(201).json({ plan });
});

export const updateDailyWorkPlan = asyncHandler(async (req, res) => {
  const existingPlan = await loadPlanOrThrow(req.params.id);
  await ensurePlanVisibleToActor(req, existingPlan);

  const before = snapshotPlan(existingPlan);
  const payload = await buildPlanPayload({ req, existingPlan });

  const timeline = buildTimelineEntry({
    type: 'PLAN_UPDATED',
    actorId: req.user.id,
    actorName: actorLabel(req),
    actorRole: req.user.role,
    message: 'تم تعديل بيانات البلان اليومي.',
  });

  const updatePayload = {
    ...payload,
    lastUpdatedAt: new Date(),
    $push: {
      timeline,
      ...(payload.attachments.length ? { attachments: { $each: payload.attachments } } : {}),
    },
  };
  delete updatePayload.attachments;

  const plan = await dailyWorkPlanRepository.updateById(req.params.id, updatePayload);

  if (payload.customer) {
    await customerRepository.updateById(payload.customer, {
      $addToSet: { linkedDailyWorkPlans: toId(plan) },
      lastModifiedAt: new Date(),
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'DAILY_WORK_PLAN_UPDATED',
    entityType: 'DAILY_WORK_PLAN',
    entityId: toId(plan),
    before,
    after: snapshotPlan(plan),
    req,
  });

  await notifyPlanEvent({
    req,
    plan,
    type: 'DAILY_WORK_PLAN_UPDATED',
    titleAr: 'تعديل بلان عمل يومي',
    messageAr: `تم تحديث البلان "${plan.title}".`,
    action: 'DAILY_WORK_PLAN_UPDATED',
  });

  res.json({ plan });
});

const resolveActorAssigneeIndex = (plan, actorId, requestedAssigneeId = '') => {
  const targetAssigneeId = requestedAssigneeId || actorId;
  return (plan.assignees || []).findIndex((assignee) => toId(assignee.user) === toId(targetAssigneeId));
};

export const updateDailyWorkPlanStatus = asyncHandler(async (req, res) => {
  const requestedStatus = toCleanString(req.body.status);
  const note = toCleanString(req.body.note);
  const assigneeId = toCleanString(req.body.assigneeId);

  if (!requestedStatus) throw new AppError('Status is required', 400);
  assertEnumValue(requestedStatus, Object.values(DailyWorkPlanStatus), 'status');

  const plan = await loadPlanOrThrow(req.params.id);
  const managedUserIds = await ensurePlanVisibleToActor(req, plan);
  const canManage = userCanManageDailyWorkPlans(req.user);
  let nextAssignees = (plan.assignees || []).map((item) => normalizeAssigneeInput(item));

  if (canManage) {
    if (assigneeId) {
      const targetIndex = resolveActorAssigneeIndex(plan, req.user.id, assigneeId);
      if (targetIndex < 0) throw new AppError('Assignee not found in this plan', 404);
      if (!isUserWithinManagedScope({ managedUserIds, userId: assigneeId })) {
        throw new AppError('You cannot update assignees outside your scope', 403);
      }
      nextAssignees[targetIndex] = {
        ...nextAssignees[targetIndex],
        status: requestedStatus,
        progressPercent: requestedStatus === DailyWorkPlanStatus.COMPLETED ? 100 : nextAssignees[targetIndex].progressPercent,
        adminNotes: note || nextAssignees[targetIndex].adminNotes,
        completedAt: requestedStatus === DailyWorkPlanStatus.COMPLETED ? new Date() : nextAssignees[targetIndex].completedAt,
        lastUpdatedAt: new Date(),
      };
    } else {
      nextAssignees = nextAssignees.map((assignee) => ({
        ...assignee,
        status: requestedStatus,
        progressPercent: requestedStatus === DailyWorkPlanStatus.COMPLETED ? 100 : assignee.progressPercent,
        completedAt: requestedStatus === DailyWorkPlanStatus.COMPLETED ? new Date() : assignee.completedAt,
        startedAt: requestedStatus === DailyWorkPlanStatus.IN_PROGRESS ? (assignee.startedAt || new Date()) : assignee.startedAt,
        adminNotes: note || assignee.adminNotes,
        lastUpdatedAt: new Date(),
      }));
    }
  } else {
    if (!userCanUpdateAssignments(req.user)) {
      throw new AppError('You are not allowed to update this plan', 403);
    }
    const isTeamLeader = toId(plan.teamLeader) === toId(req.user.id);
    if (!isTeamLeader) {
      throw new AppError('\u0641\u0642\u0637 \u0642\u0627\u0626\u062f \u0627\u0644\u0641\u0631\u064a\u0642 \u064a\u0645\u0643\u0646\u0647 \u062a\u062d\u062f\u064a\u062b \u062d\u0627\u0644\u0629 \u0627\u0644\u0628\u0644\u0627\u0646 \u0648\u0625\u0631\u0633\u0627\u0644\u0647 \u0644\u0644\u0627\u0639\u062a\u0645\u0627\u062f', 403);
    }
    if (![DailyWorkPlanStatus.IN_PROGRESS, DailyWorkPlanStatus.PENDING_APPROVAL, DailyWorkPlanStatus.STOPPED].includes(requestedStatus)) {
      throw new AppError('Employees can only move the plan to in progress, waiting approval, or stopped', 403);
    }

    const ratingsSource = requestedStatus === DailyWorkPlanStatus.PENDING_APPROVAL
      ? parseApprovalPointsInput(req.body.ratingsByAssignee)
      : {};

    nextAssignees = nextAssignees.map((assignee) => {
      const assigneeUserId = toId(assignee.user);
      const rating = ratingsSource[assigneeUserId];
      const parsedRating = rating !== undefined && rating !== null && rating !== ''
        ? Math.max(0, Math.min(100, Math.round(Number(rating) || 0)))
        : assignee.teamLeaderRating ?? null;

      return {
        ...assignee,
        status: requestedStatus,
        employeeNotes: note || assignee.employeeNotes,
        progressPercent: requestedStatus === DailyWorkPlanStatus.PENDING_APPROVAL ? 100 : assignee.progressPercent,
        startedAt: requestedStatus === DailyWorkPlanStatus.IN_PROGRESS
          ? assignee.startedAt || new Date()
          : assignee.startedAt,
        completedAt: requestedStatus === DailyWorkPlanStatus.PENDING_APPROVAL ? new Date() : assignee.completedAt,
        teamLeaderRating: requestedStatus === DailyWorkPlanStatus.PENDING_APPROVAL ? parsedRating : assignee.teamLeaderRating,
        lastUpdatedAt: new Date(),
      };
    });
  }

  const recalculated = recalculatePlanState(
    {
      ...plan.toObject(),
      assignees: nextAssignees,
      status: canManage && !assigneeId ? requestedStatus : plan.status,
    },
    { now: new Date() },
  );

  const message = requestedStatus === DailyWorkPlanStatus.IN_PROGRESS
    ? 'تم بدء تنفيذ البلان.'
    : requestedStatus === DailyWorkPlanStatus.PENDING_APPROVAL
      ? 'تم إنهاء التنفيذ وإرسال البلان للاعتماد.'
      : `تم تحديث حالة البلان إلى ${dailyWorkPlanStatusLabelMap[requestedStatus] || requestedStatus}.`;
  const timeline = buildTimelineEntry({
    type: 'PLAN_STATUS_UPDATED',
    actorId: req.user.id,
    actorName: actorLabel(req),
    actorRole: req.user.role,
    message,
    metadata: {
      requestedStatus,
      assigneeId: assigneeId || req.user.id,
    },
  });

  const updatedPlan = await dailyWorkPlanRepository.updateById(req.params.id, {
    status: recalculated.status,
    progressPercent: recalculated.progressPercent,
    assignees: recalculated.assignees,
    dueAt: recalculated.dueAt,
    lastUpdatedAt: new Date(),
    $push: { timeline },
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'DAILY_WORK_PLAN_STATUS_CHANGED',
    entityType: 'DAILY_WORK_PLAN',
    entityId: toId(updatedPlan),
    before: snapshotPlan(plan),
    after: snapshotPlan(updatedPlan),
    req,
  });

  await notifyPlanEvent({
    req,
    plan: updatedPlan,
    type: requestedStatus === DailyWorkPlanStatus.PENDING_APPROVAL ? 'DAILY_WORK_PLAN_COMPLETED' : 'DAILY_WORK_PLAN_UPDATED',
    titleAr: requestedStatus === DailyWorkPlanStatus.PENDING_APPROVAL ? 'إنهاء بلان عمل يومي' : 'تحديث حالة بلان يومي',
    messageAr: `${message} (${updatedPlan.title})`,
    action: 'DAILY_WORK_PLAN_STATUS_CHANGED',
  });

  res.json({ plan: updatedPlan });
});

export const updateDailyWorkPlanProgress = asyncHandler(async (req, res) => {
  const progressPercent = clampProgress(req.body.progressPercent);
  const note = toCleanString(req.body.note);
  const assigneeId = toCleanString(req.body.assigneeId);
  const plan = await loadPlanOrThrow(req.params.id);
  const managedUserIds = await ensurePlanVisibleToActor(req, plan);
  const canManage = userCanManageDailyWorkPlans(req.user);
  const isTeamLeader = toId(plan.teamLeader) === toId(req.user.id);
  const attachments = normalizeRequestFiles(req).map((file) => createStoredAttachment(file, req.user));

  if (!canManage && !isTeamLeader) {
    throw new AppError('\u0641\u0642\u0637 \u0642\u0627\u0626\u062f \u0627\u0644\u0641\u0631\u064a\u0642 \u0623\u0648 \u0627\u0644\u0645\u062f\u064a\u0631 \u064a\u0645\u0643\u0646\u0647 \u062a\u062d\u062f\u064a\u062b \u0646\u0633\u0628\u0629 \u0627\u0644\u0625\u0646\u062c\u0627\u0632', 403);
  }

  let nextAssignees;

  if (canManage && assigneeId) {
    if (!isUserWithinManagedScope({ managedUserIds, userId: assigneeId })) {
      throw new AppError('You cannot update assignees outside your scope', 403);
    }
    const targetIndex = resolveActorAssigneeIndex(plan, req.user.id, assigneeId);
    if (targetIndex < 0) throw new AppError('Assignee not found in this plan', 404);
    nextAssignees = (plan.assignees || []).map((item, index) => {
      const normalized = normalizeAssigneeInput(item);
      if (index !== targetIndex) return normalized;
      return {
        ...normalized,
        progressPercent,
        status: progressPercent >= 100
          ? DailyWorkPlanStatus.PENDING_APPROVAL
          : (normalized.status === DailyWorkPlanStatus.NEW ? DailyWorkPlanStatus.IN_PROGRESS : normalized.status),
        adminNotes: note || normalized.adminNotes,
        startedAt: progressPercent > 0 ? (normalized.startedAt || new Date()) : normalized.startedAt,
        completedAt: progressPercent >= 100 ? new Date() : normalized.completedAt,
        attachments: attachments.length ? [...normalized.attachments, ...attachments] : normalized.attachments,
        lastUpdatedAt: new Date(),
      };
    });
  } else {
    nextAssignees = (plan.assignees || []).map((item) => {
      const normalized = normalizeAssigneeInput(item);
      return {
        ...normalized,
        progressPercent,
        status: progressPercent >= 100
          ? DailyWorkPlanStatus.PENDING_APPROVAL
          : (normalized.status === DailyWorkPlanStatus.NEW ? DailyWorkPlanStatus.IN_PROGRESS : normalized.status),
        employeeNotes: !canManage ? (note || normalized.employeeNotes) : normalized.employeeNotes,
        adminNotes: canManage ? (note || normalized.adminNotes) : normalized.adminNotes,
        startedAt: progressPercent > 0 ? (normalized.startedAt || new Date()) : normalized.startedAt,
        completedAt: progressPercent >= 100 ? new Date() : normalized.completedAt,
        attachments: attachments.length ? [...normalized.attachments, ...attachments] : normalized.attachments,
        lastUpdatedAt: new Date(),
      };
    });
  }

  const recalculated = recalculatePlanState(
    { ...plan.toObject(), assignees: nextAssignees },
    { now: new Date() },
  );

  const isSubmittedForApproval = progressPercent >= 100;
  const timelineMessage = isSubmittedForApproval
    ? `تم إنهاء التنفيذ وإرسال البلان للاعتماد${note ? ` - ${note}` : ''}.`
    : `تم تحديث نسبة الإنجاز إلى ${progressPercent}%${note ? ` - ${note}` : ''}.`;

  const timeline = buildTimelineEntry({
    type: isSubmittedForApproval ? 'PLAN_STATUS_UPDATED' : 'PLAN_PROGRESS_UPDATED',
    actorId: req.user.id,
    actorName: actorLabel(req),
    actorRole: req.user.role,
    message: timelineMessage,
    metadata: {
      progressPercent,
      assigneeId: assigneeId || req.user.id,
      attachmentsCount: attachments.length,
      ...(isSubmittedForApproval ? { requestedStatus: DailyWorkPlanStatus.PENDING_APPROVAL } : {}),
    },
  });

  const updatedPlan = await dailyWorkPlanRepository.updateById(req.params.id, {
    status: recalculated.status,
    progressPercent: recalculated.progressPercent,
    assignees: recalculated.assignees,
    dueAt: recalculated.dueAt,
    lastUpdatedAt: new Date(),
    ...(attachments.length ? { $push: { attachments: { $each: attachments }, timeline } } : { $push: { timeline } }),
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'DAILY_WORK_PLAN_PROGRESS_UPDATED',
    entityType: 'DAILY_WORK_PLAN',
    entityId: toId(updatedPlan),
    before: snapshotPlan(plan),
    after: snapshotPlan(updatedPlan),
    req,
  });

  await notifyPlanEvent({
    req,
    plan: updatedPlan,
    type: isSubmittedForApproval ? 'DAILY_WORK_PLAN_COMPLETED' : 'DAILY_WORK_PLAN_PROGRESS_UPDATED',
    titleAr: isSubmittedForApproval ? 'إنهاء بلان عمل يومي' : 'تحديث نسبة إنجاز البلان',
    messageAr: isSubmittedForApproval
      ? `تم إنهاء التنفيذ وإرسال البلان "${updatedPlan.title}" للاعتماد.`
      : `تم تحديث نسبة إنجاز "${updatedPlan.title}" إلى ${progressPercent}%.`,
    action: isSubmittedForApproval ? 'DAILY_WORK_PLAN_STATUS_CHANGED' : 'DAILY_WORK_PLAN_PROGRESS_UPDATED',
    metadata: {
      progressPercent,
      assigneeId: assigneeId || req.user.id,
    },
  });

  res.json({ plan: updatedPlan });
});

export const postponeDailyWorkPlan = asyncHandler(async (req, res) => {
  const reason = toCleanString(req.body.reason);
  const plan = await loadPlanOrThrow(req.params.id);
  const targetDate = toDateOnly(req.body.targetDate || req.body.postponedTo || getNextPlanDate(new Date(), 1));
  const targetTime = sanitizeTimeValue(
    req.body.targetTime || req.body.postponedTime || plan.expectedEndTime || '23:59',
    plan.expectedEndTime || '23:59',
  );
  const postponedTo = combinePlanDateTime(targetDate, targetTime, plan.expectedEndTime || '23:59');
  const canManage = userCanManageDailyWorkPlans(req.user);
  const assigneeIndex = resolveActorAssigneeIndex(plan, req.user.id);

  await ensurePlanVisibleToActor(req, plan);

  if (!targetDate || !postponedTo) {
    throw new AppError('Target date and time are required', 400);
  }

  if (!canManage && assigneeIndex < 0) {
    throw new AppError('You are not allowed to postpone this plan', 403);
  }

  const nextAssignees = (plan.assignees || []).map((item, index) => {
    const normalized = normalizeAssigneeInput(item);
    if (!canManage && index !== assigneeIndex) return normalized;

    return {
      ...normalized,
      status: DailyWorkPlanStatus.POSTPONED,
      delayRequest: {
        requestedAt: new Date(),
        requestedBy: req.user.id,
        requestedByName: actorLabel(req),
        reason,
        targetDate: postponedTo,
        status: canManage ? 'APPROVED' : 'REQUESTED',
      },
      lastUpdatedAt: new Date(),
    };
  });

  const recalculated = recalculatePlanState(
    {
      ...plan.toObject(),
      assignees: nextAssignees,
      status: DailyWorkPlanStatus.POSTPONED,
      postponedTo,
    },
    { now: new Date() },
  );

  const timeline = buildTimelineEntry({
    type: 'PLAN_POSTPONED',
    actorId: req.user.id,
    actorName: actorLabel(req),
    actorRole: req.user.role,
    message: `تم ${canManage ? 'تأجيل' : 'طلب تأجيل'} البلان إلى ${formatDateTimeAr(postponedTo)}${reason ? ` - ${reason}` : ''}.`,
    metadata: {
      targetDate: postponedTo,
      targetTime,
      reason,
      requestedBy: req.user.id,
    },
  });

  const updatedPlan = await dailyWorkPlanRepository.updateById(req.params.id, {
    status: DailyWorkPlanStatus.POSTPONED,
    progressPercent: recalculated.progressPercent,
    assignees: recalculated.assignees,
    postponedTo,
    lastUpdatedAt: new Date(),
    $push: { timeline },
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'DAILY_WORK_PLAN_POSTPONED',
    entityType: 'DAILY_WORK_PLAN',
    entityId: toId(updatedPlan),
    before: snapshotPlan(plan),
    after: snapshotPlan(updatedPlan),
    req,
  });

  await notifyPlanEvent({
    req,
    plan: updatedPlan,
    type: 'DAILY_WORK_PLAN_POSTPONED',
    titleAr: 'تأجيل بلان عمل يومي',
    messageAr: `تم تأجيل البلان "${updatedPlan.title}" إلى ${formatDateTimeAr(postponedTo)}.`,
    action: 'DAILY_WORK_PLAN_POSTPONED',
    metadata: {
      targetDate: postponedTo,
      targetTime,
      reason,
    },
  });

  res.json({ plan: updatedPlan });
});

export const rolloverDailyWorkPlan = asyncHandler(async (req, res) => {
  const plan = await loadPlanOrThrow(req.params.id);
  await ensurePlanVisibleToActor(req, plan);

  const nextPlanDate = toDateOnly(req.body.targetDate || req.body.planDate || getNextPlanDate(plan.planDate, 1));
  if (!nextPlanDate) throw new AppError('Target date is required', 400);

  const nextDueAt = combinePlanDateTime(nextPlanDate, plan.expectedEndTime, '23:59');
  const nextAssignees = (plan.assignees || []).map((item) => {
    const normalized = normalizeAssigneeInput(item);
    if ([DailyWorkPlanStatus.OVERDUE, DailyWorkPlanStatus.NEW, DailyWorkPlanStatus.POSTPONED, DailyWorkPlanStatus.STOPPED].includes(normalized.status)) {
      return {
        ...normalized,
        status: normalized.progressPercent > 0 ? DailyWorkPlanStatus.IN_PROGRESS : DailyWorkPlanStatus.NEW,
        lastUpdatedAt: new Date(),
      };
    }
    return normalized;
  });

  const recalculated = recalculatePlanState(
    {
      ...plan.toObject(),
      assignees: nextAssignees,
      planDate: nextPlanDate,
      dueAt: nextDueAt,
      postponedTo: null,
      status: DailyWorkPlanStatus.NEW,
    },
    { now: new Date() },
  );

  const timeline = buildTimelineEntry({
    type: 'PLAN_ROLLED_OVER',
    actorId: req.user.id,
    actorName: actorLabel(req),
    actorRole: req.user.role,
    message: `تم ترحيل البلان إلى ${formatPlanDateKey(nextPlanDate)} مع الاحتفاظ بتاريخ الخطة الأصلي.`,
    metadata: {
      previousPlanDate: plan.planDate,
      nextPlanDate,
    },
  });

  const updatedPlan = await dailyWorkPlanRepository.updateById(req.params.id, {
    planDate: nextPlanDate,
    originalPlanDate: plan.originalPlanDate || plan.planDate,
    postponedTo: null,
    rolledOverCount: Number(plan.rolledOverCount || 0) + 1,
    status: recalculated.status,
    progressPercent: recalculated.progressPercent,
    assignees: recalculated.assignees,
    dueAt: nextDueAt,
    lastUpdatedAt: new Date(),
    $push: { timeline },
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'DAILY_WORK_PLAN_ROLLED_OVER',
    entityType: 'DAILY_WORK_PLAN',
    entityId: toId(updatedPlan),
    before: snapshotPlan(plan),
    after: snapshotPlan(updatedPlan),
    req,
  });

  await notifyPlanEvent({
    req,
    plan: updatedPlan,
    type: 'DAILY_WORK_PLAN_UPDATED',
    titleAr: 'ترحيل بلان عمل يومي',
    messageAr: `تم ترحيل البلان "${updatedPlan.title}" إلى ${formatPlanDateKey(nextPlanDate)}.`,
    action: 'DAILY_WORK_PLAN_ROLLED_OVER',
    metadata: {
      nextPlanDate,
      previousPlanDate: plan.planDate,
    },
  });

  res.json({ plan: updatedPlan });
});

export const approveDailyWorkPlan = asyncHandler(async (req, res) => {
  const note = toCleanString(req.body.note);
  const plan = await loadPlanOrThrow(req.params.id);
  await ensurePlanVisibleToActor(req, plan);
  if (!(plan.assignees || []).length) {
    throw new AppError('Daily work plan has no assignees', 400);
  }
  if (plan.isApproved || plan.status === DailyWorkPlanStatus.COMPLETED) {
    throw new AppError('Daily work plan has already been approved', 409);
  }
  if (plan.status !== DailyWorkPlanStatus.PENDING_APPROVAL) {
    throw new AppError('Only plans waiting for approval can be approved', 400);
  }

  if (toId(plan.teamLeader) === toId(req.user.id) && req.user.role !== 'GENERAL_MANAGER') {
    throw new AppError('قائد الفريق لا يمكنه اعتماد البلان الذي يقوده بنفسه', 403);
  }

  const { assigneeAwards, totalAwardedPoints } = resolveApprovalPoints(
    plan,
    req.body.pointsByAssignee || req.body.assigneePoints,
  );
  const approvalTimestamp = new Date();
  const approvalPointsMap = new Map(
    assigneeAwards.map((item) => [item.userId, Number(item.points || 0)]),
  );

  const nextAssignees = (plan.assignees || []).map((item) => {
    const normalized = normalizeAssigneeInput(item);
    const assigneeUserId = toId(item.user);
    const awardedPoints = approvalPointsMap.get(assigneeUserId) || 0;
    return {
      ...normalized,
      status: DailyWorkPlanStatus.COMPLETED,
      progressPercent: 100,
      completedAt: normalized.completedAt || approvalTimestamp,
      adminNotes: note || normalized.adminNotes,
      pointsAwarded: awardedPoints,
      pointsAwardedBy: awardedPoints > 0 ? req.user.id : null,
      pointsAwardedAt: awardedPoints > 0 ? approvalTimestamp : null,
      pointsAwardNote: note || normalized.pointsAwardNote,
      lastUpdatedAt: approvalTimestamp,
    };
  });

  const updatedPlan = await dailyWorkPlanRepository.updateById(req.params.id, {
    status: DailyWorkPlanStatus.COMPLETED,
    progressPercent: 100,
    pointsAwardedTotal: totalAwardedPoints,
    assignees: nextAssignees,
    approvedBy: req.user.id,
    approvedAt: approvalTimestamp,
    isApproved: true,
    lastUpdatedAt: approvalTimestamp,
    $push: {
      timeline: buildTimelineEntry({
        type: 'PLAN_APPROVED',
        actorId: req.user.id,
        actorName: actorLabel(req),
        actorRole: req.user.role,
        message: `تم اعتماد البلان${note ? ` - ${note}` : ''}.`,
        metadata: {
          note,
          totalAwardedPoints,
          assigneeAwards,
        },
      }),
    },
  });

  const pointsAwards = [];
  const pointsErrors = [];
  for (const assigneeAward of assigneeAwards) {
    if (!assigneeAward.userId || assigneeAward.points <= 0) {
      continue;
    }

    try {
      const outcome = await performancePointsService.awardPoints({
        userId: assigneeAward.userId,
        points: assigneeAward.points,
        category: 'DAILY_WORK_PLAN_APPROVAL',
        reason: `اعتماد بلان العمل اليومي: ${updatedPlan.title}`,
        approvedBy: req.user.id,
        sourceAction: 'DAILY_WORK_PLAN_APPROVED',
        metadata: {
          dailyWorkPlanId: toId(updatedPlan),
          planTitle: updatedPlan.title,
          planDate: updatedPlan.planDate,
          pointsAwarded: assigneeAward.points,
        },
        actorId: req.user.id,
        req,
      });

      const nextPointsTotal = Number(outcome.user?.pointsTotal || 0);
      const pointsAwardEntry = {
        userId: assigneeAward.userId,
        fullName: assigneeAward.fullName || outcome.user?.fullName || '',
        points: assigneeAward.points,
        pointsTotal: nextPointsTotal,
        level: Number(outcome.user?.level || 1),
      };
      pointsAwards.push(pointsAwardEntry);

      try {
        await notificationService.notifySystem(
          assigneeAward.userId,
          'تم اعتماد بلان العمل اليومي ومنح نقاط',
          `تم اعتماد البلان "${updatedPlan.title}" وتم منحك ${assigneeAward.points} نقطة. مجموع نقاطك الآن ${nextPointsTotal} نقطة.`,
          {
            planId: toId(updatedPlan),
            planTitle: updatedPlan.title,
            pointsGranted: assigneeAward.points,
            totalPoints: nextPointsTotal,
            approvedAt: approvalTimestamp,
          },
        );
      } catch (notifErr) {
        console.error(`[Approve] Failed to notify assignee ${assigneeAward.userId}:`, notifErr.message);
      }
    } catch (awardErr) {
      console.error(`[Approve] Failed to award points to ${assigneeAward.userId}:`, awardErr.message);
      pointsErrors.push({ userId: assigneeAward.userId, fullName: assigneeAward.fullName, error: awardErr.message });
    }
  }

  try {
    await auditService.log({
      actorId: req.user.id,
      action: 'DAILY_WORK_PLAN_APPROVED',
      entityType: 'DAILY_WORK_PLAN',
      entityId: toId(updatedPlan),
      before: snapshotPlan(plan),
      after: snapshotPlan(updatedPlan),
      req,
    });
  } catch (auditErr) {
    console.error('[Approve] Audit log failed:', auditErr.message);
  }

  try {
    await notifyPlanEvent({
      req,
      plan: updatedPlan,
      type: 'DAILY_WORK_PLAN_APPROVED',
      titleAr: 'اعتماد بلان عمل يومي',
      messageAr: `تم اعتماد البلان "${updatedPlan.title}" بشكل نهائي${totalAwardedPoints > 0 ? ` ومنح ${totalAwardedPoints} نقطة.` : '.'}`,
      action: 'DAILY_WORK_PLAN_APPROVED',
      metadata: {
        note,
        totalAwardedPoints,
        pointsAwards,
      },
    });
  } catch (notifyErr) {
    console.error('[Approve] Plan event notification failed:', notifyErr.message);
  }

  const linkedFieldInspectionId = toId(updatedPlan.fieldInspection?.ticket);
  if (linkedFieldInspectionId) {
    try {
      await fieldInspectionTicketRepository.updateById(linkedFieldInspectionId, {
        status: FieldInspectionStatus.CLOSED,
        closedAt: new Date(),
        closedBy: req.user.id,
        closedByName: actorLabel(req),
        $push: {
          timeline: buildFieldInspectionTimelineEntry({
            type: 'FIELD_INSPECTION_AUTO_CLOSED_FROM_DAILY_PLAN',
            actor: req.user.id,
            actorName: actorLabel(req),
            actorRole: req.user.role,
            message: `تم إغلاق تذكرة الكشف تلقائيًا بعد اعتماد البلان ${updatedPlan.title}.`,
            metadata: { planId: toId(updatedPlan) },
          }),
        },
      });
    } catch (fieldInspectionErr) {
      console.error('[Approve] Failed to close linked field inspection:', fieldInspectionErr.message);
    }
  }

  res.json({
    plan: updatedPlan,
    grantedPoints: totalAwardedPoints,
    pointsAwards,
    ...(pointsErrors.length ? { pointsErrors } : {}),
  });
});

export const archiveDailyWorkPlan = asyncHandler(async (req, res) => {
  const plan = await loadPlanOrThrow(req.params.id);
  await ensurePlanVisibleToActor(req, plan);

  if (!userCanArchivePlan(req.user, plan)) {
    throw new AppError('You are not allowed to archive this daily work plan', 403);
  }
  if (plan.archived) {
    throw new AppError('Daily work plan is already archived', 409);
  }
  if (!isPlanReadyForArchive(plan)) {
    throw new AppError('Only 100% completed plans can be archived', 400);
  }

  const archivedAt = new Date();
  const updatedPlan = await dailyWorkPlanRepository.archiveById(
    req.params.id,
    req.user.id,
    buildTimelineEntry({
      type: 'PLAN_ARCHIVED',
      actorId: req.user.id,
      actorName: actorLabel(req),
      actorRole: req.user.role,
      message: 'تمت أرشفة البلان ونقله إلى قائمة الأرشيف.',
      metadata: {
        archivedAt,
      },
    }),
    {
      lastUpdatedAt: archivedAt,
    },
  );

  await auditService.log({
    actorId: req.user.id,
    action: 'DAILY_WORK_PLAN_ARCHIVED',
    entityType: 'DAILY_WORK_PLAN',
    entityId: toId(updatedPlan),
    before: snapshotPlan(plan),
    after: snapshotPlan(updatedPlan),
    req,
  });

  await notifyPlanEvent({
    req,
    plan: updatedPlan,
    type: 'DAILY_WORK_PLAN_ARCHIVED',
    titleAr: 'أرشفة بلان عمل يومي',
    messageAr: `تمت أرشفة البلان "${updatedPlan.title}" ونقله إلى قائمة الأرشيف.`,
    action: 'DAILY_WORK_PLAN_ARCHIVED',
    metadata: {
      archivedAt: updatedPlan.archivedAt,
    },
  });

  res.json({ plan: updatedPlan });
});

export const unarchiveDailyWorkPlan = asyncHandler(async (req, res) => {
  const plan = await loadPlanOrThrow(req.params.id);
  await ensurePlanVisibleToActor(req, plan);

  if (!userCanArchivePlan(req.user, plan)) {
    throw new AppError('You are not allowed to restore this daily work plan', 403);
  }
  if (!plan.archived) {
    throw new AppError('Daily work plan is not archived', 400);
  }

  const restoredAt = new Date();
  const updatedPlan = await dailyWorkPlanRepository.unarchiveById(
    req.params.id,
    buildTimelineEntry({
      type: 'PLAN_UNARCHIVED',
      actorId: req.user.id,
      actorName: actorLabel(req),
      actorRole: req.user.role,
      message: 'تمت إعادة البلان من الأرشيف إلى القائمة الرئيسية.',
      metadata: {
        restoredAt,
      },
    }),
    {
      lastUpdatedAt: restoredAt,
    },
  );

  await auditService.log({
    actorId: req.user.id,
    action: 'DAILY_WORK_PLAN_UNARCHIVED',
    entityType: 'DAILY_WORK_PLAN',
    entityId: toId(updatedPlan),
    before: snapshotPlan(plan),
    after: snapshotPlan(updatedPlan),
    req,
  });

  await notifyPlanEvent({
    req,
    plan: updatedPlan,
    type: 'DAILY_WORK_PLAN_UNARCHIVED',
    titleAr: 'استرجاع بلان عمل يومي',
    messageAr: `تمت إعادة البلان "${updatedPlan.title}" من الأرشيف.`,
    action: 'DAILY_WORK_PLAN_UNARCHIVED',
  });

  res.json({ plan: updatedPlan });
});

export const deleteDailyWorkPlan = asyncHandler(async (req, res) => {
  const plan = await loadPlanOrThrow(req.params.id);
  await ensurePlanVisibleToActor(req, plan);

  await dailyWorkPlanRepository.deleteById(req.params.id);

  await auditService.log({
    actorId: req.user.id,
    action: 'DAILY_WORK_PLAN_DELETED',
    entityType: 'DAILY_WORK_PLAN',
    entityId: toId(plan),
    before: snapshotPlan(plan),
    req,
  });

  await notifyPlanEvent({
    req,
    plan,
    type: 'DAILY_WORK_PLAN_UPDATED',
    titleAr: 'حذف بلان عمل يومي',
    messageAr: `تم حذف البلان "${plan.title}".`,
    action: 'DAILY_WORK_PLAN_DELETED',
  });

  res.json({ success: true });
});

const loadPlansForExport = async (req) => {
  await syncOverduePlans();
  const { filter } = await buildFilterFromQuery(req);
  return dailyWorkPlanRepository.list(filter, { limit: 1000 });
};

const resolveExportUserLabel = async (userId) => {
  const id = toCleanString(userId);
  if (!id) return '';
  try {
    const user = await userRepository.findById(id);
    return user?.fullName || user?.employeeCode || id;
  } catch {
    return id;
  }
};

const resolveExportProjectLabel = async (projectId) => {
  const id = toCleanString(projectId);
  if (!id) return '';
  try {
    const project = await projectRepository.findById(id);
    return project?.name || project?.code || id;
  } catch {
    return id;
  }
};

const buildDailyWorkPlansExportContext = async (req) => {
  const planDate = toCleanString(req.query.planDate || req.query.date);
  const dateFrom = toCleanString(req.query.dateFrom);
  const dateTo = toCleanString(req.query.dateTo);
  const search = toCleanString(req.query.search);
  const archivedQuery = toCleanString(req.query.archived).toLowerCase();
  const employeeLabel = await resolveExportUserLabel(req.query.employee || req.query.assignee);
  const supervisorLabel = await resolveExportUserLabel(req.query.supervisor);
  const projectLabel = await resolveExportProjectLabel(req.query.project);
  const filtersSummary = [];

  filtersSummary.push(
    `نطاق الأرشفة: ${
      archivedQuery === 'true'
        ? 'البلانات المؤرشفة فقط'
        : archivedQuery === 'all'
          ? 'جميع البلانات'
          : 'البلانات النشطة فقط'
    }`,
  );

  if (planDate) {
    filtersSummary.push(`تاريخ البلان: ${planDate}`);
  } else if (dateFrom || dateTo) {
    filtersSummary.push(`الفترة الزمنية: من ${dateFrom || '-'} إلى ${dateTo || '-'}`);
  }

  if (search) filtersSummary.push(`كلمة البحث: ${search}`);
  if (req.query.status) filtersSummary.push(`الحالة: ${dailyWorkPlanStatusLabelMap[req.query.status] || req.query.status}`);
  if (req.query.priority) filtersSummary.push(`الأولوية: ${dailyWorkPlanPriorityLabelMap[req.query.priority] || req.query.priority}`);
  if (req.query.taskType) filtersSummary.push(`نوع المهمة: ${dailyWorkPlanTaskTypeLabelMap[req.query.taskType] || req.query.taskType}`);
  if (employeeLabel) filtersSummary.push(`الموظف: ${employeeLabel}`);
  if (supervisorLabel) filtersSummary.push(`المشرف: ${supervisorLabel}`);
  if (projectLabel) filtersSummary.push(`المشروع: ${projectLabel}`);

  return {
    generatedAt: new Date(),
    generatedBy: actorLabel(req),
    subtitle: 'نسخة تفصيلية مهيأة للعرض على الإدارة العليا والمتابعة الإدارية.',
    filtersSummary,
  };
};

export const exportDailyWorkPlansExcel = asyncHandler(async (req, res) => {
  const plans = await loadPlansForExport(req);
  const buffer = await buildDailyWorkPlansExcelBuffer(plans);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="daily-work-plans-${Date.now()}.xlsx"`);
  res.send(Buffer.from(buffer));
});

export const exportDailyWorkPlansPdf = asyncHandler(async (req, res) => {
  const plans = await loadPlansForExport(req);
  const exportContext = await buildDailyWorkPlansExportContext(req);
  const buffer = await buildDailyWorkPlansPdfBuffer(plans, exportContext);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="daily-work-plans-${Date.now()}.pdf"`);
  res.send(buffer);
});

export const listDailyWorkPlanMeta = asyncHandler(async (req, res) => {
  const managedUserIds = userCanViewAllDailyWorkPlanEmployees(req.user)
    ? undefined
    : await ensureManagedUsers(req);
  const users = await userRepository.listForManagement({
    includeManager: true,
    userIds: managedUserIds,
  });
  const projects = await projectRepository.list({}, { limit: 300 });

  res.json({
    users,
    projects,
    enums: {
      priorities: Object.entries(dailyWorkPlanPriorityLabelMap).map(([value, label]) => ({ value, label })),
      taskTypes: Object.entries(dailyWorkPlanTaskTypeLabelMap).map(([value, label]) => ({ value, label })),
      statuses: Object.entries(dailyWorkPlanStatusLabelMap).map(([value, label]) => ({ value, label })),
    },
  });
});
