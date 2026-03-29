import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { auditService } from '../../application/services/auditService.js';
import {
  MaintenanceDurationUnit,
  MaintenancePlanStatus,
  MaintenancePlanType,
  MaintenanceRecurrenceType,
  MaintenanceReminderBefore,
  MaintenanceScheduledVisitState,
  attachVisitToSchedule,
  calculateExpectedVisitsFromPeriod,
  calculateFreeMaintenanceEndDate,
  compareDateOnly,
  generateMaintenanceSchedule,
  normalizeDateOnly,
  rebuildMaintenanceSchedule,
  summarizeMaintenancePlan,
  summarizeMaintenancePlans,
} from '../../application/services/maintenancePlanService.js';
import { env } from '../../config/env.js';
import { MaintenancePlanRepository } from '../../infrastructure/db/repositories/MaintenancePlanRepository.js';
import { MaintenanceVisitRepository } from '../../infrastructure/db/repositories/MaintenanceVisitRepository.js';
import { buildMaintenanceVisitPdfBuffer } from '../../infrastructure/reports/maintenanceVisitPdfBuilder.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { WorkReportRepository } from '../../infrastructure/db/repositories/WorkReportRepository.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { Permission, Roles } from '../../shared/constants.js';
import { buildWhatsAppSendUrl } from '../../shared/attendanceUtils.js';
import { hasAnyPermission, hasPermission, resolvePermissions } from '../../shared/permissions.js';

const maintenancePlanRepository = new MaintenancePlanRepository();
const maintenanceVisitRepository = new MaintenanceVisitRepository();
const userRepository = new UserRepository();
const workReportRepository = new WorkReportRepository();
const uploadRootDir = path.resolve(process.cwd(), env.uploadsDir);
const storedMaintenanceVisitsDir = path.resolve(uploadRootDir, 'maintenance-visits');

const maintenanceTypeLabelMap = {
  [MaintenancePlanType.FREE]: 'مجانية',
  [MaintenancePlanType.PAID]: 'مدفوعة',
};

const maintenanceStatusLabelMap = {
  [MaintenancePlanStatus.ACTIVE]: 'نشطة',
  [MaintenancePlanStatus.PAUSED]: 'موقوفة',
  [MaintenancePlanStatus.ENDED]: 'منتهية',
  [MaintenancePlanStatus.EXPIRED]: 'منتهية',
};

const reminderBeforeLabelMap = {
  [MaintenanceReminderBefore.NONE]: 'بدون تنبيه',
  [MaintenanceReminderBefore.ONE_DAY]: 'قبل يوم',
  [MaintenanceReminderBefore.THREE_DAYS]: 'قبل 3 أيام',
  [MaintenanceReminderBefore.ONE_WEEK]: 'قبل أسبوع',
};

const recurrenceLabelMap = {
  [MaintenanceRecurrenceType.MONTHLY]: 'مرة كل شهر',
  [MaintenanceRecurrenceType.TWICE_MONTHLY]: 'مرتان كل شهر',
  [MaintenanceRecurrenceType.EVERY_2_MONTHS]: 'مرة كل شهرين',
  [MaintenanceRecurrenceType.EVERY_3_MONTHS]: 'مرة كل 3 أشهر',
  [MaintenanceRecurrenceType.EVERY_6_MONTHS]: 'مرة كل 6 أشهر',
  [MaintenanceRecurrenceType.YEARLY]: 'مرة كل سنة',
  [MaintenanceRecurrenceType.CUSTOM]: 'مخصص',
};

const scheduledVisitStateLabelMap = {
  [MaintenanceScheduledVisitState.COMPLETED]: 'منجزة',
  [MaintenanceScheduledVisitState.TODAY]: 'مستحقة اليوم',
  [MaintenanceScheduledVisitState.UPCOMING]: 'مستحقة قريبًا',
  [MaintenanceScheduledVisitState.OVERDUE]: 'متأخرة',
  [MaintenanceScheduledVisitState.FUTURE]: 'قادمة',
  [MaintenanceScheduledVisitState.PAUSED]: 'موقوفة',
  [MaintenanceScheduledVisitState.ENDED]: 'منتهية',
  [MaintenanceScheduledVisitState.EXPIRED]: 'منتهية',
};

const durationUnitLabelMap = {
  [MaintenanceDurationUnit.DAY]: 'يوم',
  [MaintenanceDurationUnit.MONTH]: 'شهر',
  [MaintenanceDurationUnit.YEAR]: 'سنة',
};

const visitStatusLabelMap = {
  SUCCESS: 'مكتملة بنجاح',
  FOLLOW_UP_REQUIRED: 'تحتاج متابعة',
  PAID_REPAIR_REQUIRED: 'تحتاج صيانة مدفوعة',
  PARTIAL: 'مكتملة جزئيًا',
};

const allowedDurationUnits = new Set(Object.values(MaintenanceDurationUnit));
const allowedPlanStatuses = new Set(Object.values(MaintenancePlanStatus));
const allowedPlanTypes = new Set(Object.values(MaintenancePlanType));
const allowedRecurrenceTypes = new Set(Object.values(MaintenanceRecurrenceType));
const allowedReminderBefore = new Set(Object.values(MaintenanceReminderBefore));
const technicianEvaluationLabelMap = {
  GOOD: 'جيد',
  ACCEPTABLE: 'مقبول',
  EXCELLENT: 'ممتاز',
};
const allowedTechnicianEvaluationGrades = new Set(Object.keys(technicianEvaluationLabelMap));

const toCleanString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

const toPositiveInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const raw = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

const toOptionalDate = (value) => {
  const normalized = normalizeDateOnly(value);
  return normalized || null;
};

const parseImageComments = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => toCleanString(item));
  }

  const raw = toCleanString(value);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => toCleanString(item));
    }
  } catch {
    return raw.split(',').map((item) => toCleanString(item));
  }

  return [];
};

const buildUploadedImages = (files = [], comments = []) =>
  files.map((file, index) => ({
    publicUrl: `/uploads/${file.filename}`,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: Number(file.size || 0),
    comment: toCleanString(comments[index]),
  }));

