import { CustomerModel } from '../models/CustomerModel.js';

const applyPopulate = (query) =>
  query
    .populate('createdBy', 'fullName role jobTitle')
    .populate('lastModifiedBy', 'fullName role jobTitle')
    .populate('archivedBy', 'fullName role jobTitle')
    .populate('linkedProjects', 'name code status')
    .populate('linkedDailyWorkPlans', 'title planDate status')
    .populate('linkedFieldInspections', 'ticketNo status appointmentAt serviceType closedAt linkedDailyWorkPlan');

export class CustomerRepository {
  async create(payload) {
    const customer = await CustomerModel.create(payload);
    return this.findById(customer._id);
  }

  async findById(id) {
    return applyPopulate(CustomerModel.findById(id));
  }

  async findByNormalizedPhone(normalizedPhone, excludeId = '') {
    if (!normalizedPhone) return null;
    const filter = { normalizedPhone };
    if (excludeId) filter._id = { $ne: excludeId };
    return CustomerModel.findOne(filter);
  }

  async findByContactNumbers(numbers = [], excludeId = '') {
    const normalized = [...new Set(numbers.filter(Boolean))];
    if (!normalized.length) return [];
    const filter = {
      $or: [
        { normalizedPhone: { $in: normalized } },
        { normalizedWhatsapp: { $in: normalized } },
      ],
    };
    if (excludeId) filter._id = { $ne: excludeId };
    return CustomerModel.find(filter).limit(10);
  }

  async list(filter = {}, options = {}) {
    const query = applyPopulate(CustomerModel.find(filter).sort(options.sort || { lastModifiedAt: -1, createdAt: -1 }));
    if (options.limit) query.limit(options.limit);
    return query;
  }

  async updateById(id, payload) {
    return applyPopulate(CustomerModel.findByIdAndUpdate(id, payload, { new: true }));
  }

  async archiveById(id, userId, actorName = '') {
    return this.updateById(id, {
      archived: true,
      archivedAt: new Date(),
      archivedBy: userId,
      lastModifiedBy: userId,
      lastModifiedByName: actorName,
      lastModifiedAt: new Date(),
    });
  }

  async unarchiveById(id, userId, actorName = '') {
    return this.updateById(id, {
      archived: false,
      archivedAt: null,
      archivedBy: null,
      lastModifiedBy: userId,
      lastModifiedByName: actorName,
      lastModifiedAt: new Date(),
    });
  }
}
