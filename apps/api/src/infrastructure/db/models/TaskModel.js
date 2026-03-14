import mongoose from 'mongoose';
import { TaskStatus } from '../../../shared/constants.js';

const taskSchema = new mongoose.Schema(
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
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
      required: true,
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
    rejectionReason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

export const TaskModel = mongoose.model('Task', taskSchema);
