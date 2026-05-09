import { CustomerFormRequestModel } from '../models/CustomerFormRequestModel.js';

const applyPopulate = (query) =>
  query
    .populate('sentBy', 'fullName role jobTitle')
    .populate('reviewedBy', 'fullName role jobTitle')
    .populate('savedCustomer', 'name phone whatsapp province status')
    .populate('duplicateCustomers', 'name phone whatsapp province status');

export class CustomerFormRequestRepository {
  async create(payload) {
    const request = await CustomerFormRequestModel.create(payload);
    return this.findById(request._id);
  }

  async findById(id) {
    return applyPopulate(CustomerFormRequestModel.findById(id));
  }

  async findByToken(token) {
    return applyPopulate(CustomerFormRequestModel.findOne({ token }));
  }

  async list(filter = {}, options = {}) {
    const query = applyPopulate(
      CustomerFormRequestModel.find(filter).sort(options.sort || { submittedAt: -1, sentAt: -1, createdAt: -1 }),
    );
    if (options.limit) query.limit(options.limit);
    return query;
  }

  async updateById(id, payload) {
    return applyPopulate(CustomerFormRequestModel.findByIdAndUpdate(id, payload, { new: true }));
  }

  async updateByToken(token, payload) {
    return applyPopulate(CustomerFormRequestModel.findOneAndUpdate({ token }, payload, { new: true }));
  }
}
