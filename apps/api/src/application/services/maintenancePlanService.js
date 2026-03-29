import { randomUUID } from 'crypto';

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

export const MaintenanceDurationUnit = {
  DAY: 'DAY',
  MONTH: 'MONTH',
  YEAR: 'YEAR',
};

export const MaintenanceReminderBefore = {
  NONE: 'NONE',
  ONE_DAY: 'ONE_DAY',
  THREE_DAYS: 'THREE_DAYS',
  ONE_WEEK: 'ONE_WEEK',
};

export const MaintenanceScheduledVisitState = {
  COMPLETED: 'COMPLETED',
  TODAY: 'TODAY',
  UPCOMING: 'UPCOMING',
  OVERDUE: 'OVERDUE',
  FUTURE: 'FUTURE',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
  EXPIRED: 'EXPIRED',
};

const DEFAULT_MAX_VISITS = 240;
const DATE_NOON_HOUR = 12;

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeDateOnly = (value) => {
  if (!value) {
    return null;
  }

  const source = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(source.getTime())) {
    return null;
  }

  return new Date(Date.UTC(
    source.getUTCFullYear(),
    source.getUTCMonth(),
    source.getUTCDate(),
    DATE_NOON_HOUR,
    0,
    0,
    0,
  ));
};

const createUtcDate = (year, month, day) =>
  new Date(Date.UTC(year, month, day, DATE_NOON_HOUR, 0, 0, 0));

const getDaysInMonth = (year, month) =>
  new Date(Date.UTC(year, month + 1, 0, DATE_NOON_HOUR, 0, 0, 0)).getUTCDate();

export const compareDateOnly = (left, right) => {
  const a = normalizeDateOnly(left);
  const b = normalizeDateOnly(right);

  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return -1;
  }
  if (!b) {
    return 1;
  }

  return a.getTime() - b.getTime();
};

export const diffDateOnlyInDays = (left, right) => {
  const a = normalizeDateOnly(left);
  const b = normalizeDateOnly(right);

  if (!a || !b) {
    return Number.NaN;
  }

  return Math.round((a.getTime() - b.getTime()) / 86400000);
};

export const addDateOnlyDuration = (value, amount, unit) => {
  const baseDate = normalizeDateOnly(value);
  const safeAmount = Math.max(0, Math.trunc(safeNumber(amount, 0)));

  if (!baseDate) {
    return null;
  }
  if (safeAmount === 0) {
    return baseDate;
  }

  if (unit === MaintenanceDurationUnit.DAY) {
    return createUtcDate(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate() + safeAmount,
    );
  }

  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth();
  const day = baseDate.getUTCDate();

  if (unit === MaintenanceDurationUnit.MONTH) {
    const targetMonth = month + safeAmount;
    const targetYear = year + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const nextDay = Math.min(day, getDaysInMonth(targetYear, normalizedMonth));
    return createUtcDate(targetYear, normalizedMonth, nextDay);
  }

  if (unit === MaintenanceDurationUnit.YEAR) {
    const targetYear = year + safeAmount;
    const nextDay = Math.min(day, getDaysInMonth(targetYear, month));
    return createUtcDate(targetYear, month, nextDay);
  }

  return baseDate;
};

export const resolveReminderBeforeDays = (value) => {
  switch (String(value || '').toUpperCase()) {
    case MaintenanceReminderBefore.ONE_DAY:
      return 1;
    case MaintenanceReminderBefore.THREE_DAYS:
      return 3;
    case MaintenanceReminderBefore.ONE_WEEK:
      return 7;
    default:
      return 0;
  }
};

export const resolveRecurrenceStep = ({
  recurrenceType,
  customRecurrenceIntervalValue,
  customRecurrenceIntervalUnit,
}) => {
  switch (String(recurrenceType || '').toUpperCase()) {
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
        value: Math.max(1, Math.trunc(safeNumber(customRecurrenceIntervalValue, 1))),
        unit: [MaintenanceDurationUnit.DAY, MaintenanceDurationUnit.MONTH, MaintenanceDurationUnit.YEAR]
          .includes(String(customRecurrenceIntervalUnit || '').toUpperCase())
          ? String(customRecurrenceIntervalUnit).toUpperCase()
          : MaintenanceDurationUnit.DAY,
      };
    default:
      return { value: 1, unit: MaintenanceDurationUnit.MONTH };
  }
};