const formatDate = (value) => {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' });
};

const buildDurationLabel = (plan) => {
  if (String(plan.maintenanceType || '').toUpperCase() === MaintenancePlanType.FREE) {
    const value = toPositiveInteger(plan.freeDurationValue, 0);
    const unit = String(plan.freeDurationUnit || '').toUpperCase();
    if (value && unit) {
      return `${value} ${durationUnitLabelMap[unit] || unit}`;
    }
  }

  if (plan.startDate && plan.endDate) {
    return `${formatDate(plan.startDate)} - ${formatDate(plan.endDate)}`;
  }

  return '-';
};

const buildRecurrenceLabel = (plan) => {
  const recurrenceType = String(plan.recurrenceType || '').toUpperCase();
  if (recurrenceType !== MaintenanceRecurrenceType.CUSTOM) {
    return recurrenceLabelMap[recurrenceType] || recurrenceType;
  }

  const customValue = toPositiveInteger(plan.customRecurrenceIntervalValue, 0);
  const customUnit = String(plan.customRecurrenceIntervalUnit || '').toUpperCase();
  const customVisitCount = toPositiveInteger(plan.customVisitCount, 0);

  return [
    'مخصص',
    customVisitCount ? `${customVisitCount} زيارة` : '',
    customValue && customUnit ? `كل ${customValue} ${durationUnitLabelMap[customUnit] || customUnit}` : '',
  ].filter(Boolean).join(' - ');
};

const canCreateMaintenancePlans = (user = {}) =>
  hasPermission(user, Permission.CREATE_MAINTENANCE_PLANS);

const canManageMaintenancePlans = (user = {}) =>
  hasPermission(user, Permission.MANAGE_MAINTENANCE_PLANS);

const canViewMaintenancePlans = (user = {}) =>
  hasAnyPermission(user, [
    Permission.VIEW_MAINTENANCE_PLANS,
    Permission.CREATE_MAINTENANCE_PLANS,
    Permission.MANAGE_MAINTENANCE_PLANS,
    Permission.REGISTER_MAINTENANCE_VISITS,
  ]);

const canRegisterMaintenanceVisits = (user = {}) =>
  hasPermission(user, Permission.REGISTER_MAINTENANCE_VISITS);

const canOverrideMaintenancePlanDuplicates = (user = {}) =>
  hasPermission(user, Permission.OVERRIDE_MAINTENANCE_PLAN_DUPLICATES);

const canSeeAllMaintenancePlans = (user = {}) =>
  user.role === Roles.GENERAL_MANAGER
  || canCreateMaintenancePlans(user)
  || canManageMaintenancePlans(user)
  || [Roles.PROJECT_MANAGER, Roles.ASSISTANT_PROJECT_MANAGER].includes(user.role);

const isPlanAssignedToUser = (plan, userId) =>
  String(plan?.assignedEmployee?._id || plan?.assignedEmployee || '') === String(userId || '');

const canAccessPlan = (user, plan) => {
  if (!plan || !canViewMaintenancePlans(user)) {
    return false;
  }

  if (canSeeAllMaintenancePlans(user)) {
    return true;
  }

  return isPlanAssignedToUser(plan, user.id)
    || String(plan?.createdBy?._id || plan?.createdBy || '') === String(user.id || '');
};

const canEditPlan = (user, plan) =>
  canManageMaintenancePlans(user) && canAccessPlan(user, plan);

const canRegisterVisitForPlan = (user, plan) => {
  if (!canRegisterMaintenanceVisits(user)) {
    return false;
  }

  return canSeeAllMaintenancePlans(user) || isPlanAssignedToUser(plan, user.id);
};

const serializeEmployee = (employee) => {
  if (!employee) {
    return null;
  }

  return {
    id: String(employee._id || employee.id),
    fullName: employee.fullName || '',
    role: employee.role || '',
    employeeCode: employee.employeeCode || '',
    department: employee.department || '',
    jobTitle: employee.jobTitle || '',
    phone: employee.phone || '',
  };
};

const serializeScheduledVisit = (scheduledVisit) => ({
  id: scheduledVisit.id,
  sequence: scheduledVisit.sequence,
  scheduledDate: scheduledVisit.scheduledDate || null,
  completedAt: scheduledVisit.completedAt || null,
  visitReportId: scheduledVisit.visitReport?._id
    ? String(scheduledVisit.visitReport._id)
    : String(scheduledVisit.visitReport || '').trim() || null,
  isAdHoc: !!scheduledVisit.isAdHoc,
  state: scheduledVisit.state,
  stateLabel: scheduledVisitStateLabelMap[scheduledVisit.state] || scheduledVisit.state,
});

const buildPlanPayloadFromSummary = (plan, summary) => ({
  status: summary.status,
  expectedVisits: summary.expectedVisits,
  completedVisits: summary.completedVisits,
  remainingVisits: summary.remainingVisits,
  nextVisitDate: summary.nextVisitDate,
  lastVisitDate: summary.lastVisitDate,
});

const syncPlanComputedFields = async (plan) => {
  const summary = summarizeMaintenancePlan(plan);
  const computedPayload = buildPlanPayloadFromSummary(plan, summary);
  const shouldUpdate = String(plan.status || '') !== String(computedPayload.status || '')
    || Number(plan.expectedVisits || 0) !== Number(computedPayload.expectedVisits || 0)
    || Number(plan.completedVisits || 0) !== Number(computedPayload.completedVisits || 0)
    || Number(plan.remainingVisits || 0) !== Number(computedPayload.remainingVisits || 0)
    || compareDateOnly(plan.nextVisitDate, computedPayload.nextVisitDate) !== 0
    || compareDateOnly(plan.lastVisitDate, computedPayload.lastVisitDate) !== 0;

  if (!shouldUpdate) {
    return plan;
  }

  return maintenancePlanRepository.updateById(plan._id, computedPayload);
};

