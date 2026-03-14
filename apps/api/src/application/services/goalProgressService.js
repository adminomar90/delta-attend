import dayjs from 'dayjs';
import { GoalRepository } from '../../infrastructure/db/repositories/GoalRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { GoalStatus } from '../../infrastructure/db/models/GoalModel.js';
import { GoalPeriod } from '../../shared/constants.js';
import { auditService } from './auditService.js';
import { notificationService } from './notificationService.js';

const goalRepository = new GoalRepository();
const userRepository = new UserRepository();

const toRoundedNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const calculateGoalProgressPercent = (goal = {}) => {
  const targetPoints = Math.max(1, toRoundedNumber(goal.targetPoints, 0));
  const currentPoints = Math.max(0, toRoundedNumber(goal.currentPoints, 0));
  return Math.min(999, Math.round((currentPoints / targetPoints) * 100));
};

export const resolveGoalPeriod = ({ startDate, endDate } = {}) => {
  const start = dayjs(startDate).startOf('day');
  const end = dayjs(endDate).endOf('day');
  const diffDays = end.diff(start, 'day') + 1;

  if (diffDays <= 1) {
    return GoalPeriod.DAILY;
  }

  if (diffDays <= 7) {
    return GoalPeriod.WEEKLY;
  }

  const sameMonth = start.month() === end.month() && start.year() === end.year();
  if (sameMonth && start.date() === 1 && end.date() === end.daysInMonth()) {
    return GoalPeriod.MONTHLY;
  }

  return GoalPeriod.CUSTOM;
};

export const buildGoalSnapshot = (goal = {}, user = null) => ({
  id: String(goal._id || goal.id || ''),
  title: goal.title || '',
  description: goal.description || '',
  targetPoints: toRoundedNumber(goal.targetPoints, 0),
  currentPoints: toRoundedNumber(goal.currentPoints, 0),
  progressPercent: calculateGoalProgressPercent(goal),
  startLevel: toRoundedNumber(goal.startLevel, 1),
  targetLevel: toRoundedNumber(goal.targetLevel, 1),
  status: goal.status || GoalStatus.ACTIVE,
  achieved: !!goal.achieved,
  achievedAt: goal.achievedAt || null,
  promotedAt: goal.promotedAt || null,
  startDate: goal.startDate || null,
  endDate: goal.endDate || null,
  user: user ? {
    id: String(user._id || user.id || ''),
    fullName: user.fullName || '',
    level: toRoundedNumber(user.level, 1),
    pointsTotal: toRoundedNumber(user.pointsTotal, 0),
  } : null,
});

const notifyGoalHalfway = async (userId, goal) => {
  await notificationService.notifyGoalProgress(userId, goal, 50);
};

const notifyGoalCompleted = async (userId, goal) => {
  await notificationService.notifyGoalAchieved(userId, goal);
};

const notifyLevelPromotion = async (userId, { goal, previousLevel, nextLevel }) => {
  await notificationService.notifyLevelPromoted(userId, {
    goal,
    previousLevel,
    nextLevel,
  });
};

export const goalProgressService = {
  async applyAwardedPoints({
    userId,
    pointsDelta,
    actorId = '',
    sourceAction = '',
    sourceMetadata = null,
    req = null,
    currentUser = null,
  } = {}) {
    const grantedPoints = Math.round(toRoundedNumber(pointsDelta, 0));
    if (grantedPoints <= 0) {
      return {
        updatedGoals: [],
        promotedUser: currentUser || null,
      };
    }

    const now = new Date();
    await goalRepository.expireElapsedGoals(now);

    const goals = await goalRepository.listTrackableGoalsForUser(userId, now);
    if (!goals.length) {
      return {
        updatedGoals: [],
        promotedUser: currentUser || null,
      };
    }

    let workingUser = currentUser || await userRepository.findById(userId);
    const updates = [];

    for (const goal of goals) {
      const beforeProgress = calculateGoalProgressPercent(goal);
      const beforeSnapshot = buildGoalSnapshot(goal, workingUser);

      goal.currentPoints = Math.max(0, toRoundedNumber(goal.currentPoints, 0) + grantedPoints);
      const afterProgress = calculateGoalProgressPercent(goal);

      const crossedHalfway = beforeProgress < 50 && afterProgress >= 50 && !goal.progress50NotifiedAt;
      if (crossedHalfway) {
        goal.progress50NotifiedAt = now;
      }

      let promoted = false;
      let previousLevel = toRoundedNumber(workingUser?.level, goal.startLevel || 1);

      if (!goal.achieved && goal.currentPoints >= goal.targetPoints) {
        goal.achieved = true;
        goal.status = GoalStatus.ACHIEVED;
        goal.achievedAt = now;
        if (!goal.completedNotifiedAt) {
          goal.completedNotifiedAt = now;
        }

        if (workingUser && toRoundedNumber(goal.targetLevel, 0) > toRoundedNumber(workingUser.level, 1)) {
          previousLevel = toRoundedNumber(workingUser.level, 1);
          workingUser = await userRepository.updateById(workingUser._id, {
            level: goal.targetLevel,
          });
          goal.promotedAt = goal.promotedAt || now;
          goal.promotionNotifiedAt = goal.promotionNotifiedAt || now;
          promoted = true;
        }
      }

      await goal.save();
      if (goal.user?.populate) {
        await goal.populate('user', 'fullName role level pointsTotal employeeCode avatarUrl active');
      }

      const afterSnapshot = buildGoalSnapshot(goal, workingUser);

      if (crossedHalfway) {
        await notifyGoalHalfway(userId, goal);
      }

      if (goal.achieved && !beforeSnapshot.achieved) {
        await notifyGoalCompleted(userId, goal);
        await auditService.log({
          actorId: actorId || userId,
          action: 'GOAL_ACHIEVED',
          entityType: 'GOAL',
          entityId: goal._id,
          before: {
            ...beforeSnapshot,
            sourceAction,
            sourceMetadata,
          },
          after: {
            ...afterSnapshot,
            sourceAction,
            sourceMetadata,
          },
          req,
        });
      }

      if (promoted) {
        await notifyLevelPromotion(userId, {
          goal,
          previousLevel,
          nextLevel: toRoundedNumber(goal.targetLevel, previousLevel),
        });

        await auditService.log({
          actorId: actorId || userId,
          action: 'USER_LEVEL_PROMOTED',
          entityType: 'USER',
          entityId: userId,
          before: {
            level: previousLevel,
            goalId: String(goal._id),
            goalTitle: goal.title,
          },
          after: {
            level: toRoundedNumber(goal.targetLevel, previousLevel),
            goalId: String(goal._id),
            goalTitle: goal.title,
          },
          req,
        });
      }

      updates.push({
        goal,
        crossedHalfway,
        achieved: goal.achieved && !beforeSnapshot.achieved,
        promoted,
        progressPercent: afterProgress,
      });
    }

    return {
      updatedGoals: updates,
      promotedUser: workingUser || null,
    };
  },
};