export const calculateFreeMaintenanceEndDate = ({
  startDate,
  freeDurationValue,
  freeDurationUnit,
}) => {
  const normalizedStartDate = normalizeDateOnly(startDate);
  if (!normalizedStartDate) {
    return null;
  }

  return addDateOnlyDuration(
    normalizedStartDate,
    Math.max(1, Math.trunc(safeNumber(freeDurationValue, 1))),
    String(freeDurationUnit || '').toUpperCase(),
  );
};

export const generateScheduledDates = ({
  startDate,
  recurrenceType,
  customRecurrenceIntervalValue,
  customRecurrenceIntervalUnit,
  expectedVisits,
  endDate,
  maxVisits = DEFAULT_MAX_VISITS,
}) => {
  const normalizedStartDate = normalizeDateOnly(startDate);
  const normalizedEndDate = normalizeDateOnly(endDate);
  const limit = Math.max(0, Math.min(
    Math.trunc(safeNumber(expectedVisits, 0)) || 0,
    Math.max(1, Math.trunc(safeNumber(maxVisits, DEFAULT_MAX_VISITS))),
  ));

  if (!normalizedStartDate) {
    return [];
  }

  const step = resolveRecurrenceStep({
    recurrenceType,
    customRecurrenceIntervalValue,
    customRecurrenceIntervalUnit,
  });

  const dates = [];
  let cursor = addDateOnlyDuration(normalizedStartDate, step.value, step.unit);

  while (cursor) {
    if (normalizedEndDate && compareDateOnly(cursor, normalizedEndDate) > 0) {
      break;
    }

    dates.push(cursor);

    if (limit && dates.length >= limit) {
      break;
    }
    if (!limit && !normalizedEndDate) {
      break;
    }
    if (dates.length >= maxVisits) {
      break;
    }

    const nextCursor = addDateOnlyDuration(cursor, step.value, step.unit);
    if (!nextCursor || compareDateOnly(nextCursor, cursor) === 0) {
      break;
    }

    cursor = nextCursor;
  }

  return dates;
};

export const calculateExpectedVisitsFromPeriod = ({
  startDate,
  endDate,
  recurrenceType,
  customRecurrenceIntervalValue,
  customRecurrenceIntervalUnit,
}) =>
  generateScheduledDates({
    startDate,
    endDate,
    recurrenceType,
    customRecurrenceIntervalValue,
    customRecurrenceIntervalUnit,
  }).length;

export const generateMaintenanceSchedule = ({
  startDate,
  endDate,
  recurrenceType,
  customRecurrenceIntervalValue,
  customRecurrenceIntervalUnit,
  expectedVisits,
}) =>
  generateScheduledDates({
    startDate,
    endDate,
    recurrenceType,
    customRecurrenceIntervalValue,
    customRecurrenceIntervalUnit,
    expectedVisits,
  }).map((scheduledDate, index) => ({
    id: randomUUID(),
    sequence: index + 1,
    scheduledDate,
    completedAt: null,
    visitReport: null,
    isAdHoc: false,
  }));

export const rebuildMaintenanceSchedule = ({
  existingScheduledVisits = [],
  startDate,
  endDate,
  recurrenceType,
  customRecurrenceIntervalValue,
  customRecurrenceIntervalUnit,
  expectedVisits,
}) => {
  const completedEntries = [...existingScheduledVisits]
    .filter((item) => normalizeDateOnly(item.completedAt))
    .sort((left, right) => {
      const leftDate = normalizeDateOnly(left.completedAt || left.scheduledDate);
      const rightDate = normalizeDateOnly(right.completedAt || right.scheduledDate);
      return compareDateOnly(leftDate, rightDate);
    });

  const targetCount = Math.max(0, Math.trunc(safeNumber(expectedVisits, 0)));
  const templateSchedule = generateMaintenanceSchedule({
    startDate,
    endDate,
    recurrenceType,
    customRecurrenceIntervalValue,
    customRecurrenceIntervalUnit,
    expectedVisits: targetCount,
  });

  return templateSchedule.map((entry, index) => {
    const completed = completedEntries[index];
    if (!completed) {
      return entry;
    }

    return {
      ...entry,
      ...completed,
      id: completed.id || entry.id,
      sequence: index + 1,
      visitReport: completed.visitReport || null,
      completedAt: normalizeDateOnly(completed.completedAt || entry.completedAt),
      scheduledDate: normalizeDateOnly(completed.scheduledDate || entry.scheduledDate) || entry.scheduledDate,
      isAdHoc: !!completed.isAdHoc,
    };
  });
};

