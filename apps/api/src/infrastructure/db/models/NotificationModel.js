import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'TASK_ASSIGNED',
        'TASK_APPROVAL_PROGRESS',
        'TASK_APPROVED',
        'GOAL_ASSIGNED',
        'GOAL_PROGRESS',
        'GOAL_ACHIEVED',
        'LEVEL_PROMOTED',
        'FINANCIAL_REQUEST_ASSIGNED',
        'FINANCIAL_REQUEST_STATUS',
        'MAINTENANCE_REPORT_REQUEST',
        'MAINTENANCE_REPORT_STATUS',
        'MAINTENANCE_REPORT_FEEDBACK',
        'INTERNAL_CIRCULAR',
        'INTERNAL_BULLETIN',
        'INTERNAL_MEETING',
        'ATTENDANCE_ACTIVITY',
        'WORK_REPORT_CREATED',
        'OPERATION_ACTIVITY',
        'SYSTEM',
      ],
      default: 'SYSTEM',
    },
    titleAr: {
      type: String,
      required: true,
    },
    messageAr: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readAt: Date,
  },
  {
    timestamps: true,
  },
);

export const NotificationModel = mongoose.model('Notification', notificationSchema);
