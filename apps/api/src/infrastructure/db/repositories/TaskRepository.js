import { TaskModel } from '../models/TaskModel.js';

export class TaskRepository {
  async create(payload) {
    return TaskModel.create(payload);
  }

  async findById(id) {
    return TaskModel.findById(id)
      .populate('assignee', 'fullName role pointsTotal level department jobTitle email phone')
      .populate('assignedBy', 'fullName role department')
      .populate('project', 'name code status budget')
      .populate('approvedBy', 'fullName role')
      .populate('approvalTrail.approver', 'fullName role');
  }

  async list(filter = {}, options = {}) {
    const query = TaskModel.find(filter)
      .populate('assignee', 'fullName role pointsTotal level department jobTitle email phone')
      .populate('assignedBy', 'fullName role department')
      .populate('project', 'name code status budget')
      .populate('approvedBy', 'fullName role')
      .populate('approvalTrail.approver', 'fullName role')
      .sort(options.sort || { createdAt: -1 });

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }

  async updateById(id, payload) {
    return TaskModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('assignee', 'fullName role pointsTotal level department jobTitle email phone')
      .populate('assignedBy', 'fullName role department')
      .populate('project', 'name code status budget')
      .populate('approvedBy', 'fullName role')
      .populate('approvalTrail.approver', 'fullName role');
  }

  async countByStatus(filter = {}) {
    return TaskModel.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
  }
}
