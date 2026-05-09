'use client';

export const DailyWorkPlanPriority = {
  URGENT: 'URGENT',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

export const DailyWorkPlanTaskType = {
  MAINTENANCE: 'MAINTENANCE',
  INSTALLATION: 'INSTALLATION',
  INSPECTION: 'INSPECTION',
  FOLLOW_UP: 'FOLLOW_UP',
  VISIT: 'VISIT',
  DELIVERY: 'DELIVERY',
  PROGRAMMING: 'PROGRAMMING',
  OTHER: 'OTHER',
};

export const DailyWorkPlanStatus = {
  NEW: 'NEW',
  IN_PROGRESS: 'IN_PROGRESS',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  COMPLETED: 'COMPLETED',
  OVERDUE: 'OVERDUE',
  POSTPONED: 'POSTPONED',
  CANCELLED: 'CANCELLED',
  STOPPED: 'STOPPED',
};

export const dailyWorkPlanPriorityOptions = [
  [DailyWorkPlanPriority.URGENT, 'عاجل'],
  [DailyWorkPlanPriority.HIGH, 'عالي'],
  [DailyWorkPlanPriority.MEDIUM, 'متوسط'],
  [DailyWorkPlanPriority.LOW, 'منخفض'],
];

export const dailyWorkPlanTaskTypeOptions = [
  [DailyWorkPlanTaskType.MAINTENANCE, 'صيانة'],
  [DailyWorkPlanTaskType.INSTALLATION, 'تركيب'],
  [DailyWorkPlanTaskType.INSPECTION, 'كشف'],
  [DailyWorkPlanTaskType.FOLLOW_UP, 'متابعة'],
  [DailyWorkPlanTaskType.VISIT, 'زيارة'],
  [DailyWorkPlanTaskType.DELIVERY, 'تسليم'],
  [DailyWorkPlanTaskType.PROGRAMMING, 'برمجة'],
  [DailyWorkPlanTaskType.OTHER, 'أعمال أخرى'],
];

export const dailyWorkPlanStatusOptions = [
  [DailyWorkPlanStatus.NEW, 'جديدة'],
  [DailyWorkPlanStatus.IN_PROGRESS, 'قيد التنفيذ'],
  [DailyWorkPlanStatus.PENDING_APPROVAL, 'بانتظار الاعتماد'],
  [DailyWorkPlanStatus.COMPLETED, 'مكتملة'],
  [DailyWorkPlanStatus.OVERDUE, 'متأخرة'],
  [DailyWorkPlanStatus.POSTPONED, 'مؤجلة'],
  [DailyWorkPlanStatus.CANCELLED, 'ملغية'],
  [DailyWorkPlanStatus.STOPPED, 'متوقفة'],
];

export const dailyWorkPlanStatusLabelMap = Object.fromEntries(dailyWorkPlanStatusOptions);
export const dailyWorkPlanPriorityLabelMap = Object.fromEntries(dailyWorkPlanPriorityOptions);
export const dailyWorkPlanTaskTypeLabelMap = Object.fromEntries(dailyWorkPlanTaskTypeOptions);

export const dailyWorkPlanStatusClassMap = {
  [DailyWorkPlanStatus.NEW]: 'status-todo',
  [DailyWorkPlanStatus.IN_PROGRESS]: 'status-inprogress',
  [DailyWorkPlanStatus.PENDING_APPROVAL]: 'status-submitted',
  [DailyWorkPlanStatus.COMPLETED]: 'status-approved',
  [DailyWorkPlanStatus.OVERDUE]: 'status-rejected',
  [DailyWorkPlanStatus.POSTPONED]: 'status-submitted',
  [DailyWorkPlanStatus.CANCELLED]: 'status-rejected',
  [DailyWorkPlanStatus.STOPPED]: 'status-todo',
};

export const dailyWorkPlanPriorityClassMap = {
  [DailyWorkPlanPriority.URGENT]: 'status-rejected',
  [DailyWorkPlanPriority.HIGH]: 'status-submitted',
  [DailyWorkPlanPriority.MEDIUM]: 'status-inprogress',
  [DailyWorkPlanPriority.LOW]: 'status-todo',
};

export const createEmptyDailyWorkPlanFilters = () => ({
  search: '',
  planDate: '',
  employee: '',
  supervisor: '',
  project: '',
  status: '',
  priority: '',
  taskType: '',
});

export const normalizeLocalizedDigits = (value) =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

export const sanitizeIntegerInput = (value) =>
  normalizeLocalizedDigits(value).replace(/[^\d]/g, '');

export const toDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10);
};

export const toTimeInputValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Baghdad',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ar-IQ');
};

export const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' });
};

export const createPlanFormDefaults = (plan = null) => ({
  title: plan?.title || '',
  description: plan?.description || '',
  customerName: plan?.customerName || '',
  customer: plan?.customer?._id || plan?.customer?.id || plan?.customer || '',
  customerSiteId: plan?.customerSnapshot?.siteId || '',
  customerPhone: plan?.customerSnapshot?.phone || '',
  customerWhatsapp: plan?.customerSnapshot?.whatsapp || '',
  customerMapUrl: plan?.customerSnapshot?.mapUrl || '',
  customerSiteName: plan?.customerSnapshot?.siteName || '',
  siteManagerName: plan?.customerSnapshot?.siteManagerName || '',
  siteManagerPhone: plan?.customerSnapshot?.siteManagerPhone || '',
  location: plan?.location || '',
  planDate: toDateInputValue(plan?.planDate || new Date()),
  startTime: plan?.startTime || '',
  expectedEndTime: plan?.expectedEndTime || '',
  priority: plan?.priority || DailyWorkPlanPriority.MEDIUM,
  taskType: plan?.taskType || DailyWorkPlanTaskType.OTHER,
  project: plan?.project?._id || plan?.project?.id || '',
  supervisor: plan?.supervisor?._id || plan?.supervisor?.id || '',
  teamLeader: plan?.teamLeader?._id || plan?.teamLeader?.id || '',
  assigneeIds: (plan?.assignees || []).map((item) => item.user?._id || item.user?.id || item.user).filter(Boolean),
  adminNotes: plan?.adminNotes || '',
  attachments: [],
});

