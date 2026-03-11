import { NotificationRepository } from '../../infrastructure/db/repositories/NotificationRepository.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const notificationRepository = new NotificationRepository();

export const listNotifications = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit || 25);
  const notifications = await notificationRepository.listForUser(req.user.id, limit);
  res.json({ notifications });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await notificationRepository.markAsRead(req.params.id, req.user.id);

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  res.json({ notification });
});
