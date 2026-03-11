import { Router } from 'express';
import {
  listNotifications,
  markNotificationRead,
  markAllRead,
  unreadCount,
  testNotification,
  sseStream,
} from '../controllers/notificationController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const notificationsRoutes = Router();

notificationsRoutes.use(requireAuth);
notificationsRoutes.get('/', listNotifications);
notificationsRoutes.get('/unread-count', unreadCount);
notificationsRoutes.get('/stream', sseStream);
notificationsRoutes.post('/test', testNotification);
notificationsRoutes.patch('/read-all', markAllRead);
notificationsRoutes.patch('/:id/read', markNotificationRead);

export default notificationsRoutes;
