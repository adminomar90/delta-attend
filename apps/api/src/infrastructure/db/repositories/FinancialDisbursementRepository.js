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
  { path: 'archivedBy', select: 'fullName role employeeCode' },
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

  async deleteById(id) {
    return FinancialDisbursementModel.findByIdAndDelete(id);
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

  async archiveById(id, userId) {
    return FinancialDisbursementModel.findByIdAndUpdate(
      id,
      {
        $set: {
          archived: true,
          archivedAt: new Date(),
          archivedBy: userId,
        },
        $push: {
          workflowTrail: {
            action: 'ARCHIVE',
            actor: userId,
            notes: '',
            occurredAt: new Date(),
          },
        },
      },
      { new: true },
    ).populate(populatePipeline);
  }

  async unarchiveById(id, userId) {
    return FinancialDisbursementModel.findByIdAndUpdate(
      id,
      {
        $set: {
          archived: false,
          archivedAt: null,
          archivedBy: null,
        },
        $push: {
          workflowTrail: {
            action: 'UNARCHIVE',
            actor: userId,
            notes: '',
            occurredAt: new Date(),
          },
        },
      },
      { new: true },
    ).populate(populatePipeline);
  }

  async aggregateReports(filter = {}) {
    return FinancialDisbursementModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalApprovedAmount: {
            $sum: { $ifNull: ['$approvedAmount', '$amount'] },
          },
          avgAmount: { $avg: '$amount' },
          byType: {
            $push: { type: '$requestType', amount: '$amount', status: '$status' },
          },
        },
      },
    ]);
  }

  async aggregateByField(filter = {}, field = 'requestType') {
    return FinancialDisbursementModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: `$${field}`,
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalApprovedAmount: {
            $sum: { $ifNull: ['$approvedAmount', '$amount'] },
          },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);
  }

  async aggregateByMonth(filter = {}) {
    return FinancialDisbursementModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ]);
  }

  async aggregateByEmployee(filter = {}) {
    return FinancialDisbursementModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$employee',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 50 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'employeeInfo',
        },
      },
      { $unwind: { path: '$employeeInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          count: 1,
          totalAmount: 1,
          fullName: '$employeeInfo.fullName',
          employeeCode: '$employeeInfo.employeeCode',
          role: '$employeeInfo.role',
        },
      },
    ]);
  }
}
