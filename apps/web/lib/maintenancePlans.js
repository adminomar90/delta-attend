'use client';

export const MaintenancePlanType = {
  FREE: 'FREE',
  PAID: 'PAID',
};

export const MaintenancePlanStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
  EXPIRED: 'EXPIRED',
};

export const MaintenanceRecurrenceType = {
  MONTHLY: 'MONTHLY',
  TWICE_MONTHLY: 'TWICE_MONTHLY',
  EVERY_2_MONTHS: 'EVERY_2_MONTHS',
  EVERY_3_MONTHS: 'EVERY_3_MONTHS',
  EVERY_6_MONTHS: 'EVERY_6_MONTHS',
  YEARLY: 'YEARLY',
  CUSTOM: 'CUSTOM',
};

export const MaintenanceReminderBefore = {
  NONE: 'NONE',
  ONE_DAY: 'ONE_DAY',
  THREE_DAYS: 'THREE_DAYS',
  ONE_WEEK: 'ONE_WEEK',
};

export const MaintenanceDurationUnit = {
  DAY: 'DAY',
  MONTH: 'MONTH',
  YEAR: 'YEAR',
};

export const maintenanceTypeOptions = [
  [MaintenancePlanType.FREE, 'مجانية'],
  [MaintenancePlanType.PAID, 'مدفوعة'],
];

export const planStatusOptions = [
  [MaintenancePlanStatus.ACTIVE, 'نشطة'],
  [MaintenancePlanStatus.PAUSED, 'موقوفة'],
  [MaintenancePlanStatus.ENDED, 'منتهية'],
];

export const recurrenceOptions = [
  [MaintenanceRecurrenceType.MONTHLY, 'مرة كل شهر'],
  [MaintenanceRecurrenceType.TWICE_MONTHLY, 'مرتان كل شهر'],
  [MaintenanceRecurrenceType.EVERY_2_MONTHS, 'مرة كل شهرين'],
  [MaintenanceRecurrenceType.EVERY_3_MONTHS, 'مرة كل 3 أشهر'],
  [MaintenanceRecurrenceType.EVERY_6_MONTHS, 'مرة كل 6 أشهر'],
  [MaintenanceRecurrenceType.YEARLY, 'مرة كل سنة'],
  [MaintenanceRecurrenceType.CUSTOM, 'مخصص'],
];

export const reminderBeforeOptions = [
  [MaintenanceReminderBefore.NONE, 'بدون تنبيه'],
  [MaintenanceReminderBefore.ONE_DAY, 'قبل يوم'],
  [MaintenanceReminderBefore.THREE_DAYS, 'قبل 3 أيام'],
  [MaintenanceReminderBefore.ONE_WEEK, 'قبل أسبوع'],
];

export const durationUnitOptions = [
  [MaintenanceDurationUnit.DAY, 'يوم'],
  [MaintenanceDurationUnit.MONTH, 'شهر'],
  [MaintenanceDurationUnit.YEAR, 'سنة'],
];

export const freeDurationPresetOptions = [
  ['1_MONTH', 'شهر واحد'],
  ['2_MONTHS', 'شهران'],
  ['3_MONTHS', '3 أشهر'],
  ['6_MONTHS', '6 أشهر'],
  ['9_MONTHS', '9 أشهر'],
  ['1_YEAR', 'سنة'],
  ['CUSTOM', 'أخرى'],
];

export const visitStatusClassMap = {
  SUCCESS: 'status-approved',
  FOLLOW_UP_REQUIRED: 'status-inprogress',
  PAID_REPAIR_REQUIRED: 'status-rejected',
  PARTIAL: 'status-submitted',
};

export const planStatusClassMap = {
  ACTIVE: 'status-approved',
  PAUSED: 'status-inprogress',
  ENDED: 'status-todo',
  EXPIRED: 'status-rejected',
};

export const dueStateClassMap = {
  TODAY: 'status-submitted',
  UPCOMING: 'status-inprogress',
  OVERDUE: 'status-rejected',
  COMPLETED: 'status-approved',
  ENDED: 'status-todo',
  EXPIRED: 'status-rejected',
};

export const technicianEvaluationOptions = [
  ['GOOD', 'جيد', 80],
  ['ACCEPTABLE', 'مقبول', 60],
  ['EXCELLENT', 'ممتاز', 100],
];

