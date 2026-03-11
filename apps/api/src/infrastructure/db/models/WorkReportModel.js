import mongoose from 'mongoose';

const reportImageSchema = new mongoose.Schema(
  {
    publicUrl: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      default: '',
      trim: true,
    },
    mimeType: {
      type: String,
      default: '',
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    comment: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const workReportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
      trim: true,
    },
    employeeCode: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    projectName: {
      type: String,
      default: '',
      trim: true,
    },
    activityType: {
      type: String,
      default: '',
      trim: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    details: {
      type: String,
      required: true,
      trim: true,
    },
    accomplishments: {
      type: String,
      default: '',
      trim: true,
    },
    challenges: {
      type: String,
      default: '',
      trim: true,
    },
    nextSteps: {
      type: String,
      default: '',
      trim: true,
    },
    progressPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    hoursSpent: {
      type: Number,
      min: 0,
      max: 24,
      default: 0,
    },
    workDate: {
      type: Date,
      default: Date.now,
    },
    images: {
      type: [reportImageSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['SUBMITTED', 'APPROVED', 'REJECTED'],
      default: 'SUBMITTED',
      index: true,
    },
    managerComment: {
      type: String,
      default: '',
      trim: true,
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    pointsAwarded: {
      type: Number,
      min: 0,
      default: 0,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const WorkReportModel = mongoose.model('WorkReport', workReportSchema);
