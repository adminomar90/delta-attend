const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

export const dailyWorkPlanPriorityLabelMap = {
  [DailyWorkPlanPriority.URGENT]: 'عاجل',
  [DailyWorkPlanPriority.HIGH]: 'عالي',
  [DailyWorkPlanPriority.MEDIUM]: 'متوسط',
  [DailyWorkPlanPriority.LOW]: 'منخفض',
};

export const dailyWorkPlanTaskTypeLabelMap = {
  [DailyWorkPlanTaskType.MAINTENANCE]: 'صيانة',
  [DailyWorkPlanTaskType.INSTALLATION]: 'تركيب',
  [DailyWorkPlanTaskType.INSPECTION]: 'كشف',
  [DailyWorkPlanTaskType.FOLLOW_UP]: 'متابعة',
  [DailyWorkPlanTaskType.VISIT]: 'زيارة',
  [DailyWorkPlanTaskType.DELIVERY]: 'تسليم',
  [DailyWorkPlanTaskType.PROGRAMMING]: 'برمجة',
  [DailyWorkPlanTaskType.OTHER]: 'أعمال أخرى',
};

export const dailyWorkPlanStatusLabelMap = {
  [DailyWorkPlanStatus.NEW]: 'جديدة',
  [DailyWorkPlanStatus.IN_PROGRESS]: 'قيد التنفيذ',
  [DailyWorkPlanStatus.PENDING_APPROVAL]: 'بانتظار الاعتماد',
  [DailyWorkPlanStatus.COMPLETED]: 'مكتملة',
  [DailyWorkPlanStatus.OVERDUE]: 'متأخرة',
  [DailyWorkPlanStatus.POSTPONED]: 'مؤجلة',
  [DailyWorkPlanStatus.CANCELLED]: 'ملغية',
  [DailyWorkPlanStatus.STOPPED]: 'متوقفة',
};

const OVERDUE_ELIGIBLE_STATUSES = new Set([
  DailyWorkPlanStatus.NEW,
  DailyWorkPlanStatus.IN_PROGRESS,
  DailyWorkPlanStatus.STOPPED,
  DailyWorkPlanStatus.OVERDUE,
]);

const COMPLETED_STATUSES = new Set([
  DailyWorkPlanStatus.COMPLETED,
]);

const NON_LATE_STATUSES = new Set([
  DailyWorkPlanStatus.COMPLETED,
  DailyWorkPlanStatus.CANCELLED,
  DailyWorkPlanStatus.POSTPONED,
]);

