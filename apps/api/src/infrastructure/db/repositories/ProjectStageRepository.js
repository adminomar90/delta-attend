import { ProjectStageModel } from '../models/ProjectStageModel.js';
import { ProjectTaskModel } from '../models/ProjectTaskModel.js';

const populateStage = (query) =>
  query
    .populate('project', 'name code status archived')
    .populate('manager', 'fullName role jobTitle department')
    .populate('participants', 'fullName role jobTitle department');

export class ProjectStageRepository {
  async create(payload) {
    const stage = await ProjectStageModel.create(payload);
    return this.findById(stage._id);
  }

  async findById(id) {
    return populateStage(ProjectStageModel.findById(id));
  }

  async listByProject(projectId, filter = {}) {
    return populateStage(
      ProjectStageModel.find({
        project: projectId,
        archived: { $ne: true },
        ...filter,
      }).sort({ order: 1, createdAt: 1 }),
    );
  }

  async getNextOrder(projectId) {
    const stage = await ProjectStageModel.findOne({ project: projectId, archived: { $ne: true } })
      .sort({ order: -1 })
      .select('order');
    return Number(stage?.order || 0) + 1;
  }

  async updateById(id, payload) {
    return populateStage(ProjectStageModel.findByIdAndUpdate(id, payload, { new: true }));
  }

  async archiveById(id, userId) {
    return populateStage(
      ProjectStageModel.findByIdAndUpdate(
        id,
        { archived: true, archivedAt: new Date(), archivedBy: userId },
        { new: true },
      ),
    );
  }

  async countLinkedTasks(stageId) {
    return ProjectTaskModel.countDocuments({ stage: stageId, archived: { $ne: true } });
  }
}
