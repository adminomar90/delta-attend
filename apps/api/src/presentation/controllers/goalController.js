import dayjs from 'dayjs';
import { GoalRepository } from '../../infrastructure/db/repositories/GoalRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { GoalStatus } from '../../infrastructure/db/models/GoalModel.js';
import { GoalPeriod, Roles } from '../../shared/constants.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import {
  buildGoalSnapshot,
  calculateGoalProgressPercent,
  resolveGoalPeriod,
} from '../../application/services/goalProgressService.js';

const goalRepository = new GoalRepository();
const userRepository = new UserRepository();

const toRoundedNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const assertGeneralManager = (req) => {
  if (req.user?.role !== Roles.GENERAL_MANAGER) {
    throw new AppError('Only general manager can manage goals', 403);
  }
};

const toDateOrFail = (value, fieldName) => {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) {
    throw new AppError(`${fieldName} is required`, 400);
  }
  return parsed;
};

const normalizeGoalPayload = ({
  input = {},
  targetUser = null,
  currentGoal = null,
}) => {
  const title = String(input.title || '').trim();
  if (!title) {
    throw new AppError('title is required', 400);
  }

  const startDate = toDateOrFail(input.startDate, 'startDate');
  const endDate = toDateOrFail(input.endDate, 'endDate');
  if (startDate > endDate) {
    throw new AppError('endDate must be after startDate', 400);
  }

  const targetPoints = Math.round(toRoundedNumber(input.targetPoints, 0));
  if (targetPoints < 10 || targetPoints > 100000) {
    throw new AppError('targetPoints must be between 10 and 100000', 400);
  }

  const employeeLevel = Math.max(1, toRoundedNumber(targetUser?.level, 1));
  const startLevel = currentGoal
    ? Math.max(1, toRoundedNumber(currentGoal.startLevel, employeeLevel))
    : employeeLevel;
  const targetLevel = Math.round(toRoundedNumber(input.targetLevel, employeeLevel + 1));
  if (targetLevel <= employeeLevel) {
    throw new AppError('targetLevel must be greater than current employee level', 400);
  }

  return {
    title,
    description: String(input.description || '').trim(),
    startDate,
    endDate,
    period: resolveGoalPeriod({ startDate, endDate }) || GoalPeriod.CUSTOM,
    targetPoints,
    startLevel,
    targetLevel,
  };
};

const serializeGoal = (goal) => {
  const now = dayjs();
  const endDate = dayjs(goal.endDate);
  const startDate = dayjs(goal.startDate);
  const progressPercent = calculateGoalProgressPercent(goal);
  const remainingPoints = Math.max(0, toRoundedNumber(goal.targetPoints, 0) - toRoundedNumber(goal.currentPoints, 0));
  const remainingMinutes = Math.max(0, endDate.diff(now, 'minute'));

  return {
    ...buildGoalSnapshot(goal, goal.user),
    user: goal.user ? {
      id: String(goal.user._id || goal.user.id || ''),
      fullName: goal.user.fullName || '',
      role: goal.user.role || '',
      level: toRoundedNumber(goal.user.level, 1),
      pointsTotal: toRoundedNumber(goal.user.pointsTotal, 0),
      employeeCode: goal.user.employeeCode || '',
      avatarUrl: goal.user.avatarUrl || '',
      active: goal.user.active !== false,
    } : null,
    createdBy: goal.createdBy ? {
      id: String(goal.createdBy._id || goal.createdBy.id || ''),
      fullName: goal.createdBy.fullName || '',
      role: goal.createdBy.role || '',
    } : null,
    updatedBy: goal.updatedBy ? {
      id: String(goal.updatedBy._id || goal.updatedBy.id || ''),
      fullName: goal.updatedBy.fullName || '',
      role: goal.updatedBy.role || '',
    } : null,
    periodLabel: goal.period === GoalPeriod.DAILY
      ? 'يومي'
      : goal.period === GoalPeriod.WEEKLY
        ? 'أسبوعي'
        : goal.period === GoalPeriod.MONTHLY
          ? 'شهري'
          : 'مخصص',
    progressPercent,
    remainingPoints,
    currentLevel: toRoundedNumber(goal.user?.level, toRoundedNumber(goal.startLevel, 1)),
    nextLevel: toRoundedNumber(goal.targetLevel, toRoundedNumber(goal.startLevel, 1) + 1),
    daysRemaining: Math.max(0, endDate.diff(now, 'day')),
    timeRemainingMinutes: remainingMinutes,
    timeRemainingText: goal.achieved
      ? 'تم تحقيق الهدف'
      : endDate.isBefore(now)
        ? 'انتهت مدة الهدف'
        : remainingMinutes < 60
          ? `${remainingMinutes} دقيقة`
          : remainingMinutes < 1440
            ? `${Math.ceil(remainingMinutes / 60)} ساعة`
            : `${Math.ceil(remainingMinutes / 1440)} يوم`,
    started: startDate.isBefore(now) || startDate.isSame(now, 'day'),
    ended: endDate.isBefore(now),
    overachieved: toRoundedNumber(goal.currentPoints, 0) > toRoundedNumber(goal.targetPoints, 0),
    createdAt: goal.createdAt || null,
    updatedAt: goal.updatedAt || null,
  };
};

