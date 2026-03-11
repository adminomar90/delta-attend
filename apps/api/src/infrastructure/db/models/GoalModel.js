import mongoose from 'mongoose';
import { GoalPeriod } from '../../../shared/constants.js';

const goalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    period: {
      type: String,
      enum: Object.values(GoalPeriod),
      required: true,
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
    achieved: {
      type: Boolean,
      default: false,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const GoalModel = mongoose.model('Goal', goalSchema);
