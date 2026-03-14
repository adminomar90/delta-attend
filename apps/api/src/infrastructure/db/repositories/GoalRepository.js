import { GoalModel, GoalStatus } from '../models/GoalModel.js';
import { UserRepository } from './UserRepository.js';
import { auditService } from '../../../application/services/auditService.js';
import { notificationService } from '../../../application/services/notificationService.js';

const basePopulate = [
  { path: 'user', select: 'fullName role level pointsTotal employeeCode avatarUrl active' },
  { path: 'createdBy', select: 'fullName role employeeCode' },
  { path: 'updatedBy', select: 'fullName role employeeCode' },
];

const userRepository = new UserRepository();

const toRoundedNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const calculateProgressPercent = (goal = {}) => {
  const targetPoints = Math.max(1, toRoundedNumber(goal.targetPoints, 0));
  const currentPoints = Math.max(0, toRoundedNumber(goal.currentPoints, 0));
  return Math.min(999, Math.round((currentPoints / targetPoints) * 100));
};

export class GoalRepository {
  async create(payload) {
    return GoalModel.create(payload);
  }

  async findById(id) {
    return GoalModel.findById(id).populate(basePopulate);
  }

  async list(filter = {}, { includeDeleted = false } = {}) {
    const finalFilter = { ...filter };
    if (!includeDeleted) {
      finalFilter.deletedAt = null;
    }

    return GoalModel.find(finalFilter)
      .populate(basePopulate)
      .sort({ endDate: 1, createdAt: -1 });
  }

  async findOverlappingGoal({ userId, startDate, endDate, excludeGoalId = '' } = {}) {
    const filter = {
      user: userId,
      deletedAt: null,
      status: GoalStatus.ACTIVE,
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    };

    if (excludeGoalId) {
      filter._id = { $ne: excludeGoalId };
    }

    return GoalModel.findOne(filter).populate(basePopulate);
  }

  async listTrackableGoalsForUser(userId, at = new Date()) {
    return GoalModel.find({
      user: userId,
      deletedAt: null,
      status: GoalStatus.ACTIVE,
      achieved: false,
      startDate: { $lte: at },
      endDate: { $gte: at },
    })
      .populate(basePopulate)
      .sort({ startDate: 1, createdAt: 1 });
  }

  async expireElapsedGoals(at = new Date()) {
    return GoalModel.updateMany(
      {
        deletedAt: null,
        status: GoalStatus.ACTIVE,
        achieved: false,
        endDate: { $lt: at },
      },
      {
        $set: {
          status: GoalStatus.EXPIRED,
        },
      },
    );
  }

  async updateById(id, payload) {
    return GoalModel.findByIdAndUpdate(id, payload, { new: true }).populate(basePopulate);
  }

  async softDeleteById(id, { deletedBy = null } = {}) {
    return GoalModel.findByIdAndUpdate(
      id,
      {
        deletedAt: new Date(),
        deletedBy,
        updatedBy: deletedBy || null,
        status: GoalStatus.CANCELLED,
      },
      { new: true },
    ).populate(basePopulate);
  }

  async incrementActiveGoals(userId, pointsDelta, { actorId = '', req = null, notifyOnAchievement = false } = {}) {
    const grantedPoints = Math.round(toRoundedNumber(pointsDelta, 0));
    if (grantedPoints <= 0) {
      return [];
    }

    const now = new Date();
    await this.expireElapsedGoals(now);

    const goals = await this.listTrackableGoalsForUser(userId, now);
    if (!goals.length) {
      return [];
    }

    let workingUser = await userRepository.findById(userId);
    const updatedGoals = [];

    for (const goal of goals) {
      const beforeProgress = calculateProgressPercent(goal);
      goal.currentPoints = Math.max(0, toRoundedNumber(goal.currentPoints, 0) + grantedPoints);
      const afterProgress = calculateProgressPercent(goal);

      if (beforeProgress < 50 && afterProgress >= 50 && !goal.progress50NotifiedAt) {
        goal.progress50NotifiedAt = now;
        await notificationService.notifyGoalProgress(userId, goal, 50);
      }

      if (!goal.achieved && goal.currentPoints >= goal.targetPoints) {
        goal.achieved = true;
        goal.status = GoalStatus.ACHIEVED;
        goal.achievedAt = now;
        goal.completedNotifiedAt = goal.completedNotifiedAt || now;

        await auditService.log({
          actorId: actorId || userId,
          action: 'GOAL_ACHIEVED',
          entityType: 'GOAL',
          entityId: goal._id,
          before: {
            title: goal.title,
            targetPoints: goal.targetPoints,
            currentPoints: goal.currentPoints - grantedPoints,
            progressPercent: beforeProgress,
          },
          after: {
            title: goal.title,
            targetPoints: goal.targetPoints,
            currentPoints: goal.currentPoints,
            progressPercent: afterProgress,
          },
          req,
        });

        if (workingUser && toRoundedNumber(goal.targetLevel, 1) > toRoundedNumber(workingUser.level, 1)) {
          const previousLevel = toRoundedNumber(workingUser.level, 1);
          workingUser = await userRepository.updateById(workingUser._id, {
            level: goal.targetLevel,
          });
          goal.promotedAt = goal.promotedAt || now;
          goal.promotionNotifiedAt = goal.promotionNotifiedAt || now;

          await notificationService.notifyLevelPromoted(userId, {
            goal,
            previousLevel,
            nextLevel: goal.targetLevel,
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
              level: goal.targetLevel,
              goalId: String(goal._id),
              goalTitle: goal.title,
            },
            req,
          });
        }

        if (notifyOnAchievement) {
          await notificationService.notifyGoalAchieved(userId, goal);
        }
      }

      await goal.save();
      updatedGoals.push(goal);
    }

    return updatedGoals;
  }
}