const serializePlan = (plan, user) => {
  const summary = summarizeMaintenancePlan(plan);
  const dueCategory = summary.status === MaintenancePlanStatus.PAUSED
    ? MaintenancePlanStatus.PAUSED
    : summary.status === MaintenancePlanStatus.ENDED || summary.status === MaintenancePlanStatus.EXPIRED
      ? MaintenancePlanStatus.ENDED
      : summary.nextVisitState || 'NONE';

  return {
    id: String(plan._id || plan.id),
    customerId: plan.customerId || '',
    customerName: plan.customerName || '',
    projectId: plan.project?._id ? String(plan.project._id) : String(plan.project || '').trim() || null,
    projectNumber: plan.projectNumber || plan.project?.code || '',
    projectName: plan.projectName || plan.project?.name || '',
    location: plan.location || '',
    phone: plan.phone || '',
    executorName: plan.executorName || '',
    completedWorkDate: plan.completedWorkDate || null,
    maintenanceType: plan.maintenanceType,
    maintenanceTypeLabel: maintenanceTypeLabelMap[plan.maintenanceType] || plan.maintenanceType,
    freeDurationValue: plan.freeDurationValue || 0,
    freeDurationUnit: plan.freeDurationUnit || '',
    freeDurationPreset: plan.freeDurationPreset || '',
    startDate: plan.startDate || null,
    endDate: plan.endDate || null,
    recurrenceType: plan.recurrenceType,
    recurrenceLabel: buildRecurrenceLabel(plan),
    customRecurrenceIntervalValue: plan.customRecurrenceIntervalValue || 0,
    customRecurrenceIntervalUnit: plan.customRecurrenceIntervalUnit || '',
    customVisitCount: plan.customVisitCount || 0,
    durationLabel: buildDurationLabel(plan),
    expectedVisits: summary.expectedVisits,
    completedVisits: summary.completedVisits,
    remainingVisits: summary.remainingVisits,
    nextVisitDate: summary.nextVisitDate,
    nextVisitState: summary.nextVisitState,
    nextVisitStateLabel: summary.nextVisitState ? scheduledVisitStateLabelMap[summary.nextVisitState] || summary.nextVisitState : '',
    lastVisitDate: summary.lastVisitDate,
    status: summary.status,
    statusLabel: maintenanceStatusLabelMap[summary.status] || summary.status,
    assignedEmployee: serializeEmployee(plan.assignedEmployee),
    notes: plan.notes || '',
    reminderBefore: plan.reminderBefore || MaintenanceReminderBefore.NONE,
    reminderBeforeLabel: reminderBeforeLabelMap[plan.reminderBefore] || plan.reminderBefore,
    dueTodayCount: summary.dueTodayCount,
    overdueCount: summary.overdueCount,
    upcomingCount: summary.upcomingCount,
    dueCategory,
    dueCategoryLabel: scheduledVisitStateLabelMap[dueCategory] || maintenanceStatusLabelMap[dueCategory] || dueCategory,
    workReportId: plan.workReport?._id ? String(plan.workReport._id) : String(plan.workReport || '').trim(),
    createdBy: serializeEmployee(plan.createdBy),
    updatedBy: serializeEmployee(plan.updatedBy),
    createdAt: plan.createdAt || null,
    updatedAt: plan.updatedAt || null,
    scheduledVisits: summary.scheduledVisits.map(serializeScheduledVisit),
    canEditPlan: canEditPlan(user, plan),
    canRegisterVisit: canRegisterVisitForPlan(user, plan),
    canStopPlan: canEditPlan(user, plan) && summary.status === MaintenancePlanStatus.ACTIVE,
    canEndPlan: canEditPlan(user, plan) && ![MaintenancePlanStatus.ENDED, MaintenancePlanStatus.EXPIRED].includes(summary.status),
    canCreateDuplicatePlan: canOverrideMaintenancePlanDuplicates(user),
  };
};

const serializeVisit = (visit, user) => ({
  id: String(visit._id || visit.id),
  maintenancePlanId: visit.maintenancePlan?._id
    ? String(visit.maintenancePlan._id)
    : String(visit.maintenancePlan || '').trim(),
  visitDate: visit.visitDate || null,
  technician: serializeEmployee(visit.technician),
  technicianName: visit.technicianName || visit.technician?.fullName || '',
  visitType: visit.visitType || '',
  status: visit.status || '',
  statusLabel: visitStatusLabelMap[visit.status] || visit.status,
  workDone: visit.workDone || '',
  deviceStatus: visit.deviceStatus || '',
  notes: visit.notes || '',
  recommendations: visit.recommendations || '',
  images: (visit.images || []).map((image, index) => ({
    id: `${String(visit._id || visit.id)}-image-${index + 1}`,
    url: image.publicUrl,
    originalName: image.originalName || '',
    comment: image.comment || '',
  })),
  followUpRequired: !!visit.followUpRequired,
  paidRepairRequired: !!visit.paidRepairRequired,
  completionRate: Number(visit.completionRate || 0),
  visitCompletedSuccessfully: !!visit.visitCompletedSuccessfully,
  signedBy: visit.signedBy || '',
  approvalText: visit.approvalText || '',
  customerSignature: visit.customerSignature || visit.signedBy || '',
  technicianSignature: visit.technicianSignature || visit.technicianName || '',
  projectManagerSignature: visit.projectManagerSignature || '',
  technicianEvaluationGrade: visit.technicianEvaluationGrade || '',
  technicianEvaluationGradeLabel: technicianEvaluationLabelMap[visit.technicianEvaluationGrade] || '',
  technicianEvaluationPercent: Number(visit.technicianEvaluationPercent || 0),
  createdAt: visit.createdAt || null,
  createdBy: serializeEmployee(visit.createdBy),
  canViewPlan: canAccessPlan(user, visit.maintenancePlan),
  maintenancePlan: visit.maintenancePlan ? {
    id: String(visit.maintenancePlan._id || visit.maintenancePlan.id),
    customerName: visit.maintenancePlan.customerName || '',
    projectName: visit.maintenancePlan.projectName || '',
    projectNumber: visit.maintenancePlan.projectNumber || '',
    location: visit.maintenancePlan.location || '',
    phone: visit.maintenancePlan.phone || '',
    executorName: visit.maintenancePlan.executorName || '',
    maintenanceType: visit.maintenancePlan.maintenanceType || '',
    status: visit.maintenancePlan.status || '',
  } : null,
});

