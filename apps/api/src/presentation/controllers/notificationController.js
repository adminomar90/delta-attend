import { NotificationRepository } from '../../infrastructure/db/repositories/NotificationRepository.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { addSseClient, notificationService } from '../../application/services/notificationService.js';

const notificationRepository = new NotificationRepository();

export const listNotifications = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit || 25);
  const notifications = await notificationRepository.listForUser(req.user.id, limit);
  const unreadCount = await notificationRepository.unreadCount(req.user.id);
  res.json({ notifications, unreadCount });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await notificationRepository.markAsRead(req.params.id, req.user.id);

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  const unreadCount = await notificationRepository.unreadCount(req.user.id);
  res.json({ notification, unreadCount });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await notificationRepository.markAllAsRead(req.user.id);
  res.json({ unreadCount: 0 });
});

export const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationRepository.unreadCount(req.user.id);
  res.json({ unreadCount: count });
});

export const testNotification = asyncHandler(async (req, res) => {
  await notificationService.notifySystem(
    req.user.id,
    'إشعار تجريبي 🔔',
    'هذا إشعار تجريبي للتأكد من عمل منظومة الإشعارات بنجاح.',
    { test: true },
  );
  res.json({ success: true, message: 'تم إرسال إشعار تجريبي' });
});

export const sseStream = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('event: connected\ndata: {}\n\n');

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
  addSseClient(req.user.id, res);

  req.on('close', () => clearInterval(keepAlive));
};
