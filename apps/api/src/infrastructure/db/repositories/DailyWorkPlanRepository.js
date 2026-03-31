import { DailyWorkPlanModel } from '../models/DailyWorkPlanModel.js';
import { DailyWorkPlanStatus } from '../../../application/services/dailyWorkPlanService.js';

const applyPopulate = (query) =>
  query
    .populate('project', 'name code status')
    .populate('createdBy', 'fullName role jobTitle')
    .populate('supervisor', 'fullName role jobTitle')
    .populate('teamLeader', 'fullName role jobTitle department email phone avatarUrl pointsTotal level')
    .populate('approvedBy', 'fullName role jobTitle')
    .populate('archivedBy', 'fullName role jobTitle employeeCode phone')
    .populate('assignees.user', 'fullName role jobTitle department email phone avatarUrl pointsTotal level');

export class DailyWorkPlanRepository {
  async create(payload) {
    const plan = await DailyWorkPlanModel.create(payload);
    return this.findById(plan._id);
  }

  async findById(id) {
    return applyPopulate(DailyWorkPlanModel.findById(id));
  }

  async list(filter = {}, options = {}) {
    const query = applyPopulate(
      DailyWorkPlanModel.find(filter).sort(options.sort || { planDate: -1, createdAt: -1 }),
    );

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }

  async updateById(id, payload) {
    return applyPopulate(
      DailyWorkPlanModel.findByIdAndUpdate(id, payload, {
        new: true,
      }),
    );
  }

  async deleteById(id) {
    return DailyWorkPlanModel.findByIdAndDelete(id);
  }

  async archiveById(id, userId, timelineEntry = null, extraSet = {}) {
    return applyPopulate(
      DailyWorkPlanModel.findByIdAndUpdate(
        id,
        {
          $set: {
            ...extraSet,
            archived: true,
            archivedAt: new Date(),
            archivedBy: userId,
          },
          ...(timelineEntry ? { $push: { timeline: timelineEntry } } : {}),
        },
        { new: true },
      ),
    );
  }

  async unarchiveById(id, timelineEntry = null, extraSet = {}) {
    return applyPopulate(
      DailyWorkPlanModel.findByIdAndUpdate(
        id,
        {
          $set: {
            ...extraSet,
            archived: false,
            archivedAt: null,
            archivedBy: null,
          },
          ...(timelineEntry ? { $push: { timeline: timelineEntry } } : {}),
        },
        { new: true },
      ),
    );
  }

  async listOverdueCandidates(now = new Date(), limit = 500) {
    return this.list(
      {
        archived: { $ne: true },
        dueAt: { $lt: now },
        status: {
          $in: [
            DailyWorkPlanStatus.NEW,
            DailyWorkPlanStatus.IN_PROGRESS,
            DailyWorkPlanStatus.STOPPED,
            DailyWorkPlanStatus.OVERDUE,
          ],
        },
      },
      {
        limit,
        sort: { dueAt: 1, createdAt: 1 },
      },
    );
  }
}