export const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('ar-IQ');
};

export const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('ar-IQ');
};

export const toDateInputValue = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  )).toISOString().slice(0, 10);
};

const getDaysInMonth = (year, month) =>
  new Date(Date.UTC(year, month + 1, 0, 12, 0, 0, 0)).getUTCDate();

const normalizeDateOnly = (value) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    12,
    0,
    0,
    0,
  ));
};

const addDateDuration = (value, amount, unit) => {
  const date = normalizeDateOnly(value);
  const safeAmount = Math.max(0, Number(amount || 0));

  if (!date || safeAmount === 0) {
    return date;
  }

  if (unit === MaintenanceDurationUnit.DAY) {
    return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + safeAmount,
      12,
      0,
      0,
      0,
    ));
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if (unit === MaintenanceDurationUnit.MONTH) {
    const targetMonth = month + safeAmount;
    const targetYear = year + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    return new Date(Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(day, getDaysInMonth(targetYear, normalizedMonth)),
      12,
      0,
      0,
      0,
    ));
  }

  const targetYear = year + safeAmount;
  return new Date(Date.UTC(
    targetYear,
    month,
    Math.min(day, getDaysInMonth(targetYear, month)),
    12,
    0,
    0,
    0,
  ));
};

const recurrenceStep = (form) => {
  switch (form.recurrenceType) {
    case MaintenanceRecurrenceType.MONTHLY:
      return { value: 1, unit: MaintenanceDurationUnit.MONTH };
    case MaintenanceRecurrenceType.TWICE_MONTHLY:
      return { value: 15, unit: MaintenanceDurationUnit.DAY };
    case MaintenanceRecurrenceType.EVERY_2_MONTHS:
      return { value: 2, unit: MaintenanceDurationUnit.MONTH };
    case MaintenanceRecurrenceType.EVERY_3_MONTHS:
      return { value: 3, unit: MaintenanceDurationUnit.MONTH };
    case MaintenanceRecurrenceType.EVERY_6_MONTHS:
      return { value: 6, unit: MaintenanceDurationUnit.MONTH };
    case MaintenanceRecurrenceType.YEARLY:
      return { value: 1, unit: MaintenanceDurationUnit.YEAR };
    case MaintenanceRecurrenceType.CUSTOM:
      return {
        value: Math.max(1, Number(form.customRecurrenceIntervalValue || 1)),
        unit: form.customRecurrenceIntervalUnit || MaintenanceDurationUnit.DAY,
      };
    default:
      return { value: 1, unit: MaintenanceDurationUnit.MONTH };
  }
};

export const resolveFreeDurationPreset = (preset) => {
  switch (preset) {
    case '1_MONTH':
      return { value: 1, unit: MaintenanceDurationUnit.MONTH };
    case '2_MONTHS':
      return { value: 2, unit: MaintenanceDurationUnit.MONTH };
    case '3_MONTHS':
      return { value: 3, unit: MaintenanceDurationUnit.MONTH };
    case '6_MONTHS':
      return { value: 6, unit: MaintenanceDurationUnit.MONTH };
    case '9_MONTHS':
      return { value: 9, unit: MaintenanceDurationUnit.MONTH };
    case '1_YEAR':
      return { value: 1, unit: MaintenanceDurationUnit.YEAR };
    default:
      return { value: 1, unit: MaintenanceDurationUnit.MONTH };
  }
};

export const estimatePlanEndDate = (form) => {
  const startDate = normalizeDateOnly(form.startDate);
  if (!startDate) {
    return null;
  }

  if (form.maintenanceType === MaintenancePlanType.FREE) {
    const customDuration = form.freeDurationPreset === 'CUSTOM'
      ? {
          value: Math.max(1, Number(form.freeDurationValue || 1)),
          unit: form.freeDurationUnit || MaintenanceDurationUnit.MONTH,
        }
      : resolveFreeDurationPreset(form.freeDurationPreset);

    return addDateDuration(startDate, customDuration.value, customDuration.unit);
  }

  return normalizeDateOnly(form.endDate);
};

