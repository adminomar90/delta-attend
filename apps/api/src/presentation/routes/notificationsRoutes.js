import { Router } from 'express';
import {
  listNotifications,
  markNotificationRead,
  markAllRead,
  unreadCount,
  testNotification,
  sseStream,
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
} from '../controllers/notificationController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const notificationsRoutes = Router();

// Public (no auth) — frontend needs this before login
notificationsRoutes.get('/vapid-public-key', getVapidPublicKey);

notificationsRoutes.use(requireAuth);
notificationsRoutes.get('/', listNotifications);
notificationsRoutes.get('/unread-count', unreadCount);
notificationsRoutes.get('/stream', sseStream);
notificationsRoutes.post('/test', testNotification);
notificationsRoutes.post('/push-subscribe', subscribePush);
notificationsRoutes.post('/push-unsubscribe', unsubscribePush);
notificationsRoutes.patch('/read-all', markAllRead);
notificationsRoutes.patch('/:id/read', markNotificationRead);

export default notificationsRoutes;