const validateAssignedEmployee = async (assignedEmployeeId) => {
  const employeeId = toCleanString(assignedEmployeeId);
  if (!employeeId) {
    return null;
  }

  const employee = await userRepository.findById(employeeId);
  if (!employee || !employee.active) {
    throw new AppError('الموظف/الفني المحدد غير موجود أو غير نشط', 400);
  }

  const permissions = resolvePermissions(employee);
  if (!permissions.includes(Permission.REGISTER_MAINTENANCE_VISITS)) {
    throw new AppError('الموظف المحدد لا يملك صلاحية تسجيل زيارات الصيانة', 400);
  }

  return employee;
};

const resolveExpectedVisits = ({
  startDate,
  endDate,
  recurrenceType,
  customRecurrenceIntervalValue,
  customRecurrenceIntervalUnit,
  customVisitCount,
  expectedVisitsInput,
}) => {
  if (expectedVisitsInput > 0) {
    return expectedVisitsInput;
  }

  if (recurrenceType === MaintenanceRecurrenceType.CUSTOM && customVisitCount > 0) {
    return customVisitCount;
  }

  if (startDate && endDate) {
    return calculateExpectedVisitsFromPeriod({
      startDate,
      endDate,
      recurrenceType,
      customRecurrenceIntervalValue,
      customRecurrenceIntervalUnit,
    });
  }

  return 0;
};

