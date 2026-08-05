import mongoose from 'mongoose';

export const ProjectTaskStatus = {
  NEW: 'NEW',
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  PAUSED: 'PAUSED',
  WAITING_MATERIALS: 'WAITING_MATERIALS',
  DELAYED: 'DELAYED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const ProjectTaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
};

const projectTaskSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    stage: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectStage', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    priority: {
      type: String,
      enum: Object.values(ProjectTaskPriority),
      default: ProjectTaskPriority.MEDIUM,
      index: true,
    },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null, index: true },
    status: {
      type: String,
      enum: Object.values(ProjectTaskStatus),
      default: ProjectTaskStatus.NEW,
      index: true,
    },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    teamLeader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    estimatedHours: { type: Number, default: 0, min: 0 },
    location: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    completionReport: { type: String, default: '', trim: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    archived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

projectTaskSchema.index({ project: 1, stage: 1, archived: 1 });

export const ProjectTaskModel = mongoose.model('ProjectTask', projectTaskSchema);
