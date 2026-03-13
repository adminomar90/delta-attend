import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'TASK_ASSIGNED',
        'TASK_APPROVAL_PROGRESS',
        'TASK_APPROVED',
        'GOAL_ACHIEVED',
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
