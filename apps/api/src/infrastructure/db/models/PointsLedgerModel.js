import mongoose from 'mongoose';

const pointsLedgerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    points: {
      type: Number,
      required: true,
    },
    category: {
      type: String,
      enum: [
        'TASK_APPROVAL',
        'WORK_REPORT_APPROVAL',
        'PROJECT_APPROVAL',
        'ATTENDANCE_APPROVAL',
        'MATERIAL_RECONCILIATION',
        'OPERATION_REWARD',
        'MANUAL_ADMIN_GRANT',
        'LEVEL_OVERRIDE_ADJUSTMENT',
        'BONUS',
        'PENALTY',
        'ADJUSTMENT',
      ],
      default: 'TASK_APPROVAL',
    },
    auditLog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditLog',
      default: null,
      index: true,
      unique: true,
      sparse: true,
    },
    sourceAction: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const PointsLedgerModel = mongoose.model('PointsLedger', pointsLedgerSchema);
