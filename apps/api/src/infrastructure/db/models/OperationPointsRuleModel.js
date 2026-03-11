import mongoose from 'mongoose';

const operationPointsRuleSchema = new mongoose.Schema(
  {
    actionKey: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    labelAr: {
      type: String,
      default: '',
      trim: true,
    },
    basePoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    formulaType: {
      type: String,
      enum: ['FIXED', 'WORK_REPORT_PROGRESS'],
      default: 'FIXED',
    },
    multiplier: {
      type: Number,
      default: 1,
      min: 0,
    },
    maxPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    enabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const OperationPointsRuleModel = mongoose.model('OperationPointsRule', operationPointsRuleSchema);
