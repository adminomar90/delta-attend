import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  canCreateMaintenanceReportRequests,
  canHandleMaintenanceReports,
  canReviewMaintenanceReports,
  requireAnyPermission,
} from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import { uploadWorkReportImagesMiddleware } from '../middlewares/uploadMiddleware.js';
import {
  acceptMaintenanceReportRequest,
  completeMaintenanceReport,
  createMaintenanceReportRequest,
  exportMaintenanceReportPdf,
  getMaintenanceReport,
  getPublicMaintenanceFeedback,
  listMaintenanceAssignees,
  listMaintenanceReports,
  maintenanceReportsSummary,
  maintenanceReportWhatsappLink,
  reviewMaintenanceReport,
  saveMaintenanceReportDraft,
  sendMaintenanceFeedbackLink,
  submitMaintenanceReportForApproval,
  submitPublicMaintenanceFeedback,
  updateMaintenanceReportRequest,
} from '../controllers/maintenanceReportController.js';

const maintenanceReportsRoutes = Router();

maintenanceReportsRoutes.get('/public/feedback/:token', getPublicMaintenanceFeedback);
maintenanceReportsRoutes.post('/public/feedback/:token', submitPublicMaintenanceFeedback);

const canAccessMaintenanceReportsModule = requireAnyPermission(
  Permission.CREATE_MAINTENANCE_REPORT_REQUESTS,
  Permission.HANDLE_MAINTENANCE_REPORTS,
  Permission.REVIEW_MAINTENANCE_REPORTS,
  Permission.VIEW_MAINTENANCE_REPORTS,
);

maintenanceReportsRoutes.use(requireAuth, canAccessMaintenanceReportsModule);

maintenanceReportsRoutes.get('/summary', maintenanceReportsSummary);
maintenanceReportsRoutes.get('/assignees', canCreateMaintenanceReportRequests, listMaintenanceAssignees);
maintenanceReportsRoutes.get('/', listMaintenanceReports);
maintenanceReportsRoutes.post('/', canCreateMaintenanceReportRequests, createMaintenanceReportRequest);
maintenanceReportsRoutes.get('/:id/pdf', exportMaintenanceReportPdf);
maintenanceReportsRoutes.post('/:id/whatsapp-link', maintenanceReportWhatsappLink);
maintenanceReportsRoutes.get('/:id', getMaintenanceReport);
maintenanceReportsRoutes.patch('/:id/request', canCreateMaintenanceReportRequests, updateMaintenanceReportRequest);
maintenanceReportsRoutes.patch('/:id/accept', canHandleMaintenanceReports, acceptMaintenanceReportRequest);
maintenanceReportsRoutes.patch('/:id/report', canHandleMaintenanceReports, uploadWorkReportImagesMiddleware.array('images', 10), saveMaintenanceReportDraft);
maintenanceReportsRoutes.patch('/:id/complete', canHandleMaintenanceReports, completeMaintenanceReport);
maintenanceReportsRoutes.post('/:id/feedback-link', canHandleMaintenanceReports, sendMaintenanceFeedbackLink);
maintenanceReportsRoutes.patch('/:id/submit-for-approval', canHandleMaintenanceReports, submitMaintenanceReportForApproval);
maintenanceReportsRoutes.patch('/:id/manager-review', canReviewMaintenanceReports, reviewMaintenanceReport);

export default maintenanceReportsRoutes;