const buildPlanUpsertPayload = async ({
  body,
  actor,
  workReport,
  existingPlan = null,
}) => {
  const maintenanceType = toCleanString(body.maintenanceType || existingPlan?.maintenanceType).toUpperCase();
  if (!allowedPlanTypes.has(maintenanceType)) {
    throw new AppError('نوع الصيانة غير صالح', 400);
  }

  const recurrenceType = toCleanString(body.recurrenceType || existingPlan?.recurrenceType).toUpperCase();
  if (!allowedRecurrenceTypes.has(recurrenceType)) {
    throw new AppError('تكرار الصيانة غير صالح', 400);
  }

  const startDate = toOptionalDate(body.startDate || existingPlan?.startDate || workReport?.approvedAt || workReport?.workDate || new Date());
  if (!startDate) {
    throw new AppError('تاريخ بداية الصيانة غير صالح', 400);
  }

  const reminderBefore = toCleanString(body.reminderBefore || existingPlan?.reminderBefore || MaintenanceReminderBefore.NONE).toUpperCase();
  if (!allowedReminderBefore.has(reminderBefore)) {
    throw new AppError('قيمة التنبيه غير صالحة', 400);
  }

  const freeDurationValue = maintenanceType === MaintenancePlanType.FREE
    ? Math.max(1, toPositiveInteger(body.freeDurationValue || existingPlan?.freeDurationValue, 0))
    : 0;
  const freeDurationUnit = maintenanceType === MaintenancePlanType.FREE
    ? toCleanString(body.freeDurationUnit || existingPlan?.freeDurationUnit).toUpperCase()
    : '';
  if (maintenanceType === MaintenancePlanType.FREE && !allowedDurationUnits.has(freeDurationUnit)) {
    throw new AppError('يجب تحديد مدة الصيانة المجانية بشكل صحيح', 400);
  }

  const customRecurrenceIntervalValue = recurrenceType === MaintenanceRecurrenceType.CUSTOM
    ? Math.max(1, toPositiveInteger(body.customRecurrenceIntervalValue || existingPlan?.customRecurrenceIntervalValue, 0))
    : 0;
  const customRecurrenceIntervalUnit = recurrenceType === MaintenanceRecurrenceType.CUSTOM
    ? toCleanString(body.customRecurrenceIntervalUnit || existingPlan?.customRecurrenceIntervalUnit).toUpperCase()
    : '';
  const customVisitCount = recurrenceType === MaintenanceRecurrenceType.CUSTOM
    ? Math.max(1, toPositiveInteger(body.customVisitCount || existingPlan?.customVisitCount || body.expectedVisits, 0))
    : 0;

  if (recurrenceType === MaintenanceRecurrenceType.CUSTOM && !allowedDurationUnits.has(customRecurrenceIntervalUnit)) {
    throw new AppError('الفاصل الزمني المخصص غير صالح', 400);
  }

  const expectedVisitsInput = toPositiveInteger(body.expectedVisits, 0);
  let endDate = maintenanceType === MaintenancePlanType.FREE
    ? calculateFreeMaintenanceEndDate({
        startDate,
        freeDurationValue,
        freeDurationUnit,
      })
    : toOptionalDate(body.endDate || existingPlan?.endDate);

  let expectedVisits = resolveExpectedVisits({
    startDate,
    endDate,
    recurrenceType,
    customRecurrenceIntervalValue,
    customRecurrenceIntervalUnit,
    customVisitCount,
    expectedVisitsInput,
  });

  if (maintenanceType === MaintenancePlanType.PAID && !endDate && expectedVisits === 0) {
    throw new AppError('في الصيانة المدفوعة يجب تحديد تاريخ الانتهاء أو عدد الزيارات المتوقع', 400);
  }

  if (endDate && compareDateOnly(endDate, startDate) < 0) {
    throw new AppError('تاريخ نهاية الصيانة يجب أن يكون بعد تاريخ البداية', 400);
  }

  if (endDate && expectedVisits > 0) {
    const maxVisits = calculateExpectedVisitsFromPeriod({
      startDate,
      endDate,
      recurrenceType,
      customRecurrenceIntervalValue,
      customRecurrenceIntervalUnit,
    });

    if (maxVisits === 0) {
      throw new AppError('المدة المحددة لا تسمح بجدولة أي زيارة صيانة', 400);
    }

    if (expectedVisits > maxVisits) {
      throw new AppError(`عدد الزيارات المتوقع يتجاوز الحد الممكن ضمن المدة (${maxVisits})`, 400);
    }
  }

  if (!endDate && expectedVisits > 0) {
    const previewSchedule = generateMaintenanceSchedule({
      startDate,
      recurrenceType,
      customRecurrenceIntervalValue,
      customRecurrenceIntervalUnit,
      expectedVisits,
    });
    endDate = previewSchedule.at(-1)?.scheduledDate || startDate;
  }

  if (!endDate) {
    throw new AppError('تعذر احتساب تاريخ نهاية الصيانة', 400);
  }

  if (expectedVisits <= 0) {
    expectedVisits = resolveExpectedVisits({
      startDate,
      endDate,
      recurrenceType,
      customRecurrenceIntervalValue,
      customRecurrenceIntervalUnit,
      customVisitCount,
      expectedVisitsInput: 0,
    });
  }

  if (expectedVisits <= 0) {
    throw new AppError('عدد الزيارات المتوقع غير صالح', 400);
  }

  const assignedEmployee = await validateAssignedEmployee(
    body.assignedEmployeeId || body.assignedEmployee || existingPlan?.assignedEmployee?._id || existingPlan?.assignedEmployee,
  );
  if (!assignedEmployee) {
    throw new AppError('يجب تعيين موظف أو فني مسؤول للخطة', 400);
  }

  const status = toCleanString(body.status || existingPlan?.status || MaintenancePlanStatus.ACTIVE).toUpperCase();
  if (!allowedPlanStatuses.has(status)) {
    throw new AppError('حالة الخطة غير صالحة', 400);
  }

  const customerName = toCleanString(body.customerName || existingPlan?.customerName || workReport?.project?.name || workReport?.projectName);
  if (!customerName) {
    throw new AppError('اسم الزبون مطلوب', 400);
  }

  const projectName = toCleanString(body.projectName || existingPlan?.projectName || workReport?.project?.name || workReport?.projectName);
  const projectNumber = toCleanString(body.projectNumber || existingPlan?.projectNumber || workReport?.project?.code);
  const schedule = existingPlan
    ? rebuildMaintenanceSchedule({
        existingScheduledVisits: existingPlan.scheduledVisits || [],
        startDate,
        endDate,
        recurrenceType,
        customRecurrenceIntervalValue,
        customRecurrenceIntervalUnit,
        expectedVisits,
      })
    : generateMaintenanceSchedule({
        startDate,
        endDate,
        recurrenceType,
        customRecurrenceIntervalValue,
        customRecurrenceIntervalUnit,
        expectedVisits,
      });

  const summary = summarizeMaintenancePlan({
    status,
    endDate,
    reminderBefore,
    scheduledVisits: schedule,
  });

  if (!summary.expectedVisits) {
    throw new AppError('تعذر إنشاء جدول زيارات الصيانة', 400);
  }

  return {
    customerId: toCleanString(body.customerId || existingPlan?.customerId),
    project: workReport?.project?._id || workReport?.project || existingPlan?.project?._id || existingPlan?.project || null,
    workReport: workReport?._id || workReport?.id || existingPlan?.workReport?._id || existingPlan?.workReport || null,
    customerName,
    projectNumber,
    projectName,
    location: toCleanString(body.location || body.siteLocation || existingPlan?.location),
    phone: toCleanString(body.phone || existingPlan?.phone),
    executorName: toCleanString(body.executorName || body.employeeName || existingPlan?.executorName || workReport?.employeeName),
    completedWorkDate: normalizeDateOnly(body.completedWorkDate || workReport?.approvedAt || workReport?.workDate || existingPlan?.completedWorkDate),
    maintenanceType,
    freeDurationPreset: toCleanString(body.freeDurationPreset || existingPlan?.freeDurationPreset),
    freeDurationValue,
    freeDurationUnit,
    startDate,
    endDate,
    recurrenceType,
    customRecurrenceIntervalValue,
    customRecurrenceIntervalUnit,
    customVisitCount,
    expectedVisits: summary.expectedVisits,
    completedVisits: summary.completedVisits,
    remainingVisits: summary.remainingVisits,
    nextVisitDate: summary.nextVisitDate,
    lastVisitDate: summary.lastVisitDate,
    status: summary.status,
    assignedEmployee: assignedEmployee?._id || null,
    notes: toCleanString(body.notes || existingPlan?.notes),
    reminderBefore,
    scheduledVisits: summary.scheduledVisits.map((item, index) => ({
      ...item,
      id: item.id || randomUUID(),
      sequence: index + 1,
    })),
    createdBy: existingPlan?.createdBy?._id || existingPlan?.createdBy || actor.id,
    updatedBy: actor.id,
  };
};