export const resolveComputedPlanStatus = (plan, now = new Date()) => {
  const currentStatus = String(plan?.status || MaintenancePlanStatus.ACTIVE).toUpperCase();
  if ([MaintenancePlanStatus.PAUSED, MaintenancePlanStatus.ENDED].includes(currentStatus)) {
    return currentStatus;
  }

  const normalizedEndDate = normalizeDateOnly(plan?.endDate);
  const normalizedNow = normalizeDateOnly(now);

  if (normalizedEndDate && normalizedNow && compareDateOnly(normalizedEndDate, normalizedNow) < 0) {
    return MaintenancePlanStatus.EXPIRED;
  }

  return MaintenancePlanStatus.ACTIVE;
};

export const resolveScheduledVisitState = (visit, {
  planStatus = MaintenancePlanStatus.ACTIVE,
  reminderBefore = MaintenanceReminderBefore.NONE,
  now = new Date(),
} = {}) => {
  if (normalizeDateOnly(visit?.completedAt)) {
    return MaintenanceScheduledVisitState.COMPLETED;
  }

  if (planStatus === MaintenancePlanStatus.PAUSED) {
    return MaintenanceScheduledVisitState.PAUSED;
  }

  if (planStatus === MaintenancePlanStatus.ENDED) {
    return MaintenanceScheduledVisitState.ENDED;
  }

  if (planStatus === MaintenancePlanStatus.EXPIRED) {
    return MaintenanceScheduledVisitState.EXPIRED;
  }

  const scheduledDate = normalizeDateOnly(visit?.scheduledDate);
  const normalizedNow = normalizeDateOnly(now);
  const reminderDays = resolveReminderBeforeDays(reminderBefore);

  if (!scheduledDate || !normalizedNow) {
    return MaintenanceScheduledVisitState.FUTURE;
  }

  const diffDays = diffDateOnlyInDays(scheduledDate, normalizedNow);
  if (diffDays < 0) {
    return MaintenanceScheduledVisitState.OVERDUE;
  }
  if (diffDays === 0) {
    return MaintenanceScheduledVisitState.TODAY;
  }
  if (reminderDays > 0 && diffDays <= reminderDays) {
    return MaintenanceScheduledVisitState.UPCOMING;
  }

  return MaintenanceScheduledVisitState.FUTURE;
};

export const summarizeMaintenancePlan = (plan, { now = new Date() } = {}) => {
  const computedStatus = resolveComputedPlanStatus(plan, now);
  const scheduledVisits = [...(plan?.scheduledVisits || [])]
    .map((item, index) => {
      const scheduledDate = normalizeDateOnly(item.scheduledDate);
      const completedAt = normalizeDateOnly(item.completedAt);
      const state = resolveScheduledVisitState(
        { ...item, scheduledDate, completedAt },
        {
          planStatus: computedStatus,
          reminderBefore: plan?.reminderBefore,
          now,
        },
      );

      return {
        ...item,
        id: item.id || randomUUID(),
        sequence: Number(item.sequence || index + 1),
        scheduledDate,
        completedAt,
        state,
      };
    })
    .sort((left, right) => {
      if (left.sequence !== right.sequence) {
        return left.sequence - right.sequence;
      }
      return compareDateOnly(left.scheduledDate, right.scheduledDate);
    });

  const completedItems = scheduledVisits.filter((item) => item.state === MaintenanceScheduledVisitState.COMPLETED);
  const pendingItems = scheduledVisits.filter((item) => item.state !== MaintenanceScheduledVisitState.COMPLETED);
  const dueTodayItems = scheduledVisits.filter((item) => item.state === MaintenanceScheduledVisitState.TODAY);
  const overdueItems = scheduledVisits.filter((item) => item.state === MaintenanceScheduledVisitState.OVERDUE);
  const upcomingItems = scheduledVisits.filter((item) => item.state === MaintenanceScheduledVisitState.UPCOMING);
  const nextVisit = pendingItems[0] || null;
  const lastCompleted = completedItems[completedItems.length - 1] || null;

  let effectiveStatus = computedStatus;
  if (effectiveStatus === MaintenancePlanStatus.ACTIVE && !pendingItems.length && completedItems.length) {
    effectiveStatus = MaintenancePlanStatus.ENDED;
  }

  return {
    status: effectiveStatus,
    scheduledVisits,
    expectedVisits: scheduledVisits.length,
    completedVisits: completedItems.length,
    remainingVisits: Math.max(0, scheduledVisits.length - completedItems.length),
    nextVisitDate: nextVisit?.scheduledDate || null,
    nextVisitState: nextVisit?.state || null,
    lastVisitDate: lastCompleted?.completedAt || lastCompleted?.scheduledDate || null,
    dueTodayCount: dueTodayItems.length,
    overdueCount: overdueItems.length,
    upcomingCount: upcomingItems.length,
    dueItems: [...overdueItems, ...dueTodayItems, ...upcomingItems],
  };
};

