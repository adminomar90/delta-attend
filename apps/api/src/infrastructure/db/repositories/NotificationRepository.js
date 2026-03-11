import { NotificationModel } from '../models/NotificationModel.js';

export class NotificationRepository {
  async create(payload) {
    return NotificationModel.create(payload);
  }

  async listForUser(userId, limit = 25) {
    return NotificationModel.find({ user: userId }).sort({ createdAt: -1 }).limit(limit);
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
}
