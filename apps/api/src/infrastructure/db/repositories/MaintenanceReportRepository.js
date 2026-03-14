import { MaintenanceReportModel } from '../models/MaintenanceReportModel.js';

const basePopulate = [
  { path: 'createdBy', select: 'fullName role employeeCode department jobTitle avatarUrl' },
  { path: 'assignedEmployee', select: 'fullName role employeeCode department jobTitle avatarUrl active manager' },
  { path: 'acceptedBy', select: 'fullName role employeeCode' },
  { path: 'managerReviewer', select: 'fullName role employeeCode department jobTitle avatarUrl active manager' },
  { path: 'managerReview.reviewedBy', select: 'fullName role employeeCode' },
  { path: 'pointsLedger', select: 'points category reason sourceAction metadata createdAt approvedBy' },
  { path: 'workflowTrail.actor', select: 'fullName role employeeCode' },
];

export class MaintenanceReportRepository {
  async create(payload) {
    return MaintenanceReportModel.create(payload);
  }

  async findById(id) {
    return MaintenanceReportModel.findById(id).populate(basePopulate);
  }

  async findByFeedbackTokenHash(tokenHash) {
    return MaintenanceReportModel.findOne({
      'customerFeedback.tokenHash': tokenHash,
    }).populate(basePopulate);
  }

  async list(filter = {}, options = {}) {
    const query = MaintenanceReportModel.find(filter)
      .populate(basePopulate)
      .sort(options.sort || { createdAt: -1 });

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }

  async updateById(id, payload) {
    return MaintenanceReportModel.findByIdAndUpdate(id, payload, { new: true })
      .populate(basePopulate);
  }
}