export const createProgressFormDefaults = (plan = null, assigneeId = '') => ({
  progressPercent: plan?.progressPercent || 0,
  note: '',
  assigneeId,
  attachments: [],
});

export const createStatusFormDefaults = (status = DailyWorkPlanStatus.IN_PROGRESS, assigneeId = '') => ({
  status,
  note: '',
  assigneeId,
});

export const createPostponeFormDefaults = (plan = null) => ({
  targetDate: toDateInputValue(plan?.postponedTo || new Date(Date.now() + 24 * 60 * 60 * 1000)),
  targetTime: toTimeInputValue(plan?.postponedTo || plan?.expectedEndTime || '23:59') || plan?.expectedEndTime || '23:59',
  reason: '',
});

export const createApproveFormDefaults = (plan = null) => {
  const entries = (plan?.assignees || []).map((item) => {
    const userId = item.user?._id || item.user?.id || item.user;
    return [userId, String(Math.max(0, Number(item.pointsAwarded || 0)))];
  }).filter(([userId]) => Boolean(userId));

  const teamLeaderId = plan?.teamLeader?._id || plan?.teamLeader?.id || plan?.teamLeader || '';
  const assigneeIds = new Set(entries.map(([id]) => String(id)));
  if (teamLeaderId && !assigneeIds.has(String(teamLeaderId))) {
    entries.push([teamLeaderId, '0']);
  }

  return {
    note: '',
    pointsByAssignee: Object.fromEntries(entries),
  };
};

export const createFinishFormDefaults = (plan = null) => ({
  note: '',
  ratingsByAssignee: Object.fromEntries(
    (plan?.assignees || []).map((item) => {
      const userId = item.user?._id || item.user?.id || item.user;
      return [userId, String(item.teamLeaderRating ?? '')];
    }).filter(([userId]) => Boolean(userId)),
  ),
});

export const buildDailyWorkPlanFormData = (form) => {
  const formData = new FormData();
  formData.append('title', form.title || '');
  formData.append('description', form.description || '');
  formData.append('customerName', form.customerName || '');
  formData.append('customer', form.customer || '');
  formData.append('customerSiteId', form.customerSiteId || '');
  formData.append('location', form.location || '');
  formData.append('planDate', form.planDate || '');
  formData.append('startTime', form.startTime || '');
  formData.append('expectedEndTime', form.expectedEndTime || '');
  formData.append('priority', form.priority || DailyWorkPlanPriority.MEDIUM);
  formData.append('taskType', form.taskType || DailyWorkPlanTaskType.OTHER);
  formData.append('project', form.project || '');
  formData.append('supervisor', form.supervisor || '');
  formData.append('teamLeader', form.teamLeader || '');
  formData.append('adminNotes', form.adminNotes || '');
  formData.append('assigneeIds', JSON.stringify(form.assigneeIds || []));
  Array.from(form.attachments || []).forEach((file) => {
    formData.append('attachments', file);
  });
  return formData;
};

export const buildProgressFormData = (form) => {
  const formData = new FormData();
  formData.append('progressPercent', sanitizeIntegerInput(form.progressPercent ?? 0) || '0');
  formData.append('note', form.note || '');
  formData.append('assigneeId', form.assigneeId || '');
  Array.from(form.attachments || []).forEach((file) => {
    formData.append('attachments', file);
  });
  return formData;
};

export const buildStatusPayload = (form) => ({
  status: form.status,
  note: form.note || '',
  assigneeId: form.assigneeId || '',
});

export const buildPostponePayload = (form) => ({
  targetDate: form.targetDate || '',
  targetTime: form.targetTime || '',
  reason: form.reason || '',
});

export const buildApprovePayload = (form) => ({
  note: form.note || '',
  pointsByAssignee: Object.fromEntries(
    Object.entries(form.pointsByAssignee || {}).map(([userId, value]) => {
      const parsed = Number(sanitizeIntegerInput(value));
      return [userId, Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0];
    }),
  ),
});

export const buildFinishPayload = (form) => ({
  status: 'PENDING_APPROVAL',
  note: form.note || '',
  ratingsByAssignee: Object.fromEntries(
    Object.entries(form.ratingsByAssignee || {}).map(([userId, value]) => {
      const parsed = Number(sanitizeIntegerInput(value));
      return [userId, Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0];
    }),
  ),
});

export const formatAssigneesSummary = (assignees = [], { maxVisible = 2 } = {}) => {
  const names = (assignees || [])
    .map((item) => item.user?.fullName || item.fullName || '')
    .filter(Boolean);

  if (!names.length) {
    return '-';
  }

  if (names.length <= maxVisible) {
    return names.join('، ');
  }

  const remaining = names.length - maxVisible;
  return `${names.slice(0, maxVisible).join('، ')} +${remaining}`;
};