const filterPlansInMemory = (plans, query = {}) => {
  const search = toCleanString(query.search).toLowerCase();
  const customerName = toCleanString(query.customerName).toLowerCase();
  const projectNumber = toCleanString(query.projectNumber).toLowerCase();
  const location = toCleanString(query.location).toLowerCase();
  const maintenanceType = toCleanString(query.maintenanceType).toUpperCase();
  const status = toCleanString(query.status).toUpperCase();
  const assignedEmployeeId = toCleanString(query.assignedEmployeeId);
  const dueFilter = toCleanString(query.dueFilter).toUpperCase();
  const dateFrom = toOptionalDate(query.dateFrom);
  const dateTo = toOptionalDate(query.dateTo);

  return plans.filter((plan) => {
    if (search) {
      const haystack = [
        plan.customerName,
        plan.projectName,
        plan.projectNumber,
        plan.location,
        plan.phone,
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }

    if (customerName && !String(plan.customerName || '').toLowerCase().includes(customerName)) return false;
    if (projectNumber && !String(plan.projectNumber || '').toLowerCase().includes(projectNumber)) return false;
    if (location && !String(plan.location || '').toLowerCase().includes(location)) return false;
    if (maintenanceType && String(plan.maintenanceType || '').toUpperCase() !== maintenanceType) return false;
    if (status && String(plan.status || '').toUpperCase() !== status) return false;
    if (assignedEmployeeId && String(plan.assignedEmployee?.id || plan.assignedEmployee?._id || plan.assignedEmployee || '') !== assignedEmployeeId) return false;
    if (dueFilter && String(plan.dueCategory || '').toUpperCase() !== dueFilter) return false;
    if (dateFrom && plan.startDate && compareDateOnly(plan.startDate, dateFrom) < 0) return false;
    if (dateTo && plan.endDate && compareDateOnly(plan.endDate, dateTo) > 0) return false;

    return true;
  });
};

const resolvePlanFilter = (req) => {
  const filter = {};
  if (req.query.workReportId) {
    filter.workReport = req.query.workReportId;
  }
  if (req.query.projectId) {
    filter.project = req.query.projectId;
  }
  if (!canSeeAllMaintenancePlans(req.user)) {
    filter.$or = [
      { assignedEmployee: req.user.id },
      { createdBy: req.user.id },
    ];
  }
  return filter;
};

const ensurePlanAccessible = async (req, planId) => {
  const plan = await maintenancePlanRepository.findById(planId);
  if (!plan) {
    throw new AppError('خطة الصيانة غير موجودة', 404);
  }
  if (!canAccessPlan(req.user, plan)) {
    throw new AppError('ليس لديك صلاحية الوصول إلى خطة الصيانة هذه', 403);
  }
  return syncPlanComputedFields(plan);
};

const ensurePlanEditable = async (req, planId) => {
  const plan = await ensurePlanAccessible(req, planId);
  if (!canEditPlan(req.user, plan)) {
    throw new AppError('ليس لديك صلاحية تعديل خطة الصيانة هذه', 403);
  }
  return plan;
};

const ensureVisitRegistrationAllowed = async (req, planId) => {
  const plan = await ensurePlanAccessible(req, planId);
  if (!canRegisterVisitForPlan(req.user, plan)) {
    throw new AppError('ليس لديك صلاحية تسجيل زيارة لهذه الخطة', 403);
  }
  if (String(plan.status || '').toUpperCase() !== MaintenancePlanStatus.ACTIVE) {
    throw new AppError('لا يمكن تسجيل زيارة إلا ضمن خطة نشطة', 400);
  }
  return plan;
};

const resolvePublicBaseUrl = (req) => `${req.protocol}://${req.get('host')}`;

const ensureVisitAccessible = async (req, visitId) => {
  const visit = await maintenanceVisitRepository.findById(visitId);
  if (!visit) {
    throw new AppError('زيارة الصيانة غير موجودة', 404);
  }

  if (!canAccessPlan(req.user, visit.maintenancePlan)) {
    throw new AppError('ليست لديك صلاحية الوصول إلى هذه الزيارة', 403);
  }

  return visit;
};

const ensureStoredMaintenanceVisitPdf = async ({ visit, req }) => {
  const filename = `maintenance-visit-${String(visit._id || visit.id)}.pdf`;
  const absolutePath = path.resolve(storedMaintenanceVisitsDir, filename);
  const buffer = await buildMaintenanceVisitPdfBuffer({
    visit: serializeVisit(visit, req.user),
    generatedAt: new Date(),
    uploadRootDir,
    publicBaseUrl: resolvePublicBaseUrl(req),
  });

  if (!fs.existsSync(storedMaintenanceVisitsDir)) {
    fs.mkdirSync(storedMaintenanceVisitsDir, { recursive: true });
  }

  fs.writeFileSync(absolutePath, buffer);

  return {
    filename,
    absolutePath,
    publicUrl: `/uploads/maintenance-visits/${filename}`,
  };
};

const buildMaintenanceVisitWhatsappMessage = ({ visit, pdfAbsoluteUrl }) => {
  const lines = [
    'تقرير زيارة صيانة دورية - Delta Plus',
    `الزبون: ${visit.maintenancePlan?.customerName || '-'}`,
    `المشروع: ${visit.maintenancePlan?.projectName || '-'}`,
    `رقم المشروع: ${visit.maintenancePlan?.projectNumber || '-'}`,
    `الموقع: ${visit.maintenancePlan?.location || '-'}`,
    `الفني: ${visit.technicianName || visit.technician?.fullName || '-'}`,
    `تاريخ الزيارة: ${formatDate(visit.visitDate)}`,
    `حالة الزيارة: ${visitStatusLabelMap[visit.status] || visit.status || '-'}`,
    `نسبة الإنجاز: ${Number(visit.completionRate || 0)}%`,
  ];

  if (pdfAbsoluteUrl) {
    lines.push(`رابط تقرير PDF: ${pdfAbsoluteUrl}`);
  }

  return lines.join('\n');
};

export const listMaintenancePlanTechnicians = asyncHandler(async (req, res) => {
  if (!canCreateMaintenancePlans(req.user) && !canManageMaintenancePlans(req.user)) {
    throw new AppError('ليس لديك صلاحية الوصول إلى قائمة الفنيين', 403);
  }

  const employees = await userRepository.listActive({ includeManager: false });
  const technicians = employees.filter((employee) =>
    resolvePermissions(employee).includes(Permission.REGISTER_MAINTENANCE_VISITS));

  res.json({
    technicians: technicians.map(serializeEmployee),
  });
});

export const listMaintenancePlans = asyncHandler(async (req, res) => {
  if (!canViewMaintenancePlans(req.user)) {
    throw new AppError('ليس لديك صلاحية عرض خطط الصيانة الدورية', 403);
  }

  const plans = await maintenancePlanRepository.list(resolvePlanFilter(req));
  const syncedPlans = await Promise.all(plans.map((plan) => syncPlanComputedFields(plan)));
  const serializedPlans = syncedPlans.map((plan) => serializePlan(plan, req.user));
  const filteredPlans = filterPlansInMemory(serializedPlans, req.query);
  const summary = summarizeMaintenancePlans(filteredPlans);

  res.json({
    plans: filteredPlans,
    summary,
  });
});

export const listMaintenanceVisits = asyncHandler(async (req, res) => {
  if (!canViewMaintenancePlans(req.user)) {
    throw new AppError('ليس لديك صلاحية عرض زيارات الصيانة', 403);
  }

  const plans = await maintenancePlanRepository.list(resolvePlanFilter(req));
  const accessiblePlanIds = plans.map((plan) => String(plan._id));

  if (!accessiblePlanIds.length) {
    return res.json({ visits: [] });
  }

  const visits = await maintenanceVisitRepository.list({
    maintenancePlan: { $in: accessiblePlanIds },
  });

  res.json({
    visits: visits.map((visit) => serializeVisit(visit, req.user)),
  });
});

export const getMaintenancePlan = asyncHandler(async (req, res) => {
  const plan = await ensurePlanAccessible(req, req.params.id);
  const visits = await maintenanceVisitRepository.list({
    maintenancePlan: plan._id,
  });

  res.json({
    plan: serializePlan(plan, req.user),
    visits: visits.map((visit) => serializeVisit(visit, req.user)),
  });
});

export const createMaintenancePlan = asyncHandler(async (req, res) => {
  if (!canCreateMaintenancePlans(req.user)) {
    throw new AppError('ليس لديك صلاحية تفعيل الصيانة الدورية', 403);
  }

  const workReportId = toCleanString(req.body.workReportId);
  const report = workReportId ? await workReportRepository.findById(workReportId) : null;
  if (workReportId && !report) {
    throw new AppError('تقرير العمل غير موجود', 404);
  }
  if (report && String(report.status || '').toUpperCase() !== 'APPROVED') {
    throw new AppError('لا يمكن تفعيل الصيانة الدورية إلا بعد اعتماد تقرير العمل', 400);
  }
  if (report && Number(report.progressPercent || 0) !== 100) {
    throw new AppError('لا يمكن تفعيل الصيانة الدورية إلا عندما تكون نسبة الإنجاز 100%', 400);
  }

  const existingPlan = report
    ? await maintenancePlanRepository.findOne(
        { workReport: report._id },
        { sort: { createdAt: -1 } },
      )
    : null;
  const forceDuplicate = toBoolean(req.body.forceDuplicate);
  if (existingPlan && !(forceDuplicate && canOverrideMaintenancePlanDuplicates(req.user))) {
    throw new AppError('تم تفعيل خطة صيانة دورية مسبقًا لهذا التقرير', 409);
  }

  const payload = await buildPlanUpsertPayload({
    body: req.body,
    actor: req.user,
    workReport: report,
  });

  const created = await maintenancePlanRepository.create(payload);
  const storedPlan = await maintenancePlanRepository.findById(created._id);

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_PLAN_CREATED',
    entityType: 'MAINTENANCE_PLAN',
    entityId: storedPlan._id,
    after: {
      workReportId: report ? String(report._id) : null,
      source: report ? 'WORK_REPORT' : 'DIRECT',
      maintenanceType: storedPlan.maintenanceType,
      startDate: storedPlan.startDate,
      endDate: storedPlan.endDate,
      expectedVisits: storedPlan.expectedVisits,
      assignedEmployee: storedPlan.assignedEmployee?._id || storedPlan.assignedEmployee || null,
    },
    req,
  });

  res.status(201).json({
    plan: serializePlan(storedPlan, req.user),
  });
});

