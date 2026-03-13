import { WorkReportModel } from '../models/WorkReportModel.js';

export class WorkReportRepository {
  async create(payload) {
    return WorkReportModel.create(payload);
  }

  async findById(id) {
    return WorkReportModel.findById(id)
      .populate('user', 'fullName employeeCode role email department jobTitle pointsTotal level')
      .populate('project', 'name code status')
      .populate('approvedBy', 'fullName role');
  }

  async list(filter = {}, options = {}) {
    const query = WorkReportModel.find(filter)
      .populate('user', 'fullName employeeCode role email department jobTitle pointsTotal level')
      .populate('project', 'name code status')
      .populate('approvedBy', 'fullName role')
      .sort(options.sort || { createdAt: -1 });

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }

  async updateById(id, payload) {
    return WorkReportModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('user', 'fullName employeeCode role email department jobTitle pointsTotal level')
      .populate('project', 'name code status')
      .populate('approvedBy', 'fullName role');
  }

  async deleteById(id) {
    return WorkReportModel.findByIdAndDelete(id);
  }
}