export const estimateExpectedVisits = (form) => {
  const startDate = normalizeDateOnly(form.startDate);
  const endDate = estimatePlanEndDate(form);
  if (!startDate) {
    return 0;
  }

  if (form.recurrenceType === MaintenanceRecurrenceType.CUSTOM && Number(form.customVisitCount || 0) > 0) {
    return Number(form.customVisitCount || 0);
  }

  const step = recurrenceStep(form);
  let cursor = addDateDuration(startDate, step.value, step.unit);
  let count = 0;

  while (cursor) {
    if (endDate && cursor.getTime() > endDate.getTime()) {
      break;
    }
    count += 1;
    if (!endDate) {
      break;
    }
    cursor = addDateDuration(cursor, step.value, step.unit);
    if (count > 240) {
      break;
    }
  }

  return count;
};

export const buildPlanDefaultsFromReport = (report) => ({
  workReportId: report?._id || report?.id || '',
  customerId: '',
  customerName: report?.project?.name || report?.projectName || '',
  location: report?.location || '',
  phone: report?.phone || '',
  projectNumber: report?.project?.code || '',
  projectName: report?.project?.name || report?.projectName || '',
  executorName: report?.employeeName || report?.user?.fullName || '',
  completedWorkDate: toDateInputValue(report?.approvedAt || report?.workDate || report?.createdAt),
  maintenanceType: MaintenancePlanType.FREE,
  freeDurationPreset: '1_MONTH',
  freeDurationValue: 1,
  freeDurationUnit: MaintenanceDurationUnit.MONTH,
  startDate: toDateInputValue(report?.approvedAt || report?.createdAt),
  endDate: '',
  recurrenceType: MaintenanceRecurrenceType.MONTHLY,
  customRecurrenceIntervalValue: 30,
  customRecurrenceIntervalUnit: MaintenanceDurationUnit.DAY,
  customVisitCount: 1,
  expectedVisits: 1,
  assignedEmployeeId: '',
  status: MaintenancePlanStatus.ACTIVE,
  notes: '',
  reminderBefore: MaintenanceReminderBefore.ONE_WEEK,
});

export const buildDirectPlanDefaults = () => ({
  workReportId: '',
  customerId: '',
  customerName: '',
  location: '',
  phone: '',
  projectNumber: '',
  projectName: '',
  executorName: '',
  completedWorkDate: '',
  maintenanceType: MaintenancePlanType.FREE,
  freeDurationPreset: '1_MONTH',
  freeDurationValue: 1,
  freeDurationUnit: MaintenanceDurationUnit.MONTH,
  startDate: toDateInputValue(new Date()),
  endDate: '',
  recurrenceType: MaintenanceRecurrenceType.MONTHLY,
  customRecurrenceIntervalValue: 30,
  customRecurrenceIntervalUnit: MaintenanceDurationUnit.DAY,
  customVisitCount: 1,
  expectedVisits: 1,
  assignedEmployeeId: '',
  status: MaintenancePlanStatus.ACTIVE,
  notes: '',
  reminderBefore: MaintenanceReminderBefore.ONE_WEEK,
});

export const buildPlanDefaultsFromExisting = (plan) => ({
  workReportId: plan?.workReportId || '',
  customerId: plan?.customerId || '',
  customerName: plan?.customerName || '',
  location: plan?.location || '',
  phone: plan?.phone || '',
  projectNumber: plan?.projectNumber || '',
  projectName: plan?.projectName || '',
  executorName: plan?.executorName || '',
  completedWorkDate: toDateInputValue(plan?.completedWorkDate),
  maintenanceType: plan?.maintenanceType || MaintenancePlanType.FREE,
  freeDurationPreset: plan?.freeDurationPreset || (plan?.maintenanceType === MaintenancePlanType.FREE ? 'CUSTOM' : '1_MONTH'),
  freeDurationValue: plan?.freeDurationValue || 1,
  freeDurationUnit: plan?.freeDurationUnit || MaintenanceDurationUnit.MONTH,
  startDate: toDateInputValue(plan?.startDate),
  endDate: toDateInputValue(plan?.endDate),
  recurrenceType: plan?.recurrenceType || MaintenanceRecurrenceType.MONTHLY,
  customRecurrenceIntervalValue: plan?.customRecurrenceIntervalValue || 30,
  customRecurrenceIntervalUnit: plan?.customRecurrenceIntervalUnit || MaintenanceDurationUnit.DAY,
  customVisitCount: plan?.customVisitCount || plan?.expectedVisits || 1,
  expectedVisits: plan?.expectedVisits || 1,
  assignedEmployeeId: plan?.assignedEmployee?.id || '',
  status: plan?.status || MaintenancePlanStatus.ACTIVE,
  notes: plan?.notes || '',
  reminderBefore: plan?.reminderBefore || MaintenanceReminderBefore.ONE_WEEK,
});

