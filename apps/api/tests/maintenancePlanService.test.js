import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MaintenancePlanStatus,
  MaintenancePlanType,
  MaintenanceRecurrenceType,
  MaintenanceDurationUnit,
  MaintenanceReminderBefore,
  MaintenanceScheduledVisitState,
  addDateOnlyDuration,
  attachVisitToSchedule,
  calculateExpectedVisitsFromPeriod,
  calculateFreeMaintenanceEndDate,
  generateMaintenanceSchedule,
  summarizeMaintenancePlan,
  summarizeMaintenancePlans,
} from '../src/application/services/maintenancePlanService.js';

test('calculateFreeMaintenanceEndDate adds calendar months safely', () => {
  const result = calculateFreeMaintenanceEndDate({
    startDate: '2026-01-31',
    freeDurationValue: 1,
    freeDurationUnit: MaintenanceDurationUnit.MONTH,
  });

  assert.equal(result.toISOString().slice(0, 10), '2026-02-28');
});

test('calculateExpectedVisitsFromPeriod counts visits after plan start date', () => {
  const visits = calculateExpectedVisitsFromPeriod({
    startDate: '2026-01-01',
    endDate: '2026-04-01',
    recurrenceType: MaintenanceRecurrenceType.MONTHLY,
  });

  assert.equal(visits, 3);
});

test('generateMaintenanceSchedule creates future visits only', () => {
  const schedule = generateMaintenanceSchedule({
    startDate: '2026-01-01',
    endDate: '2026-04-01',
    recurrenceType: MaintenanceRecurrenceType.MONTHLY,
    expectedVisits: 3,
  });

  assert.deepEqual(
    schedule.map((item) => item.scheduledDate.toISOString().slice(0, 10)),
    ['2026-02-01', '2026-03-01', '2026-04-01'],
  );
});

test('summarizeMaintenancePlan marks overdue, today, and upcoming visits', () => {
  const plan = {
    maintenanceType: MaintenancePlanType.FREE,
    status: MaintenancePlanStatus.ACTIVE,
    reminderBefore: MaintenanceReminderBefore.THREE_DAYS,
    scheduledVisits: [
      { id: 'a', sequence: 1, scheduledDate: '2026-03-10', completedAt: null },
      { id: 'b', sequence: 2, scheduledDate: '2026-03-12', completedAt: null },
      { id: 'c', sequence: 3, scheduledDate: '2026-03-14', completedAt: null },
    ],
  };

  const summary = summarizeMaintenancePlan(plan, { now: new Date('2026-03-12T08:00:00.000Z') });

  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.dueTodayCount, 1);
  assert.equal(summary.upcomingCount, 1);
  assert.equal(summary.nextVisitState, MaintenanceScheduledVisitState.OVERDUE);
});

test('summarizeMaintenancePlan auto-ends completed plans', () => {
  const plan = {
    maintenanceType: MaintenancePlanType.PAID,
    status: MaintenancePlanStatus.ACTIVE,
    reminderBefore: MaintenanceReminderBefore.ONE_WEEK,
    scheduledVisits: [
      { id: 'a', sequence: 1, scheduledDate: '2026-02-01', completedAt: '2026-02-01' },
      { id: 'b', sequence: 2, scheduledDate: '2026-03-01', completedAt: '2026-03-01' },
    ],
  };

  const summary = summarizeMaintenancePlan(plan, { now: new Date('2026-03-15T08:00:00.000Z') });

  assert.equal(summary.status, MaintenancePlanStatus.ENDED);
  assert.equal(summary.completedVisits, 2);
  assert.equal(summary.remainingVisits, 0);
});

test('summarizeMaintenancePlans builds dashboard counters and due ordering', () => {
  const payload = summarizeMaintenancePlans([
    {
      customerName: 'عميل 1',
      maintenanceType: MaintenancePlanType.FREE,
      status: MaintenancePlanStatus.ACTIVE,
      reminderBefore: MaintenanceReminderBefore.ONE_WEEK,
      scheduledVisits: [{ id: 'a', sequence: 1, scheduledDate: '2026-03-10', completedAt: null }],
    },
    {
      customerName: 'عميل 2',
      maintenanceType: MaintenancePlanType.PAID,
      status: MaintenancePlanStatus.ACTIVE,
      reminderBefore: MaintenanceReminderBefore.ONE_WEEK,
      scheduledVisits: [{ id: 'b', sequence: 1, scheduledDate: '2026-03-12', completedAt: null }],
    },
    {
      customerName: 'عميل 3',
      maintenanceType: MaintenancePlanType.PAID,
      status: MaintenancePlanStatus.ACTIVE,
      reminderBefore: MaintenanceReminderBefore.ONE_WEEK,
      scheduledVisits: [{ id: 'c', sequence: 1, scheduledDate: '2026-03-17', completedAt: null }],
    },
  ], { now: new Date('2026-03-12T08:00:00.000Z') });

  assert.equal(payload.totalPlans, 3);
  assert.equal(payload.overdue, 1);
  assert.equal(payload.dueToday, 1);
  assert.equal(payload.upcoming, 1);
  assert.equal(payload.featuredDuePlans[0].plan.customerName, 'عميل 1');
});

test('attachVisitToSchedule completes the nearest pending visit and appends ad-hoc visits when needed', () => {
  const initialSchedule = generateMaintenanceSchedule({
    startDate: '2026-01-01',
    recurrenceType: MaintenanceRecurrenceType.MONTHLY,
    expectedVisits: 2,
  });

  const afterFirstVisit = attachVisitToSchedule({
    scheduledVisits: initialSchedule,
    visitDate: '2026-02-04',
    visitId: 'visit-1',
  });

  assert.equal(afterFirstVisit[0].visitReport, 'visit-1');
  assert.equal(afterFirstVisit[0].completedAt.toISOString().slice(0, 10), '2026-02-04');

  const completedSchedule = afterFirstVisit.map((item, index) => ({
    ...item,
    completedAt: addDateOnlyDuration(item.scheduledDate, index, MaintenanceDurationUnit.DAY),
    visitReport: `done-${index + 1}`,
  }));

  const afterAdHocVisit = attachVisitToSchedule({
    scheduledVisits: completedSchedule,
    visitDate: '2026-04-20',
    visitId: 'visit-3',
  });

  assert.equal(afterAdHocVisit.length, 3);
  assert.equal(afterAdHocVisit[2].isAdHoc, true);
  assert.equal(afterAdHocVisit[2].visitReport, 'visit-3');
});
