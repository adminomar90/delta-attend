import { Router } from 'express';
import {
  createWorkReport,
  listWorkReports,
  listCompletedWorkReports,
  listWorkReportEmployees,
  getWorkReport,
  exportWorkReportPdf,
  saveWorkReportPdf,
  workReportWhatsappLink,
  approveWorkReport,
  rejectWorkReport,
} from '../controllers/workReportController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  canSendReportsWhatsapp,
  canViewCompletedWorkReports,
  requireAnyPermission,
} from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import { uploadWorkReportImagesMiddleware } from '../middlewares/uploadMiddleware.js';

const workReportsRoutes = Router();

workReportsRoutes.use(requireAuth);
workReportsRoutes.get(
  '/',
  requireAnyPermission(
    Permission.VIEW_OWN_WORK_REPORTS,
    Permission.VIEW_TEAM_WORK_REPORTS,
    Permission.APPROVE_TASKS,
    Permission.VIEW_COMPLETED_WORK_REPORTS,
  ),
  listWorkReports,
);
workReportsRoutes.get('/completed', canViewCompletedWorkReports, listCompletedWorkReports);
workReportsRoutes.get(
  '/employees',
  requireAnyPermission(
    Permission.VIEW_OWN_WORK_REPORTS,
    Permission.VIEW_TEAM_WORK_REPORTS,
    Permission.APPROVE_TASKS,
  ),
  listWorkReportEmployees,
);
workReportsRoutes.get('/:id', getWorkReport);
workReportsRoutes.get('/:id/pdf', exportWorkReportPdf);
workReportsRoutes.post('/:id/pdf/save', saveWorkReportPdf);
workReportsRoutes.post('/:id/whatsapp-link', canSendReportsWhatsapp, workReportWhatsappLink);
workReportsRoutes.post(
  '/',
  requireAnyPermission(Permission.VIEW_OWN_WORK_REPORTS, Permission.VIEW_TEAM_WORK_REPORTS),
  uploadWorkReportImagesMiddleware.array('images', 10),
  createWorkReport,
);
workReportsRoutes.patch('/:id/approve', approveWorkReport);
workReportsRoutes.patch('/:id/reject', rejectWorkReport);

export default workReportsRoutes;
