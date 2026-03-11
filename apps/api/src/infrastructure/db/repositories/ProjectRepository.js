import { ProjectModel } from '../models/ProjectModel.js';

export class ProjectRepository {
  async create(payload) {
    return ProjectModel.create(payload);
  }

  async list(filter = {}) {
    return ProjectModel.find(filter)
      .populate('owner', 'fullName role phone email')
      .populate('teamMembers', 'fullName role level department jobTitle')
      .populate('approvalTrail.approver', 'fullName role')
      .populate('rejectedBy', 'fullName role')
      .sort({ createdAt: -1 });
  }

  async findById(id) {
    return ProjectModel.findById(id)
      .populate('owner', 'fullName role phone email')
      .populate('teamMembers', 'fullName role level department jobTitle')
      .populate('approvalTrail.approver', 'fullName role')
      .populate('rejectedBy', 'fullName role');
  }

  async updateById(id, payload) {
    return ProjectModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('owner', 'fullName role phone email')
      .populate('teamMembers', 'fullName role level department jobTitle')
      .populate('approvalTrail.approver', 'fullName role')
      .populate('rejectedBy', 'fullName role');
  }
}
