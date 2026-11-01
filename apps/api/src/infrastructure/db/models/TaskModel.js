import mongoose from 'mongoose';
import { TaskStatus } from '../../../shared/constants.js';
function requiredWhenAssigned() {
  const status = typeof this.getUpdate === 'function' ? this.getUpdate()?.$set?.status : this.status;
  return ![TaskStatus.DRAFT, TaskStatus.CANCELLED].includes(status);
}

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: requiredWhenAssigned,
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
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: requiredWhenAssigned,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.TODO,
    },
    difficulty: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },
    urgency: {
      type: Number,
      min: 1,
      max: 3,
      default: 1,
    },
    estimatedHours: {
      type: Number,
      min: 1,
      max: 40,
      default: 2,
    },
    plannedPoints: {
      type: Number,
      min: 1,
      max: 1000,
      default: null,
    },
    dueDate: {
      type: Date,
      required: requiredWhenAssigned,
    },
    requiredApprovals: {
      type: Number,
      default: 1,
      min: 1,
      max: 5,
    },
    approvalTrail: [
      {
        approver: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        role: {
          type: String,
          required: true,
        },
        note: {
          type: String,
          default: '',
        },
        approvedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    submittedAt: Date,
    completedAt: Date,
    approvedAt: Date,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    qualityScore: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },
    pointsAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },
    schemaVersion: { type: Number, default: 2 },
    draftData: { type: mongoose.Schema.Types.Mixed, default: null },
    ticketNumber: { type: String },
    ticketType: { type: String, default: 'GENERAL' },
    technicalRequired: { type: Boolean, default: false },
    priority: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], default: 'NORMAL' },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    recipientSnapshot: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    initialRecipientSnapshot: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    assignmentMode: { type: String, enum: ['SINGLE', 'SHARED', 'INDEPENDENT'], default: 'SINGLE' },
    parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
    isGroupParent: { type: Boolean, default: false },
    removedFromGroup: { type: Boolean, default: false },
    childKey: { type: String },
    requestKey: { type: String },
    startDate: Date,
    originalDueDate: Date,
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    customerName: { type: String, default: '' },
    branch: { type: String, default: '' },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    outputType: { type: String, default: 'CONFIRMATION' },
    requireOutput: { type: Boolean, default: false },
    checklist: [{ text: { type: String, maxlength: 500 }, checked: { type: Boolean, default: false }, checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, checkedAt: Date }],
    attachments: [{ originalName: String, storageName: String, mimeType: String, size: Number, purpose: { type: String, enum: ['REFERENCE', 'OUTPUT', 'BEFORE', 'AFTER'], default: 'REFERENCE' }, uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, uploadedAt: { type: Date, default: Date.now } }],
    submissions: [{ note: String, attachmentIds: [String], execution: mongoose.Schema.Types.Mixed, submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, submittedAt: { type: Date, default: Date.now } }],
    comments: [{ text: { type: String, maxlength: 6000 }, mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, createdAt: { type: Date, default: Date.now } }],
    history: [{ action: String, actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, actorName: String, note: String, before: mongoose.Schema.Types.Mixed, after: mongoose.Schema.Types.Mixed, at: { type: Date, default: Date.now } }],
    execution: {
      contactName: String, contactPhone: String, location: String, mapUrl: String,
      device: String, model: String, serial: String, fault: String, impact: String,
      coverage: { type: String, enum: ['', 'CONTRACT', 'WARRANTY', 'PAID'], default: '' },
      visitDate: Date, diagnosis: String, actionTaken: String, materialsUsed: String,
      replacedParts: String, testResult: String, recommendations: String,
      customerSignature: String, signatureUnavailableReason: String,
      workMinutes: { type: Number, min: 0, default: 0 }, travelMinutes: { type: Number, min: 0, default: 0 },
    },
    waitingReason: String, waitingParty: String, cancellationReason: String,
    archived: { type: Boolean, default: false },
    maintenancePlan: { type: mongoose.Schema.Types.ObjectId, ref: 'MaintenancePlan', default: null },
    scheduledVisitId: String, maintenanceKey: String, maintenanceSnapshot: mongoose.Schema.Types.Mixed,
    maintenanceVisit: { type: mongoose.Schema.Types.ObjectId, ref: 'MaintenanceVisit', default: null },
    maintenanceReport: { type: mongoose.Schema.Types.ObjectId, ref: 'MaintenanceReport', default: null },
    recurrence: { frequency: { type: String, enum: ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'], default: 'NONE' }, intervalDays: { type: Number, min: 1, max: 365 }, nextAt: Date, until: Date, rootTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' } },
    recurrenceKey: String,
    reminderMinutes: { type: Number, min: 0, max: 43200, default: 60 },
    notificationKeys: { type: [String], default: [] },
    revision: { type: Number, default: 0 },
    rejectionReason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

for (const field of ['ticketNumber', 'childKey', 'requestKey', 'maintenanceKey', 'recurrenceKey']) {
  taskSchema.index({ [field]: 1 }, { unique: true, partialFilterExpression: { [field]: { $type: 'string' } } });
}
taskSchema.index({ assignee: 1, status: 1, dueDate: 1 });
taskSchema.index({ reviewer: 1, status: 1 });

export const TaskModel = mongoose.model('Task', taskSchema);
