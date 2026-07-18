import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    clientName: { type: String, default: '', trim: true },
    clientPhone: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    workCategories: { type: [String], default: [] },
    expectedEndDate: { type: Date, default: null },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teamMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    projectManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['PENDING_APPROVAL', 'ACTIVE', 'ON_HOLD', 'DONE', 'REJECTED'],
      default: 'ACTIVE',
    },
    requiredApprovalRoles: {
      type: [String],
      default: [],
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
        comment: {
          type: String,
          default: '',
        },
        approvedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    approvalPointsAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    startDate: Date,
    endDate: Date,
    budget: {
      type: Number,
      min: 0,
      default: 0,
    },
    archived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
  },
);

export const ProjectModel = mongoose.model('Project', projectSchema);
