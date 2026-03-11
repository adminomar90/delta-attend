import { Router } from 'express';
import {
  createWorkReport,
  listWorkReports,
  getWorkReport,
  exportWorkReportPdf,
  saveWorkReportPdf,
  workReportWhatsappLink,
  approveWorkReport,
  rejectWorkReport,
} from '../controllers/workReportController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { canApproveTasks } from '../middlewares/authorizationMiddleware.js';
import { uploadWorkReportImagesMiddleware } from '../middlewares/uploadMiddleware.js';

const workReportsRoutes = Router();

workReportsRoutes.use(requireAuth);
workReportsRoutes.get('/', listWorkReports);
workReportsRoutes.get('/:id', getWorkReport);
workReportsRoutes.get('/:id/pdf', exportWorkReportPdf);
workReportsRoutes.post('/:id/pdf/save', saveWorkReportPdf);
workReportsRoutes.post('/:id/whatsapp-link', workReportWhatsappLink);
workReportsRoutes.post(
  '/',
  uploadWorkReportImagesMiddleware.array('images', 10),
  createWorkReport,
);
workReportsRoutes.patch('/:id/approve', canApproveTasks, approveWorkReport);
workReportsRoutes.patch('/:id/reject', canApproveTasks, rejectWorkReport);

export default workReportsRoutes;
