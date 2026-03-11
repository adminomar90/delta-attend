import { AuditLogModel } from '../models/AuditLogModel.js';

export class AuditRepository {
  async create(payload) {
    return AuditLogModel.create(payload);
  }

  async list(limit = 100) {
    return AuditLogModel.find()
      .populate('actor', 'fullName role')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async findById(id) {
    return AuditLogModel.findById(id)
      .populate('actor', 'fullName role employeeCode');
  }

  async listByActions({
    actions = [],
    actorId = '',
    from = null,
    to = null,
    limit = 200,
  } = {}) {
    const filter = {};

    if (Array.isArray(actions) && actions.length) {
      filter.action = { $in: actions };
    }

    if (actorId) {
      filter.actor = actorId;
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }

    return AuditLogModel.find(filter)
      .populate('actor', 'fullName role employeeCode')
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(1000, Number(limit || 200))));
  }
}
