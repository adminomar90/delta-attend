import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  canExportApprovalHistory,
  canViewApprovalHistory,
} from '../middlewares/authorizationMiddleware.js';
import {
  exportApprovalHistoryExcel,
  exportApprovalHistoryPdf,
  getApprovalHistoryDetail,
  listApprovalHistory,
} from '../controllers/approvalHistoryController.js';

const approvalHistoryRoutes = Router();

approvalHistoryRoutes.use(requireAuth);

approvalHistoryRoutes.get('/', canViewApprovalHistory, listApprovalHistory);
approvalHistoryRoutes.get('/export/excel', canExportApprovalHistory, exportApprovalHistoryExcel);
approvalHistoryRoutes.get('/export/pdf', canExportApprovalHistory, exportApprovalHistoryPdf);
approvalHistoryRoutes.get('/:operationType/:recordId', canViewApprovalHistory, getApprovalHistoryDetail);

export default approvalHistoryRoutes;
