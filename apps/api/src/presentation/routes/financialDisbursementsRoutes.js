import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  requireAnyPermission,
  canCreateFinancialDisbursements,
  canReviewFinancialDisbursements,
  canDisburseFinancialFunds,
} from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import { uploadFinancialDisbursementAttachmentsMiddleware } from '../middlewares/uploadMiddleware.js';
import {
  archiveFinancialDisbursement,
  confirmFinancialDisbursementReceipt,
  createFinancialDisbursement,
  deleteFinancialDisbursement,
  deliverFinancialDisbursement,
  financialDisbursementReports,
  financialDisbursementSummary,
  financialDisbursementWhatsappLink,
  getFinancialDisbursement,
  listFinancialDisbursements,
  exportFinancialDisbursementsExcel,
  exportFinancialDisbursementPdf,
  reviewFinancialDisbursementAsFinancialManager,
  reviewFinancialDisbursementAsGeneralManager,
  reviewFinancialDisbursementAsProjectManager,
  submitFinancialDisbursement,
  unarchiveFinancialDisbursement,
  updateFinancialDisbursement,
} from '../controllers/financialDisbursementController.js';

const financialDisbursementsRoutes = Router();

const canAccessFinancialDisbursementsModule = requireAnyPermission(
  Permission.CREATE_FINANCIAL_DISBURSEMENTS,
  Permission.REVIEW_FINANCIAL_DISBURSEMENTS,
  Permission.VIEW_ALL_FINANCIAL_DISBURSEMENTS,
  Permission.DISBURSE_FINANCIAL_FUNDS,
  Permission.VIEW_FINANCIAL_REPORTS,
);

financialDisbursementsRoutes.use(requireAuth, canAccessFinancialDisbursementsModule);

financialDisbursementsRoutes.get('/summary', financialDisbursementSummary);
financialDisbursementsRoutes.get('/reports', financialDisbursementReports);
financialDisbursementsRoutes.get('/export/excel', exportFinancialDisbursementsExcel);
financialDisbursementsRoutes.get('/', listFinancialDisbursements);
financialDisbursementsRoutes.post(
  '/',
  canCreateFinancialDisbursements,
  uploadFinancialDisbursementAttachmentsMiddleware.array('attachments', 20),
  createFinancialDisbursement,
);
financialDisbursementsRoutes.get('/:id/pdf', exportFinancialDisbursementPdf);
financialDisbursementsRoutes.post('/:id/whatsapp-link', financialDisbursementWhatsappLink);
financialDisbursementsRoutes.get('/:id', getFinancialDisbursement);
financialDisbursementsRoutes.delete('/:id', canCreateFinancialDisbursements, deleteFinancialDisbursement);
financialDisbursementsRoutes.patch(
  '/:id',
  canCreateFinancialDisbursements,
  uploadFinancialDisbursementAttachmentsMiddleware.array('attachments', 20),
  updateFinancialDisbursement,
);
financialDisbursementsRoutes.patch('/:id/submit', canCreateFinancialDisbursements, submitFinancialDisbursement);
financialDisbursementsRoutes.patch('/:id/project-manager-review', canReviewFinancialDisbursements, reviewFinancialDisbursementAsProjectManager);
financialDisbursementsRoutes.patch('/:id/financial-manager-review', canReviewFinancialDisbursements, reviewFinancialDisbursementAsFinancialManager);
financialDisbursementsRoutes.patch('/:id/general-manager-review', canReviewFinancialDisbursements, reviewFinancialDisbursementAsGeneralManager);
financialDisbursementsRoutes.patch('/:id/deliver', canDisburseFinancialFunds, deliverFinancialDisbursement);
financialDisbursementsRoutes.patch('/:id/confirm-receipt', confirmFinancialDisbursementReceipt);
financialDisbursementsRoutes.patch('/:id/archive', archiveFinancialDisbursement);
financialDisbursementsRoutes.patch('/:id/unarchive', unarchiveFinancialDisbursement);

export default financialDisbursementsRoutes;