export const updateMaintenancePlan = asyncHandler(async (req, res) => {
  const currentPlan = await ensurePlanEditable(req, req.params.id);
  const currentWorkReportId = toCleanString(currentPlan.workReport?._id || currentPlan.workReport);
  const report = currentWorkReportId ? await workReportRepository.findById(currentWorkReportId) : null;
  if (currentWorkReportId && !report) {
    throw new AppError('تقرير العمل المرتبط بالخطة غير موجود', 404);
  }

  const before = serializePlan(currentPlan, req.user);
  const payload = await buildPlanUpsertPayload({
    body: req.body,
    actor: req.user,
    workReport: report,
    existingPlan: currentPlan,
  });

  if (Number(currentPlan.completedVisits || 0) > Number(payload.expectedVisits || 0)) {
    throw new AppError('لا يمكن تقليل عدد الزيارات عن عدد الزيارات المنجزة فعليًا', 400);
  }

  const updated = await maintenancePlanRepository.updateById(currentPlan._id, payload);

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_PLAN_UPDATED',
    entityType: 'MAINTENANCE_PLAN',
    entityId: updated._id,
    before: {
      status: before.status,
      expectedVisits: before.expectedVisits,
      assignedEmployee: before.assignedEmployee?.id || null,
    },
    after: {
      status: updated.status,
      expectedVisits: updated.expectedVisits,
      assignedEmployee: updated.assignedEmployee?._id || updated.assignedEmployee || null,
    },
    req,
  });

  res.json({
    plan: serializePlan(updated, req.user),
  });
});

export const updateMaintenancePlanStatus = asyncHandler(async (req, res) => {
  const plan = await ensurePlanEditable(req, req.params.id);
  const nextStatus = toCleanString(req.body.status).toUpperCase();

  if (![MaintenancePlanStatus.ACTIVE, MaintenancePlanStatus.PAUSED, MaintenancePlanStatus.ENDED].includes(nextStatus)) {
    throw new AppError('حالة الخطة المطلوبة غير مدعومة', 400);
  }

  const updated = await maintenancePlanRepository.updateById(plan._id, {
    status: nextStatus,
    updatedBy: req.user.id,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_PLAN_STATUS_UPDATED',
    entityType: 'MAINTENANCE_PLAN',
    entityId: updated._id,
    before: { status: plan.status },
    after: { status: updated.status },
    req,
  });

  res.json({
    plan: serializePlan(updated, req.user),
  });
});