const toDateObject = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const toDateOnly = (value) => {
  const date = toDateObject(value);
  if (!date) {
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

export const formatPlanDateKey = (value) => {
  const date = toDateOnly(value);
  if (!date) {
    return '';
  }

  return date.toISOString().slice(0, 10);
};

const normalizeLocalizedDigits = (value) =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

export const sanitizeTimeValue = (value, fallback = '') => {
  const normalized = normalizeLocalizedDigits(value).trim();
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : fallback;
};

export const combinePlanDateTime = (planDate, time, fallbackTime = '23:59') => {
  const dateKey = formatPlanDateKey(planDate);
  if (!dateKey) {
    return null;
  }

  const resolvedTime = sanitizeTimeValue(time, fallbackTime || '23:59') || '23:59';
  const date = new Date(`${dateKey}T${resolvedTime}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const clampProgress = (value) => {
  const number = Number(normalizeLocalizedDigits(value));
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(number)));
};

export const clampAwardedPoints = (value) => {
  const number = Number(normalizeLocalizedDigits(value));
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(0, Math.round(number));
};

export const buildTimelineEntry = ({
  type,
  actorId = null,
  actorName = '',
  actorRole = '',
  message = '',
  metadata = {},
  createdAt = new Date(),
} = {}) => ({
  type: String(type || '').trim() || 'SYSTEM',
  actor: actorId || null,
  actorName: String(actorName || '').trim(),
  actorRole: String(actorRole || '').trim(),
  message: String(message || '').trim(),
  metadata: metadata && typeof metadata === 'object' ? metadata : {},
  createdAt,
});

export const createStoredAttachment = (file, actor = {}, comment = '') => ({
  fileName: file.filename || '',
  originalName: file.originalname || file.filename || '',
  mimeType: file.mimetype || '',
  size: Number(file.size || 0),
  storagePath: file.path || '',
  publicUrl: file.filename ? `/uploads/${file.filename}` : '',
  uploadedBy: actor.id || actor._id || null,
  uploadedByName: actor.fullName || actor.name || '',
  uploadedAt: new Date(),
  comment: String(comment || '').trim(),
});

export const normalizeAssigneeInput = (assignee = {}) => ({
  user: assignee.user || assignee.userId || assignee.id || null,
  status: assignee.status || DailyWorkPlanStatus.NEW,
  progressPercent: clampProgress(assignee.progressPercent),
  employeeNotes: String(assignee.employeeNotes || '').trim(),
  adminNotes: String(assignee.adminNotes || '').trim(),
  startedAt: toDateObject(assignee.startedAt),
  completedAt: toDateObject(assignee.completedAt),
  lastUpdatedAt: toDateObject(assignee.lastUpdatedAt) || new Date(),
  pointsAwarded: clampAwardedPoints(assignee.pointsAwarded),
  pointsAwardedBy: assignee.pointsAwardedBy || null,
  pointsAwardedAt: toDateObject(assignee.pointsAwardedAt),
  pointsAwardNote: String(assignee.pointsAwardNote || '').trim(),
  teamLeaderRating: assignee.teamLeaderRating ?? null,
  delayRequest: assignee.delayRequest || null,
  attachments: Array.isArray(assignee.attachments) ? assignee.attachments : [],
});

const normalizeAssigneeOverdueStatus = (assignee, { dueAt, now = new Date() } = {}) => {
  const normalized = {
    ...assignee,
    progressPercent: clampProgress(assignee.progressPercent),
    attachments: Array.isArray(assignee.attachments) ? assignee.attachments : [],
  };

  if (
    dueAt
    && toDateObject(dueAt)
    && toDateObject(dueAt).getTime() < now.getTime()
    && OVERDUE_ELIGIBLE_STATUSES.has(normalized.status)
    && normalized.progressPercent < 100
  ) {
    normalized.status = DailyWorkPlanStatus.OVERDUE;
  }

  if (normalized.status === DailyWorkPlanStatus.COMPLETED) {
    normalized.progressPercent = 100;
    normalized.completedAt = normalized.completedAt || now;
  }

  return normalized;
};

export const recalculatePlanState = (plan = {}, { now = new Date() } = {}) => {
  const dueAt = toDateObject(plan.dueAt) || combinePlanDateTime(plan.planDate, plan.expectedEndTime);
  const assignees = (Array.isArray(plan.assignees) ? plan.assignees : [])
    .map((assignee) => normalizeAssigneeOverdueStatus(assignee, { dueAt, now }));
  const totalAssignees = assignees.length;
  const counts = {
    total: totalAssignees,
    newCount: 0,
    inProgressCount: 0,
    pendingApprovalCount: 0,
    completedCount: 0,
    overdueCount: 0,
    postponedCount: 0,
    cancelledCount: 0,
    stoppedCount: 0,
  };

  assignees.forEach((assignee) => {
    switch (assignee.status) {
      case DailyWorkPlanStatus.IN_PROGRESS:
        counts.inProgressCount += 1;
        break;
      case DailyWorkPlanStatus.PENDING_APPROVAL:
        counts.pendingApprovalCount += 1;
        break;
      case DailyWorkPlanStatus.COMPLETED:
        counts.completedCount += 1;
        break;
      case DailyWorkPlanStatus.OVERDUE:
        counts.overdueCount += 1;
        break;
      case DailyWorkPlanStatus.POSTPONED:
        counts.postponedCount += 1;
        break;
      case DailyWorkPlanStatus.CANCELLED:
        counts.cancelledCount += 1;
        break;
      case DailyWorkPlanStatus.STOPPED:
        counts.stoppedCount += 1;
        break;
      default:
        counts.newCount += 1;
        break;
    }
  });

  let status = plan.status || DailyWorkPlanStatus.NEW;
  if (totalAssignees) {
    if (counts.completedCount === totalAssignees) {
      status = DailyWorkPlanStatus.COMPLETED;
    } else if (counts.cancelledCount === totalAssignees) {
      status = DailyWorkPlanStatus.CANCELLED;
    } else if (counts.postponedCount === totalAssignees) {
      status = DailyWorkPlanStatus.POSTPONED;
    } else if (
      counts.pendingApprovalCount > 0
      && counts.completedCount + counts.pendingApprovalCount === totalAssignees
    ) {
      status = DailyWorkPlanStatus.PENDING_APPROVAL;
    } else if (counts.inProgressCount > 0) {
      status = DailyWorkPlanStatus.IN_PROGRESS;
    } else if (counts.overdueCount > 0) {
      status = DailyWorkPlanStatus.OVERDUE;
    } else if (counts.stoppedCount === totalAssignees) {
      status = DailyWorkPlanStatus.STOPPED;
    } else {
      status = DailyWorkPlanStatus.NEW;
    }
  }

  if (
    dueAt
    && dueAt.getTime() < now.getTime()
    && !NON_LATE_STATUSES.has(status)
    && status !== DailyWorkPlanStatus.PENDING_APPROVAL
  ) {
    status = DailyWorkPlanStatus.OVERDUE;
  }

  const progressPercent = totalAssignees
    ? clampProgress(
        assignees.reduce((sum, assignee) => sum + clampProgress(assignee.progressPercent), 0) / totalAssignees,
      )
    : clampProgress(plan.progressPercent);

  return {
    assignees,
    status,
    progressPercent: status === DailyWorkPlanStatus.COMPLETED ? 100 : progressPercent,
    dueAt,
    counts,
  };
};

export const buildDailyWorkPlanSummary = (plans = [], { today = new Date(), featuredLimit = 6 } = {}) => {
  const todayKey = formatPlanDateKey(today);
  const summary = {
    totalPlans: plans.length,
    totalToday: 0,
    completed: 0,
    inProgress: 0,
    overdue: 0,
    postponed: 0,
    pendingApproval: 0,
    archived: 0,
    urgent: 0,
    byStatus: {},
    featuredPlans: [],
  };

  const featured = [...plans]
    .sort((left, right) => {
      const priorityRank = {
        [DailyWorkPlanPriority.URGENT]: 4,
        [DailyWorkPlanPriority.HIGH]: 3,
        [DailyWorkPlanPriority.MEDIUM]: 2,
        [DailyWorkPlanPriority.LOW]: 1,
      };
      const statusRank = {
        [DailyWorkPlanStatus.OVERDUE]: 5,
        [DailyWorkPlanStatus.PENDING_APPROVAL]: 4,
        [DailyWorkPlanStatus.IN_PROGRESS]: 3,
        [DailyWorkPlanStatus.NEW]: 2,
        [DailyWorkPlanStatus.POSTPONED]: 1,
      };

      const leftScore = (statusRank[left.status] || 0) * 10 + (priorityRank[left.priority] || 0);
      const rightScore = (statusRank[right.status] || 0) * 10 + (priorityRank[right.priority] || 0);
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }
      return (toDateObject(right.lastUpdatedAt)?.getTime() || 0) - (toDateObject(left.lastUpdatedAt)?.getTime() || 0);
    })
    .slice(0, featuredLimit);

  plans.forEach((plan) => {
    const status = plan.status || DailyWorkPlanStatus.NEW;
    summary.byStatus[status] = Number(summary.byStatus[status] || 0) + 1;

    if (formatPlanDateKey(plan.planDate) === todayKey) {
      summary.totalToday += 1;
    }

    if (plan.priority === DailyWorkPlanPriority.URGENT) {
      summary.urgent += 1;
    }

    if (plan.archived) summary.archived += 1;
    if (status === DailyWorkPlanStatus.COMPLETED) summary.completed += 1;
    if (status === DailyWorkPlanStatus.IN_PROGRESS) summary.inProgress += 1;
    if (status === DailyWorkPlanStatus.OVERDUE) summary.overdue += 1;
    if (status === DailyWorkPlanStatus.POSTPONED) summary.postponed += 1;
    if (status === DailyWorkPlanStatus.PENDING_APPROVAL) summary.pendingApproval += 1;
  });

  summary.featuredPlans = featured;
  return summary;
};

export const buildDailyProductivitySummary = (plans = []) => {
  const employees = new Map();

  plans.forEach((plan) => {
    (plan.assignees || []).forEach((assignee) => {
      const userId = String(assignee.user?._id || assignee.user?.id || assignee.user || '').trim();
      if (!userId) {
        return;
      }

      if (!employees.has(userId)) {
        employees.set(userId, {
          userId,
          fullName: assignee.user?.fullName || assignee.fullName || 'موظف',
          totalAssignments: 0,
          completedAssignments: 0,
          overdueAssignments: 0,
          progressTotal: 0,
        });
      }

      const bucket = employees.get(userId);
      bucket.totalAssignments += 1;
      bucket.progressTotal += clampProgress(assignee.progressPercent);
      if (assignee.status === DailyWorkPlanStatus.COMPLETED) {
        bucket.completedAssignments += 1;
      }
      if (assignee.status === DailyWorkPlanStatus.OVERDUE) {
        bucket.overdueAssignments += 1;
      }
    });
  });

  return [...employees.values()]
    .map((item) => ({
      ...item,
      averageProgress: item.totalAssignments
        ? clampProgress(item.progressTotal / item.totalAssignments)
        : 0,
    }))
    .sort((left, right) => {
      if (right.completedAssignments !== left.completedAssignments) {
        return right.completedAssignments - left.completedAssignments;
      }
      return right.averageProgress - left.averageProgress;
    });
};

export const getNextPlanDate = (value, days = 1) => {
  const date = toDateOnly(value);
  if (!date) {
    return null;
  }

  return new Date(date.getTime() + Math.max(1, Number(days || 1)) * DAY_IN_MS);
};

export const canAutoMarkOverdue = (plan = {}, now = new Date()) => {
  const dueAt = toDateObject(plan.dueAt) || combinePlanDateTime(plan.planDate, plan.expectedEndTime);
  if (!dueAt || dueAt.getTime() >= now.getTime()) {
    return false;
  }

  return OVERDUE_ELIGIBLE_STATUSES.has(plan.status);
};

export const syncOverdueDailyWorkPlans = async ({
  repository,
  now = new Date(),
} = {}) => {
  if (!repository?.listOverdueCandidates || !repository?.updateById) {
    return { updated: 0 };
  }

  const candidates = await repository.listOverdueCandidates(now);
  let updated = 0;

  for (const candidate of candidates) {
    const normalized = recalculatePlanState(candidate.toObject ? candidate.toObject() : candidate, { now });
    if (
      normalized.status === candidate.status
      && normalized.progressPercent === clampProgress(candidate.progressPercent)
      && JSON.stringify(normalized.assignees.map((assignee) => ({
        user: String(assignee.user?._id || assignee.user || ''),
        status: assignee.status,
        progressPercent: assignee.progressPercent,
      }))) === JSON.stringify((candidate.assignees || []).map((assignee) => ({
        user: String(assignee.user?._id || assignee.user || ''),
        status: assignee.status,
        progressPercent: clampProgress(assignee.progressPercent),
      })))
    ) {
      continue;
    }

    await repository.updateById(candidate._id || candidate.id, {
      status: normalized.status,
      progressPercent: normalized.progressPercent,
      assignees: normalized.assignees,
      dueAt: normalized.dueAt,
      lastUpdatedAt: now,
      $push: {
        timeline: buildTimelineEntry({
          type: 'AUTO_OVERDUE_SYNC',
          message: 'تم تحديث البلان تلقائيًا إلى متأخرة بسبب انتهاء الوقت المحدد.',
          createdAt: now,
        }),
      },
    });
    updated += 1;
  }

  return { updated };
};

export const buildDailyWorkPlanExportRows = (plans = []) =>
  plans.map((plan) => ({
    id: String(plan._id || plan.id || ''),
    title: plan.title || '',
    customerName: plan.customerName || '',
    projectName: plan.project?.name || plan.projectNameSnapshot || '',
    location: plan.location || '',
    planDate: formatPlanDateKey(plan.planDate),
    timeRange: [sanitizeTimeValue(plan.startTime), sanitizeTimeValue(plan.expectedEndTime)].filter(Boolean).join(' - '),
    statusLabel: dailyWorkPlanStatusLabelMap[plan.status] || plan.status || '',
    priorityLabel: dailyWorkPlanPriorityLabelMap[plan.priority] || plan.priority || '',
    taskTypeLabel: dailyWorkPlanTaskTypeLabelMap[plan.taskType] || plan.taskType || '',
    progressPercent: clampProgress(plan.progressPercent),
    archivedLabel: plan.archived ? 'Yes' : 'No',
    archivedAt: toDateObject(plan.archivedAt),
    archivedByName: plan.archivedBy?.fullName || '',
    assigneesLabel: (plan.assignees || []).map((item) => item.user?.fullName || item.fullName || '').filter(Boolean).join('، '),
    lastUpdatedAt: toDateObject(plan.lastUpdatedAt),
  }));
