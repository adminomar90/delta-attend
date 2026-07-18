import { ProjectModel } from '../models/ProjectModel.js';

export class ProjectRepository {
  async create(payload) {
    return ProjectModel.create(payload);
  }

  async list(filter = {}) {
    const resolvedFilter = Object.prototype.hasOwnProperty.call(filter, 'archived')
      ? filter
      : { ...filter, archived: { $ne: true } };
    return ProjectModel.find(resolvedFilter)
      .populate('customer', 'name phone whatsapp province address status archived')
      .populate('owner', 'fullName role phone email')
      .populate('projectManager', 'fullName role phone email')
      .populate('teamMembers', 'fullName role level department jobTitle')
      .populate('approvalTrail.approver', 'fullName role')
      .populate('rejectedBy', 'fullName role')
      .sort({ createdAt: -1 });
  }

  async findById(id) {
    return ProjectModel.findById(id)
      .populate('customer', 'name phone whatsapp province address status archived')
      .populate('owner', 'fullName role phone email')
      .populate('projectManager', 'fullName role phone email')
      .populate('teamMembers', 'fullName role level department jobTitle')
      .populate('approvalTrail.approver', 'fullName role')
      .populate('rejectedBy', 'fullName role');
  }

  async updateById(id, payload) {
    return ProjectModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('customer', 'name phone whatsapp province address status archived')
      .populate('owner', 'fullName role phone email')
      .populate('projectManager', 'fullName role phone email')
      .populate('teamMembers', 'fullName role level department jobTitle')
      .populate('approvalTrail.approver', 'fullName role')
      .populate('rejectedBy', 'fullName role');
  }

  async findDuplicate({ name, code, excludeId = null }) {
    const escapedName = String(name || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return ProjectModel.findOne({
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      $or: [
        { code: String(code || '').trim().toUpperCase() },
        { name: { $regex: `^${escapedName}$`, $options: 'i' } },
      ],
    });
  }
}
