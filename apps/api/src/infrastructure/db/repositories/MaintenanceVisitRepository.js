import { MaintenanceVisitModel } from '../models/MaintenanceVisitModel.js';

const basePopulate = [
  { path: 'maintenancePlan', select: 'customerName projectName projectNumber location phone executorName maintenanceType status assignedEmployee createdBy nextVisitDate lastVisitDate' },
  { path: 'technician', select: 'fullName role employeeCode department jobTitle phone active' },
  { path: 'createdBy', select: 'fullName role employeeCode department jobTitle' },
];

export class MaintenanceVisitRepository {
  async create(payload) {
    return MaintenanceVisitModel.create(payload);
  }

  async findById(id) {
    return MaintenanceVisitModel.findById(id).populate(basePopulate);
  }

  async list(filter = {}, options = {}) {
    const query = MaintenanceVisitModel.find(filter)
      .populate(basePopulate)
      .sort(options.sort || { visitDate: -1, createdAt: -1 });

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }
}
