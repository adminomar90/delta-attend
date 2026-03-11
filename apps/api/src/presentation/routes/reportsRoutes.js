import { Router } from 'express';
import {
  exportExcel,
  exportPdf,
  reportSummary,
  executiveSummary,
} from '../controllers/reportController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  canViewAnalytics,
  canViewExecutiveReports,
  canViewFinancialReports,
} from '../middlewares/authorizationMiddleware.js';

const reportsRoutes = Router();

reportsRoutes.use(requireAuth);
reportsRoutes.get('/summary', canViewAnalytics, reportSummary);
reportsRoutes.get('/executive', canViewExecutiveReports, executiveSummary);
reportsRoutes.get('/excel', canViewFinancialReports, exportExcel);
reportsRoutes.get('/pdf', canViewFinancialReports, exportPdf);

export default reportsRoutes;
