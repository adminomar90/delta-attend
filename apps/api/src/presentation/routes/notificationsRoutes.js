import { Router } from 'express';
import { listNotifications, markNotificationRead } from '../controllers/notificationController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const notificationsRoutes = Router();

notificationsRoutes.use(requireAuth);
notificationsRoutes.get('/', listNotifications);
notificationsRoutes.patch('/:id/read', markNotificationRead);

export default notificationsRoutes;
