import mongoose from 'mongoose';
import { GoalPeriod } from '../../../shared/constants.js';

export const GoalStatus = {
  ACTIVE: 'ACTIVE',
  ACHIEVED: 'ACHIEVED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
};

const goalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    period: {
      type: String,
      enum: Object.values(GoalPeriod),
      default: GoalPeriod.CUSTOM,
    },
    targetPoints: {
      type: Number,
      required: true,
      min: 10,
    },
    currentPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    startLevel: {
      type: Number,
      required: true,
      min: 1,
    },
    targetLevel: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: Object.values(GoalStatus),
      default: GoalStatus.ACTIVE,
      index: true,
    },
    achieved: {
      type: Boolean,
      default: false,
    },
    achievedAt: {
      type: Date,
      default: null,
    },
    promotedAt: {
      type: Date,
      default: null,
    },
    progress50NotifiedAt: {
      type: Date,
      default: null,
    },
    completedNotifiedAt: {
      type: Date,
      default: null,
    },
    promotionNotifiedAt: {
      type: Date,
      default: null,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const GoalModel = mongoose.model('Goal', goalSchema);
