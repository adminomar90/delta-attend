import { Router } from 'express';
import { listAuditLogs } from '../controllers/auditController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { canViewAuditLogs } from '../middlewares/authorizationMiddleware.js';

const auditRoutes = Router();

auditRoutes.use(requireAuth);
auditRoutes.get('/', canViewAuditLogs, listAuditLogs);

export default auditRoutes;
