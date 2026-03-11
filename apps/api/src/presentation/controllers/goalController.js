import dayjs from 'dayjs';
import { GoalRepository } from '../../infrastructure/db/repositories/GoalRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import {
  applyManagedScopeOnFilter,
  isUserWithinManagedScope,
  resolveManagedUserIds,
} from '../../shared/accessScope.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { auditService } from '../../application/services/auditService.js';

const goalRepository = new GoalRepository();
const userRepository = new UserRepository();

export const createGoal = asyncHandler(async (req, res) => {
  const { userId, title, period, targetPoints, startDate, endDate } = req.body;

  if (!title || !period || !targetPoints) {
    throw new AppError('title, period and targetPoints are required', 400);
  }

  const targetUser = userId || req.user.id;
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  if (!isUserWithinManagedScope({ managedUserIds, userId: targetUser })) {
    throw new AppError('You can only create goals for employees in your management scope', 403);
  }

  const derivedStart = startDate || dayjs().startOf('month').toDate();
  const derivedEnd = endDate || dayjs().endOf('month').toDate();

  const goal = await goalRepository.create({
    user: targetUser,
    title,
    period,
    targetPoints,
    startDate: derivedStart,
    endDate: derivedEnd,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'GOAL_CREATED',
    entityType: 'GOAL',
    entityId: goal._id,
    after: {
      title,
      period,
      targetPoints,
      user: targetUser,
    },
    req,
  });

  res.status(201).json({ goal });
});

export const listGoals = asyncHandler(async (req, res) => {
  const filter = {};
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  applyManagedScopeOnFilter({
    filter,
    managedUserIds,
    field: 'user',
    requestedUserId: req.query.userId,
  });

  if (req.query.period) {
    filter.period = req.query.period;
  }

  const goals = await goalRepository.list(filter);
  res.json({ goals });
});
