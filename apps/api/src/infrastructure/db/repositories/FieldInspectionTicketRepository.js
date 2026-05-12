import { FieldInspectionTicketModel } from '../models/FieldInspectionTicketModel.js';

const applyPopulate = (query) =>
  query
    .populate('customer', 'name customerType phone whatsapp email province address mapUrl status sites')
    .populate('createdBy', 'fullName role jobTitle')
    .populate('closedBy', 'fullName role jobTitle')
    .populate('technicians.user', 'fullName role jobTitle phone email avatarUrl')
    .populate('linkedDailyWorkPlan', 'title status planDate progressPercent isApproved approvedAt');

export class FieldInspectionTicketRepository {
  async create(payload) {
    const ticket = await FieldInspectionTicketModel.create(payload);
    return this.findById(ticket._id);
  }

  async findById(id) {
    return applyPopulate(FieldInspectionTicketModel.findById(id));
  }

  async list(filter = {}, options = {}) {
    const query = applyPopulate(
      FieldInspectionTicketModel.find(filter).sort(options.sort || { createdAt: -1 }),
    );
    if (options.limit) query.limit(options.limit);
    return query;
  }

  async updateById(id, payload) {
    return applyPopulate(FieldInspectionTicketModel.findByIdAndUpdate(id, payload, { new: true }));
  }

  async deleteById(id) {
    return FieldInspectionTicketModel.findByIdAndDelete(id);
  }
}
