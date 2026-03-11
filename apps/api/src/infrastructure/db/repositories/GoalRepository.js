import { GoalModel } from '../models/GoalModel.js';

export class GoalRepository {
  async create(payload) {
    return GoalModel.create(payload);
  }

  async list(filter = {}) {
    return GoalModel.find(filter)
      .populate('user', 'fullName role level pointsTotal')
      .sort({ endDate: 1 });
  }

  async updateForUserByPeriod(userId, period, payload) {
    return GoalModel.findOneAndUpdate(
      {
        user: userId,
        period,
        achieved: false,
      },
      payload,
      {
        new: true,
      },
    );
  }

  async incrementActiveGoals(userId, pointsDelta) {
    const now = new Date();
    const goals = await GoalModel.find({
      user: userId,
      achieved: false,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    const updates = [];
    for (const goal of goals) {
      goal.currentPoints += pointsDelta;
      if (goal.currentPoints >= goal.targetPoints) {
        goal.achieved = true;
      }
      updates.push(goal.save());
    }

    return Promise.all(updates);
  }
}
