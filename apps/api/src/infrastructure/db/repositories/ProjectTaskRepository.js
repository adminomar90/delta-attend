import { ProjectTaskModel } from '../models/ProjectTaskModel.js';

const populateTask = (query) =>
  query
    .populate('project', 'name code status archived')
    .populate('stage', 'name order status progressPercent archived')
    .populate('assignees', 'fullName role jobTitle department')
    .populate('teamLeader', 'fullName role jobTitle department')
    .populate('approvedBy', 'fullName role');

export class ProjectTaskRepository {
  async create(payload) {
    const task = await ProjectTaskModel.create(payload);
    return this.findById(task._id);
  }

  async findById(id) {
    return populateTask(ProjectTaskModel.findById(id));
  }

  async list(filter = {}, options = {}) {
    const query = populateTask(
      ProjectTaskModel.find({
        archived: { $ne: true },
        ...filter,
      }).sort(options.sort || { createdAt: -1 }),
    );
    if (options.limit) query.limit(options.limit);
    return query;
  }

  async updateById(id, payload) {
    return populateTask(ProjectTaskModel.findByIdAndUpdate(id, payload, { new: true }));
  }

  async archiveById(id, userId) {
    return populateTask(
      ProjectTaskModel.findByIdAndUpdate(
        id,
        { archived: true, archivedAt: new Date(), archivedBy: userId },
        { new: true },
      ),
    );
  }
}
