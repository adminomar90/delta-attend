import { MaintenancePlanModel } from '../models/MaintenancePlanModel.js';

const basePopulate = [
  { path: 'project', select: 'name code status owner' },
  { path: 'workReport', select: 'employeeName projectName progressPercent status approvedAt workDate approvedBy user createdAt updatedAt' },
  { path: 'assignedEmployee', select: 'fullName role employeeCode department jobTitle phone active' },
  { path: 'createdBy', select: 'fullName role employeeCode department jobTitle' },
  { path: 'updatedBy', select: 'fullName role employeeCode department jobTitle' },
  { path: 'scheduledVisits.visitReport', select: 'visitDate status technician technicianName completionRate createdAt' },
];

export class MaintenancePlanRepository {
  async create(payload) {
    return MaintenancePlanModel.create(payload);
  }

  async findById(id) {
    return MaintenancePlanModel.findById(id).populate(basePopulate);
  }

  async findOne(filter = {}, options = {}) {
    const query = MaintenancePlanModel.findOne(filter).populate(basePopulate);
    if (options.sort) {
      query.sort(options.sort);
    }
    return query;
  }

  async list(filter = {}, options = {}) {
    const query = MaintenancePlanModel.find(filter)
      .populate(basePopulate)
      .sort(options.sort || { updatedAt: -1, createdAt: -1 });

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }

  async count(filter = {}) {
    return MaintenancePlanModel.countDocuments(filter);
  }

  async updateById(id, payload) {
    return MaintenancePlanModel.findByIdAndUpdate(id, payload, { new: true }).populate(basePopulate);
  }
}
