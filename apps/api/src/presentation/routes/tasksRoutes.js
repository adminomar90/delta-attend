import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import multer from 'multer';
import * as ticket from '../controllers/ticketController.js';
import { requirePermission } from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import {
  canManageTasks,
} from '../middlewares/authorizationMiddleware.js';

const tasksRoutes = Router();

tasksRoutes.use(requireAuth);
tasksRoutes.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
tasksRoutes.use((req, res, next) => {
  for (const [key, limit] of [['reason', 6000], ['note', 6000], ['rejectionReason', 6000], ['waitingParty', 300], ['title', 300], ['description', 20000]]) {
    if (req.body?.[key] !== undefined && (typeof req.body[key] !== 'string' || req.body[key].length > limit)) return res.status(400).json({ message: `قيمة ${key} غير صالحة أو تتجاوز الحد المسموح (${limit})` });
  }
  next();
});

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 10, fileSize: 10 * 1024 * 1024, fields: 3 } });
tasksRoutes.get('/metadata', ticket.metadata);
tasksRoutes.put('/settings', requirePermission(Permission.MANAGE_TICKET_SETTINGS), ticket.saveSettings);
tasksRoutes.get('/maintenance-due', ticket.maintenanceDue);
tasksRoutes.post('/maintenance-due', canManageTasks, ticket.maintenanceCreate);
tasksRoutes.get('/', ticket.list);
tasksRoutes.get('/my-activity', ticket.myActivity);
tasksRoutes.post('/', canManageTasks, ticket.create);
tasksRoutes.get('/:id', ticket.get);
tasksRoutes.patch('/:id', ticket.update);
tasksRoutes.patch('/:id/status', ticket.changeStatus);
tasksRoutes.patch('/:id/approve', ticket.approve);
tasksRoutes.post('/:id/comments', ticket.comment);
tasksRoutes.post('/:id/recipients', canManageTasks, ticket.groupRecipients);
tasksRoutes.post('/:id/archive', ticket.archive);
tasksRoutes.post('/:id/attachments', ticket.authorizeUpload, upload.array('files', 10), ticket.upload);
tasksRoutes.get('/:id/attachments/:attachmentId', ticket.download);

export default tasksRoutes;
