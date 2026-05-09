import { CustomerEvaluationModel } from '../models/CustomerEvaluationModel.js';

const applyPopulate = (query) =>
  query
    .populate('sentBy', 'fullName role jobTitle')
    .populate('reactivatedBy', 'fullName role jobTitle');

export class CustomerEvaluationRepository {
  async create(payload) {
    const evaluation = await CustomerEvaluationModel.create(payload);
    return this.findById(evaluation._id);
  }

  async findById(id) {
    return applyPopulate(CustomerEvaluationModel.findById(id));
  }

  async findByToken(token) {
    return applyPopulate(CustomerEvaluationModel.findOne({ token }));
  }

  async findLatestBySource(sourceType, sourceId) {
    return applyPopulate(CustomerEvaluationModel.findOne({
      'source.sourceType': sourceType,
      'source.sourceId': sourceId,
    }).sort({ createdAt: -1 }));
  }

  async list(filter = {}, options = {}) {
    const query = applyPopulate(CustomerEvaluationModel.find(filter).sort(options.sort || { sentAt: -1, createdAt: -1 }));
    if (options.limit) query.limit(options.limit);
    return query;
  }

  async updateById(id, payload) {
    return applyPopulate(CustomerEvaluationModel.findByIdAndUpdate(id, payload, { new: true }));
  }

  async updateByToken(token, payload) {
    return applyPopulate(CustomerEvaluationModel.findOneAndUpdate({ token }, payload, { new: true }));
  }
}