export const registerMaintenanceVisit = asyncHandler(async (req, res) => {
  const plan = await ensureVisitRegistrationAllowed(req, req.params.id);
  const visitDate = toOptionalDate(req.body.visitDate || new Date());
  if (!visitDate) {
    throw new AppError('تاريخ الزيارة غير صالح', 400);
  }

  const technician = await validateAssignedEmployee(
    req.body.technicianId || req.body.technician || plan.assignedEmployee?._id || plan.assignedEmployee,
  );
  if (!technician) {
    throw new AppError('يجب تحديد الفني المسؤول عن الزيارة', 400);
  }

  const successful = toBoolean(req.body.visitCompletedSuccessfully ?? true);
  const followUpRequired = toBoolean(req.body.followUpRequired);
  const paidRepairRequired = toBoolean(req.body.paidRepairRequired);
  const completionRate = Math.min(100, Math.max(0, Number(req.body.completionRate ?? 100) || 0));
  const technicianEvaluationGrade = toCleanString(req.body.technicianEvaluationGrade).toUpperCase();
  if (technicianEvaluationGrade && !allowedTechnicianEvaluationGrades.has(technicianEvaluationGrade)) {
    throw new AppError('قيمة تقييم الفني أو المهندس غير صالحة', 400);
  }
  const technicianEvaluationPercentRaw = toCleanString(req.body.technicianEvaluationPercent);
  const technicianEvaluationPercentInput = Number(technicianEvaluationPercentRaw);
  const technicianEvaluationPercent = technicianEvaluationPercentRaw && Number.isFinite(technicianEvaluationPercentInput)
    ? Math.min(100, Math.max(0, technicianEvaluationPercentInput))
    : (
      technicianEvaluationGrade === 'EXCELLENT'
        ? 100
        : technicianEvaluationGrade === 'GOOD'
          ? 80
          : technicianEvaluationGrade === 'ACCEPTABLE'
            ? 60
            : 0
    );
  const comments = parseImageComments(req.body.imageComments);
  const files = Array.isArray(req.files) ? req.files : [];
  const images = buildUploadedImages(files, comments);

  const visitStatus = paidRepairRequired
    ? 'PAID_REPAIR_REQUIRED'
    : followUpRequired
      ? 'FOLLOW_UP_REQUIRED'
      : (!successful || completionRate < 100 ? 'PARTIAL' : 'SUCCESS');

  const createdVisit = await maintenanceVisitRepository.create({
    maintenancePlan: plan._id,
    scheduledVisitId: toCleanString(req.body.scheduledVisitId),
    visitDate,
    technician: technician._id,
    technicianName: technician.fullName,
    visitType: toCleanString(req.body.visitType),
    status: visitStatus,
    workDone: toCleanString(req.body.workDone || req.body.performedActions),
    deviceStatus: toCleanString(req.body.deviceStatus),
    notes: toCleanString(req.body.notes),
    recommendations: toCleanString(req.body.recommendations),
    images,
    followUpRequired,
    paidRepairRequired,
    completionRate,
    visitCompletedSuccessfully: successful,
    signedBy: toCleanString(req.body.signedBy),
    approvalText: toCleanString(req.body.approvalText),
    customerSignature: toCleanString(req.body.customerSignature || req.body.signedBy),
    technicianSignature: toCleanString(req.body.technicianSignature || technician.fullName),
    projectManagerSignature: toCleanString(req.body.projectManagerSignature),
    technicianEvaluationGrade,
    technicianEvaluationPercent,
    createdBy: req.user.id,
  });

  const nextSchedule = attachVisitToSchedule({
    scheduledVisits: plan.scheduledVisits || [],
    visitDate,
    visitId: createdVisit._id,
    scheduledVisitId: req.body.scheduledVisitId,
  });

  const refreshedSummary = summarizeMaintenancePlan({
    ...plan.toObject(),
    scheduledVisits: nextSchedule,
    status: plan.status,
    reminderBefore: plan.reminderBefore,
    endDate: plan.endDate,
  });

  const updatedPlan = await maintenancePlanRepository.updateById(plan._id, {
    scheduledVisits: nextSchedule,
    expectedVisits: refreshedSummary.expectedVisits,
    completedVisits: refreshedSummary.completedVisits,
    remainingVisits: refreshedSummary.remainingVisits,
    nextVisitDate: refreshedSummary.nextVisitDate,
    lastVisitDate: refreshedSummary.lastVisitDate,
    status: refreshedSummary.status,
    updatedBy: req.user.id,
  });

  const storedVisit = await maintenanceVisitRepository.findById(createdVisit._id);

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_VISIT_REGISTERED',
    entityType: 'MAINTENANCE_VISIT',
    entityId: createdVisit._id,
    after: {
      maintenancePlanId: String(plan._id),
      visitDate,
      status: visitStatus,
      completionRate,
      followUpRequired,
      paidRepairRequired,
      technicianEvaluationGrade,
      technicianEvaluationPercent,
    },
    req,
  });

  res.status(201).json({
    plan: serializePlan(updatedPlan, req.user),
    visit: serializeVisit(storedVisit, req.user),
  });
});

export const exportMaintenanceVisitPdf = asyncHandler(async (req, res) => {
  const visit = await ensureVisitAccessible(req, req.params.visitId);
  const stored = await ensureStoredMaintenanceVisitPdf({
    visit,
    req,
  });

  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${stored.filename}"`);
  res.sendFile(stored.absolutePath);
});

export const maintenanceVisitWhatsappLink = asyncHandler(async (req, res) => {
  const visit = await ensureVisitAccessible(req, req.params.visitId);
  const stored = await ensureStoredMaintenanceVisitPdf({
    visit,
    req,
  });

  const pdfAbsoluteUrl = `${resolvePublicBaseUrl(req)}${stored.publicUrl}`;
  const recipient = toCleanString(visit.technician?.phone);
  const message = buildMaintenanceVisitWhatsappMessage({
    visit,
    pdfAbsoluteUrl,
  });
  const directUrl = buildWhatsAppSendUrl(recipient, message);

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_VISIT_WHATSAPP_LINK_CREATED',
    entityType: 'MAINTENANCE_VISIT',
    entityId: visit._id,
    after: {
      maintenancePlanId: String(visit.maintenancePlan?._id || visit.maintenancePlan || ''),
      recipient,
      pdfUrl: stored.publicUrl,
    },
    req,
  });

  res.json({
    pdfUrl: stored.publicUrl,
    whatsapp: {
      recipient,
      url: directUrl || `https://wa.me/?text=${encodeURIComponent(message)}`,
      mode: directUrl ? 'DIRECT' : 'MANUAL_SELECT',
    },
  });
});