export const buildPlanPayload = (form) => {
  const payload = {
    customerId: form.customerId,
    customerName: form.customerName,
    location: form.location,
    phone: form.phone,
    projectNumber: form.projectNumber,
    projectName: form.projectName,
    executorName: form.executorName,
    completedWorkDate: form.completedWorkDate,
    maintenanceType: form.maintenanceType,
    startDate: form.startDate,
    recurrenceType: form.recurrenceType,
    expectedVisits: Number(form.expectedVisits || 0),
    assignedEmployeeId: form.assignedEmployeeId || '',
    status: form.status,
    notes: form.notes,
    reminderBefore: form.reminderBefore,
  };

  if (form.workReportId) {
    payload.workReportId = form.workReportId;
  }

  if (form.maintenanceType === MaintenancePlanType.FREE) {
    payload.freeDurationPreset = form.freeDurationPreset;
    payload.freeDurationValue = Number(form.freeDurationValue || 0);
    payload.freeDurationUnit = form.freeDurationUnit;
  } else {
    payload.endDate = form.endDate;
  }

  if (form.recurrenceType === MaintenanceRecurrenceType.CUSTOM) {
    payload.customRecurrenceIntervalValue = Number(form.customRecurrenceIntervalValue || 0);
    payload.customRecurrenceIntervalUnit = form.customRecurrenceIntervalUnit;
    payload.customVisitCount = Number(form.customVisitCount || 0);
  }

  return payload;
};

export const createEmptyVisitForm = (plan = {}) => ({
  visitDate: toDateInputValue(new Date()),
  technicianId: plan?.assignedEmployee?.id || '',
  visitType: '',
  deviceStatus: '',
  workDone: '',
  notes: '',
  recommendations: '',
  completionRate: 100,
  visitCompletedSuccessfully: true,
  followUpRequired: false,
  paidRepairRequired: false,
  signedBy: '',
  approvalText: '',
  customerSignature: '',
  technicianSignature: plan?.assignedEmployee?.fullName || '',
  projectManagerSignature: '',
  technicianEvaluationGrade: '',
  technicianEvaluationPercent: '',
  scheduledVisitId: plan?.scheduledVisits?.find((item) => !item.completedAt)?.id || '',
  images: [],
});

export const buildVisitFormData = (form) => {
  const formData = new FormData();
  formData.append('visitDate', form.visitDate || '');
  formData.append('technicianId', form.technicianId || '');
  formData.append('visitType', form.visitType || '');
  formData.append('deviceStatus', form.deviceStatus || '');
  formData.append('workDone', form.workDone || '');
  formData.append('notes', form.notes || '');
  formData.append('recommendations', form.recommendations || '');
  formData.append('completionRate', String(form.completionRate ?? 100));
  formData.append('visitCompletedSuccessfully', String(!!form.visitCompletedSuccessfully));
  formData.append('followUpRequired', String(!!form.followUpRequired));
  formData.append('paidRepairRequired', String(!!form.paidRepairRequired));
  formData.append('signedBy', form.signedBy || '');
  formData.append('approvalText', form.approvalText || '');
  formData.append('customerSignature', form.customerSignature || '');
  formData.append('technicianSignature', form.technicianSignature || '');
  formData.append('projectManagerSignature', form.projectManagerSignature || '');
  formData.append('technicianEvaluationGrade', form.technicianEvaluationGrade || '');
  formData.append('technicianEvaluationPercent', String(form.technicianEvaluationPercent || ''));
  formData.append('scheduledVisitId', form.scheduledVisitId || '');

  const comments = [];
  Array.from(form.images || []).forEach((file) => {
    formData.append('images', file);
    comments.push('');
  });
  formData.append('imageComments', JSON.stringify(comments));

  return formData;
};
