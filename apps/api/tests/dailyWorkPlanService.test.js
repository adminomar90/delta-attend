import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyProductivitySummary,
  buildDailyWorkPlanSummary,
  DailyWorkPlanPriority,
  DailyWorkPlanStatus,
  getNextPlanDate,
  recalculatePlanState,
  syncOverdueDailyWorkPlans,
} from '../src/application/services/dailyWorkPlanService.js';
import { listDailyWorkPlanMeta } from '../src/presentation/controllers/dailyWorkPlanController.js';
import { ProjectRepository } from '../src/infrastructure/db/repositories/ProjectRepository.js';
import { UserRepository } from '../src/infrastructure/db/repositories/UserRepository.js';
import { Permission, Roles } from '../src/shared/constants.js';

const invokeController = (handler, req) =>
  new Promise((resolve, reject) => {
    const res = {
      json(payload) {
        resolve(payload);
      },
    };

    handler(req, res, (error) => {
      if (error) reject(error);
    });
  });

test('recalculatePlanState marks active plans overdue after due time', () => {
  const result = recalculatePlanState({
    status: DailyWorkPlanStatus.IN_PROGRESS,
    planDate: '2026-03-30',
    expectedEndTime: '10:00',
    dueAt: new Date('2026-03-30T10:00:00.000Z'),
    assignees: [
      { user: 'u1', status: DailyWorkPlanStatus.IN_PROGRESS, progressPercent: 55 },
      { user: 'u2', status: DailyWorkPlanStatus.NEW, progressPercent: 0 },
    ],
  }, {
    now: new Date('2026-03-30T12:00:00.000Z'),
  });

  assert.equal(result.status, DailyWorkPlanStatus.OVERDUE);
  assert.equal(result.assignees[0].status, DailyWorkPlanStatus.OVERDUE);
  assert.equal(result.progressPercent, 28);
});

test('buildDailyWorkPlanSummary aggregates counters and today totals', () => {
  const summary = buildDailyWorkPlanSummary([
    {
      title: 'مهمة 1',
      status: DailyWorkPlanStatus.IN_PROGRESS,
      priority: DailyWorkPlanPriority.URGENT,
      planDate: '2026-03-30',
      lastUpdatedAt: '2026-03-30T09:00:00.000Z',
    },
    {
      title: 'مهمة 2',
      status: DailyWorkPlanStatus.COMPLETED,
      priority: DailyWorkPlanPriority.HIGH,
      planDate: '2026-03-30',
      lastUpdatedAt: '2026-03-30T08:00:00.000Z',
    },
    {
      title: 'مهمة 3',
      status: DailyWorkPlanStatus.OVERDUE,
      priority: DailyWorkPlanPriority.MEDIUM,
      planDate: '2026-03-29',
      lastUpdatedAt: '2026-03-30T07:00:00.000Z',
    },
  ], {
    today: new Date('2026-03-30T10:00:00.000Z'),
  });

  assert.equal(summary.totalPlans, 3);
  assert.equal(summary.totalToday, 2);
  assert.equal(summary.completed, 1);
  assert.equal(summary.inProgress, 1);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.urgent, 1);
  assert.equal(summary.featuredPlans[0].title, 'مهمة 3');
});

test('buildDailyProductivitySummary ranks employees by completed assignments then progress', () => {
  const rows = buildDailyProductivitySummary([
    {
      assignees: [
        { user: { _id: 'u1', fullName: 'أحمد' }, status: DailyWorkPlanStatus.COMPLETED, progressPercent: 100 },
        { user: { _id: 'u2', fullName: 'سارة' }, status: DailyWorkPlanStatus.OVERDUE, progressPercent: 40 },
      ],
    },
    {
      assignees: [
        { user: { _id: 'u1', fullName: 'أحمد' }, status: DailyWorkPlanStatus.COMPLETED, progressPercent: 100 },
        { user: { _id: 'u2', fullName: 'سارة' }, status: DailyWorkPlanStatus.IN_PROGRESS, progressPercent: 80 },
      ],
    },
  ]);

  assert.equal(rows[0].userId, 'u1');
  assert.equal(rows[0].completedAssignments, 2);
  assert.equal(rows[1].userId, 'u2');
  assert.equal(rows[1].overdueAssignments, 1);
});

test('getNextPlanDate moves plan to the next calendar day', () => {
  const nextDate = getNextPlanDate('2026-03-30', 1);
  assert.equal(nextDate.toISOString().slice(0, 10), '2026-03-31');
});

test('syncOverdueDailyWorkPlans updates overdue candidates through repository', async () => {
  const updates = [];
  const repository = {
    listOverdueCandidates: async () => ([
      {
        _id: 'plan-1',
        status: DailyWorkPlanStatus.IN_PROGRESS,
        progressPercent: 50,
        dueAt: new Date('2026-03-30T09:00:00.000Z'),
        assignees: [{ user: 'u1', status: DailyWorkPlanStatus.IN_PROGRESS, progressPercent: 50 }],
        toObject() {
          return this;
        },
      },
    ]),
    updateById: async (id, payload) => {
      updates.push({ id, payload });
      return { _id: id, ...payload };
    },
  };

  const result = await syncOverdueDailyWorkPlans({
    repository,
    now: new Date('2026-03-30T12:00:00.000Z'),
  });

  assert.equal(result.updated, 1);
  assert.equal(updates[0].id, 'plan-1');
  assert.equal(updates[0].payload.status, DailyWorkPlanStatus.OVERDUE);
});

test('daily work plan employee visibility permission returns all employees in meta', async () => {
  const userRepositoryPrototype = UserRepository.prototype;
  const projectRepositoryPrototype = ProjectRepository.prototype;
  const originalListForManagement = userRepositoryPrototype.listForManagement;
  const originalProjectList = projectRepositoryPrototype.list;
  let capturedOptions = null;

  userRepositoryPrototype.listForManagement = async (options) => {
    capturedOptions = options;
    return [{ _id: 'emp-1', fullName: 'Employee 1' }];
  };
  projectRepositoryPrototype.list = async () => [];

  try {
    const payload = await invokeController(listDailyWorkPlanMeta, {
      user: {
        id: 'viewer-1',
        role: Roles.TECHNICAL_STAFF,
        customPermissions: [Permission.VIEW_ALL_DAILY_WORK_PLAN_EMPLOYEES],
      },
      headers: {},
      ip: '127.0.0.1',
    });

    assert.equal(capturedOptions.userIds, undefined);
    assert.equal(payload.users.length, 1);
  } finally {
    userRepositoryPrototype.listForManagement = originalListForManagement;
    projectRepositoryPrototype.list = originalProjectList;
  }
});