const buildGoalsSummary = (goals = []) => {
  const total = goals.length;
  const active = goals.filter((goal) => goal.status === GoalStatus.ACTIVE).length;
  const achieved = goals.filter((goal) => goal.status === GoalStatus.ACHIEVED).length;
  const expired = goals.filter((goal) => goal.status === GoalStatus.EXPIRED).length;
  const cancelled = goals.filter((goal) => goal.status === GoalStatus.CANCELLED).length;
  const overachieved = goals.filter((goal) => goal.currentPoints > goal.targetPoints).length;

  const averageProgressPercent = total
    ? Math.round(goals.reduce((sum, goal) => sum + calculateGoalProgressPercent(goal), 0) / total)
    : 0;

  return {
    total,
    active,
    achieved,
    expired,
    cancelled,
    overachieved,
    averageProgressPercent,
    totalTargetPoints: goals.reduce((sum, goal) => sum + toRoundedNumber(goal.targetPoints, 0), 0),
    totalEarnedPoints: goals.reduce((sum, goal) => sum + toRoundedNumber(goal.currentPoints, 0), 0),
  };
};

export const createGoal = asyncHandler(async (req, res) => {
  assertGeneralManager(req);

  const targetUserId = String(req.body.userId || '').trim();
  if (!targetUserId) {
    throw new AppError('userId is required', 400);
  }

  const targetUser = await userRepository.findById(targetUserId);
  if (!targetUser || !targetUser.active) {
    throw new AppError('Target employee not found or inactive', 404);
  }

  const payload = normalizeGoalPayload({
    input: req.body,
    targetUser,
  });

  const overlappingGoal = await goalRepository.findOverlappingGoal({
    userId: targetUserId,
    startDate: payload.startDate,
    endDate: payload.endDate,
  });

  if (overlappingGoal) {
    throw new AppError('Employee already has another active or scheduled goal in the selected period', 409);
  }

  const goal = await goalRepository.create({
    ...payload,
    user: targetUserId,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  const createdGoal = await goalRepository.findById(goal._id);

  await notificationService.notifyGoalAssigned(targetUserId, createdGoal);

  await auditService.log({
    actorId: req.user.id,
    action: 'GOAL_CREATED',
    entityType: 'GOAL',
    entityId: goal._id,
    after: serializeGoal(createdGoal),
    req,
  });

  res.status(201).json({ goal: serializeGoal(createdGoal) });
});

export const updateGoal = asyncHandler(async (req, res) => {
  assertGeneralManager(req);

  await goalRepository.expireElapsedGoals();

  const goal = await goalRepository.findById(req.params.id);
  if (!goal || goal.deletedAt) {
    throw new AppError('Goal not found', 404);
  }

  if ([GoalStatus.ACHIEVED, GoalStatus.CANCELLED].includes(goal.status)) {
    throw new AppError('Achieved or deleted goals cannot be edited', 400);
  }

  const targetUser = await userRepository.findById(goal.user?._id || goal.user);
  if (!targetUser || !targetUser.active) {
    throw new AppError('Target employee not found or inactive', 404);
  }

  const before = serializeGoal(goal);
  const payload = normalizeGoalPayload({
    input: {
      ...goal.toObject(),
      ...req.body,
    },
    targetUser,
    currentGoal: goal,
  });

  const overlappingGoal = await goalRepository.findOverlappingGoal({
    userId: String(targetUser._id),
    startDate: payload.startDate,
    endDate: payload.endDate,
    excludeGoalId: req.params.id,
  });

  if (overlappingGoal) {
    throw new AppError('Employee already has another active or scheduled goal in the selected period', 409);
  }

  const updatedGoal = await goalRepository.updateById(req.params.id, {
    ...payload,
    updatedBy: req.user.id,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'GOAL_UPDATED',
    entityType: 'GOAL',
    entityId: goal._id,
    before,
    after: serializeGoal(updatedGoal),
    req,
  });

  res.json({ goal: serializeGoal(updatedGoal) });
});

export const deleteGoal = asyncHandler(async (req, res) => {
  assertGeneralManager(req);

  const goal = await goalRepository.findById(req.params.id);
  if (!goal || goal.deletedAt) {
    throw new AppError('Goal not found', 404);
  }

  const before = serializeGoal(goal);
  const deletedGoal = await goalRepository.softDeleteById(req.params.id, {
    deletedBy: req.user.id,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'GOAL_DELETED',
    entityType: 'GOAL',
    entityId: goal._id,
    before,
    after: serializeGoal(deletedGoal),
    req,
  });

  res.json({ goal: serializeGoal(deletedGoal) });
});

export const listGoals = asyncHandler(async (req, res) => {
  await goalRepository.expireElapsedGoals();

  const filter = {};
  const currentOnly = req.query.current === '1';

  if (req.user.role !== Roles.GENERAL_MANAGER) {
    filter.user = req.user.id;
  } else if (req.query.userId) {
    filter.user = req.query.userId;
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (currentOnly) {
    const now = new Date();
    filter.status = GoalStatus.ACTIVE;
    filter.startDate = { $lte: now };
    filter.endDate = { $gte: now };
  }

  const goals = await goalRepository.list(filter);
  res.json({ goals: goals.map(serializeGoal) });
});

export const goalsSummary = asyncHandler(async (req, res) => {
  assertGeneralManager(req);

  await goalRepository.expireElapsedGoals();
  const goals = await goalRepository.list({});
  const serializedGoals = goals.map(serializeGoal);

  res.json({
    summary: buildGoalsSummary(serializedGoals),
    activeGoals: serializedGoals
      .filter((goal) => goal.status === GoalStatus.ACTIVE)
      .sort((a, b) => b.progressPercent - a.progressPercent)
      .slice(0, 10),
    overachievers: serializedGoals
      .filter((goal) => goal.overachieved)
      .sort((a, b) => b.currentPoints - a.currentPoints)
      .slice(0, 10),
    recentAchievements: serializedGoals
      .filter((goal) => goal.status === GoalStatus.ACHIEVED)
      .sort((a, b) => new Date(b.achievedAt || b.updatedAt || 0) - new Date(a.achievedAt || a.updatedAt || 0))
      .slice(0, 10),
  });
});
