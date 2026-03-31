import mongoose from 'mongoose';
import {
  DailyWorkPlanPriority,
  DailyWorkPlanStatus,
  DailyWorkPlanTaskType,
} from '../../../application/services/dailyWorkPlanService.js';

const attachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0, min: 0 },
    storagePath: { type: String, default: '' },
    publicUrl: { type: String, default: '' },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    uploadedByName: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now },
    comment: { type: String, default: '' },
  },
  { _id: false },
);

const delayRequestSchema = new mongoose.Schema(
  {
    requestedAt: { type: Date, default: Date.now },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    requestedByName: { type: String, default: '' },
    reason: { type: String, default: '' },
    targetDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['REQUESTED', 'APPROVED', 'REJECTED'],
      default: 'REQUESTED',
    },
  },
  { _id: false },
);

const assigneeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(DailyWorkPlanStatus),
      default: DailyWorkPlanStatus.NEW,
    },
    progressPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    employeeNotes: { type: String, default: '' },
    adminNotes: { type: String, default: '' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastUpdatedAt: { type: Date, default: Date.now },
    pointsAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },
    pointsAwardedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pointsAwardedAt: { type: Date, default: null },
    pointsAwardNote: { type: String, default: '' },
    teamLeaderRating: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    delayRequest: {
      type: delayRequestSchema,
      default: null,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
  },
  { _id: false },
);

const timelineSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actorName: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    message: { type: String, default: '' },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const dailyWorkPlanSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    customerName: {
      type: String,
      default: '',
      trim: true,
    },
    projectNameSnapshot: {
      type: String,
      default: '',
      trim: true,
    },
    location: {
      type: String,
      default: '',
      trim: true,
    },
    planDate: {
      type: Date,
      required: true,
    },
    originalPlanDate: {
      type: Date,
      default: null,
    },
    postponedTo: {
      type: Date,
      default: null,
    },
    startTime: {
      type: String,
      default: '',
      trim: true,
    },
    expectedEndTime: {
      type: String,
      default: '',
      trim: true,
    },
    dueAt: {
      type: Date,
      default: null,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(DailyWorkPlanPriority),
      default: DailyWorkPlanPriority.MEDIUM,
    },
    taskType: {
      type: String,
      enum: Object.values(DailyWorkPlanTaskType),
      default: DailyWorkPlanTaskType.OTHER,
    },
    status: {
      type: String,
      enum: Object.values(DailyWorkPlanStatus),
      default: DailyWorkPlanStatus.NEW,
      index: true,
    },
    progressPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    pointsAwardedTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    assignees: {
      type: [assigneeSchema],
      default: [],
    },
    teamLeader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    supervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    isApproved: {
      type: Boolean,
      default: false,
    },
    archived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    adminNotes: {
      type: String,
      default: '',
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    timeline: {
      type: [timelineSchema],
      default: [],
    },
    rolledOverCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    templateId: {
      type: String,
      default: '',
    },
    parentPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DailyWorkPlan',
      default: null,
    },
    geoLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      label: { type: String, default: '' },
    },
    attendanceRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attendance',
      default: null,
    },
    materialsSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

dailyWorkPlanSchema.index({ planDate: -1, status: 1 });
dailyWorkPlanSchema.index({ archived: 1, archivedAt: -1 });
dailyWorkPlanSchema.index({ 'assignees.user': 1, planDate: -1 });
dailyWorkPlanSchema.index({ createdBy: 1, planDate: -1 });
dailyWorkPlanSchema.index({ supervisor: 1, planDate: -1 });

export const DailyWorkPlanModel = mongoose.model('DailyWorkPlan', dailyWorkPlanSchema);
