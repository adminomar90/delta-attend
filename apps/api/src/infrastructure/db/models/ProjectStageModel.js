import mongoose from 'mongoose';

export const ProjectStageStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  STOPPED: 'STOPPED',
  DELAYED: 'DELAYED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

const projectStageAttachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: '', trim: true },
    originalName: { type: String, default: '', trim: true },
    mimeType: { type: String, default: '', trim: true },
    size: { type: Number, default: 0, min: 0 },
    storagePath: { type: String, default: '', trim: true },
    publicUrl: { type: String, default: '', trim: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, default: Date.now },
    comment: { type: String, default: '', trim: true },
  },
  { _id: true },
);

const projectStageSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    order: { type: Number, default: 1, min: 1, index: true },
    plannedStartDate: { type: Date, default: null },
    plannedEndDate: { type: Date, default: null },
    actualStartDate: { type: Date, default: null },
    actualEndDate: { type: Date, default: null },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: Object.values(ProjectStageStatus),
      default: ProjectStageStatus.NOT_STARTED,
      index: true,
    },
    notes: { type: String, default: '', trim: true },
    attachments: { type: [projectStageAttachmentSchema], default: [] },
    archived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

projectStageSchema.index({ project: 1, order: 1 });
projectStageSchema.index({ project: 1, archived: 1, status: 1 });

export const ProjectStageModel = mongoose.model('ProjectStage', projectStageSchema);
