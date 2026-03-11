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
    status: {
      type: String,
      enum: ['PENDING_APPROVAL', 'ACTIVE', 'ON_HOLD', 'DONE', 'REJECTED'],
      default: 'PENDING_APPROVAL',
    },
    requiredApprovalRoles: {
      type: [String],
      default: ['FINANCIAL_MANAGER', 'GENERAL_MANAGER'],
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
  },
  {
    timestamps: true,
  },
);

export const ProjectModel = mongoose.model('Project', projectSchema);
