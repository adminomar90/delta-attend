import { NotificationModel } from '../models/NotificationModel.js';

export class NotificationRepository {
  async create(payload) {
    return NotificationModel.create(payload);
  }

  async listForUser(userId, limit = 25) {
    return NotificationModel.find({ user: userId }).sort({ createdAt: -1 }).limit(limit);
  }

  async unreadCount(userId) {
    return NotificationModel.countDocuments({ user: userId, readAt: null });
  }

  async markAsRead(notificationId, userId) {
    return NotificationModel.findOneAndUpdate(
      {
        _id: notificationId,
        user: userId,
      },
      {
        $set: {
          readAt: new Date(),
        },
      },
      {
        new: true,
      },
    );
  }

  async markAllAsRead(userId) {
    return NotificationModel.updateMany(
      { user: userId, readAt: null },
      { $set: { readAt: new Date() } },
    );
  }
}
