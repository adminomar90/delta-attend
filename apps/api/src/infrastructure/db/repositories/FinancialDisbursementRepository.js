import { FinancialDisbursementModel } from '../models/FinancialDisbursementModel.js';

const populatePipeline = [
  { path: 'employee', select: 'fullName role level pointsTotal employeeCode avatarUrl manager active' },
  { path: 'projectManagerReviewer', select: 'fullName role employeeCode avatarUrl active' },
  { path: 'financialManagerReviewer', select: 'fullName role employeeCode avatarUrl active' },
  { path: 'generalManagerReviewer', select: 'fullName role employeeCode avatarUrl active' },
  { path: 'approvedAmountSetBy', select: 'fullName role employeeCode' },
  { path: 'workflowTrail.actor', select: 'fullName role employeeCode' },
  { path: 'pointsEvents.ledger', select: 'points category reason sourceAction createdAt' },
  { path: 'pointsEvents.appliedBy', select: 'fullName role employeeCode' },
  { path: 'attachments.uploadedBy', select: 'fullName role employeeCode' },
];

export class FinancialDisbursementRepository {
  async create(payload) {
    return FinancialDisbursementModel.create(payload);
  }

  async findById(id) {
    return FinancialDisbursementModel.findById(id).populate(populatePipeline);
  }

  async list(filter = {}, { limit = 500 } = {}) {
    return FinancialDisbursementModel.find(filter)
      .populate(populatePipeline)
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async updateById(id, payload) {
    return FinancialDisbursementModel.findByIdAndUpdate(id, payload, { new: true })
      .populate(populatePipeline);
  }

  async addWorkflowEntry(id, entry = {}, extraSet = {}) {
    return FinancialDisbursementModel.findByIdAndUpdate(
      id,
      {
        ...extraSet,
        $push: {
          workflowTrail: entry,
        },
      },
      { new: true },
    ).populate(populatePipeline);
  }

  async addPointsEvent(id, payload = {}) {
    return FinancialDisbursementModel.findByIdAndUpdate(
      id,
      {
        $push: {
          pointsEvents: payload,
        },
      },
      { new: true },
    ).populate(populatePipeline);
  }
}