const resolveDuePriority = (state) => {
  switch (state) {
    case MaintenanceScheduledVisitState.OVERDUE:
      return 0;
    case MaintenanceScheduledVisitState.TODAY:
      return 1;
    case MaintenanceScheduledVisitState.UPCOMING:
      return 2;
    default:
      return 99;
  }
};

export const summarizeMaintenancePlans = (plans = [], { now = new Date(), dueLimit = 8 } = {}) => {
  const enrichedPlans = plans.map((plan) => {
    const summary = summarizeMaintenancePlan(plan, { now });
    return {
      plan,
      summary,
    };
  });

  const duePlans = enrichedPlans
    .filter(({ summary }) =>
      [MaintenanceScheduledVisitState.OVERDUE, MaintenanceScheduledVisitState.TODAY, MaintenanceScheduledVisitState.UPCOMING]
        .includes(summary.nextVisitState))
    .sort((left, right) => {
      const priorityDiff = resolveDuePriority(left.summary.nextVisitState) - resolveDuePriority(right.summary.nextVisitState);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return compareDateOnly(left.summary.nextVisitDate, right.summary.nextVisitDate);
    });

  return {
    totalPlans: enrichedPlans.length,
    activePlans: enrichedPlans.filter(({ summary }) => summary.status === MaintenancePlanStatus.ACTIVE).length,
    pausedPlans: enrichedPlans.filter(({ summary }) => summary.status === MaintenancePlanStatus.PAUSED).length,
    endedPlans: enrichedPlans.filter(({ summary }) => summary.status === MaintenancePlanStatus.ENDED).length,
    expiredPlans: enrichedPlans.filter(({ summary }) => summary.status === MaintenancePlanStatus.EXPIRED).length,
    freePlans: enrichedPlans.filter(({ plan }) => String(plan.maintenanceType || '').toUpperCase() === MaintenancePlanType.FREE).length,
    paidPlans: enrichedPlans.filter(({ plan }) => String(plan.maintenanceType || '').toUpperCase() === MaintenancePlanType.PAID).length,
    dueToday: enrichedPlans.reduce((sum, item) => sum + item.summary.dueTodayCount, 0),
    overdue: enrichedPlans.reduce((sum, item) => sum + item.summary.overdueCount, 0),
    upcoming: enrichedPlans.reduce((sum, item) => sum + item.summary.upcomingCount, 0),
    featuredDuePlans: duePlans.slice(0, dueLimit).map(({ plan, summary }) => ({
      plan,
      summary,
    })),
  };
};

export const attachVisitToSchedule = ({
  scheduledVisits = [],
  visitDate,
  visitId,
  scheduledVisitId,
}) => {
  const normalizedVisitDate = normalizeDateOnly(visitDate) || normalizeDateOnly(new Date());
  const nextSchedule = [...scheduledVisits].map((item) => ({
    ...item,
    scheduledDate: normalizeDateOnly(item.scheduledDate),
    completedAt: normalizeDateOnly(item.completedAt),
  }));

  let targetIndex = -1;

  if (scheduledVisitId) {
    targetIndex = nextSchedule.findIndex((item) => item.id === scheduledVisitId && !item.completedAt);
  }

  if (targetIndex === -1) {
    targetIndex = nextSchedule.findIndex((item) =>
      !item.completedAt && compareDateOnly(item.scheduledDate, normalizedVisitDate) <= 0);
  }

  if (targetIndex === -1) {
    targetIndex = nextSchedule.findIndex((item) => !item.completedAt);
  }

  if (targetIndex === -1) {
    nextSchedule.push({
      id: randomUUID(),
      sequence: nextSchedule.length + 1,
      scheduledDate: normalizedVisitDate,
      completedAt: normalizedVisitDate,
      visitReport: visitId,
      isAdHoc: true,
    });

    return nextSchedule;
  }

  nextSchedule[targetIndex] = {
    ...nextSchedule[targetIndex],
    completedAt: normalizedVisitDate,
    visitReport: visitId,
  };

  return nextSchedule.map((item, index) => ({
    ...item,
    sequence: index + 1,
  }));
};
