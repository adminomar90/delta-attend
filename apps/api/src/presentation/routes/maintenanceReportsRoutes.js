import { Router } from 'express';
import { asyncHandler, AppError } from '../../shared/errors.js';
import { MaintenanceReportModel } from '../../infrastructure/db/models/MaintenanceReportModel.js';
import { ensureTask } from '../../application/services/ticketService.js';
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
maintenanceReportsRoutes.use('/:id', asyncHandler(async (req, res, next) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return next();
  const report = await MaintenanceReportModel.findById(req.params.id).select('ticket');
  if (report?.ticket) {
    await ensureTask(req.user, report.ticket);
    if (req.method !== 'GET' && !req.path.endsWith('/whatsapp-link')) throw new AppError('تقرير مرتبط بتذكرة؛ حدّث التنفيذ والمراجعة من التذكرة الأصلية', 409);
  }
  next();
}));
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
