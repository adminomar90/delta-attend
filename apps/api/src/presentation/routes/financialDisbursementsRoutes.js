import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  requireAnyPermission,
  canCreateFinancialDisbursements,
  canReviewFinancialDisbursements,
  canDisburseFinancialFunds,
} from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import { uploadDocumentMiddleware } from '../middlewares/uploadMiddleware.js';
import {
  confirmFinancialDisbursementReceipt,
  createFinancialDisbursement,
  deliverFinancialDisbursement,
  financialDisbursementSummary,
  financialDisbursementWhatsappLink,
  getFinancialDisbursement,
  listFinancialDisbursements,
  exportFinancialDisbursementPdf,
  reviewFinancialDisbursementAsFinancialManager,
  reviewFinancialDisbursementAsGeneralManager,
  reviewFinancialDisbursementAsProjectManager,
  submitFinancialDisbursement,
  updateFinancialDisbursement,
} from '../controllers/financialDisbursementController.js';

const financialDisbursementsRoutes = Router();

const canAccessFinancialDisbursementsModule = requireAnyPermission(
  Permission.CREATE_FINANCIAL_DISBURSEMENTS,
  Permission.REVIEW_FINANCIAL_DISBURSEMENTS,
  Permission.DISBURSE_FINANCIAL_FUNDS,
  Permission.VIEW_FINANCIAL_REPORTS,
);

financialDisbursementsRoutes.use(requireAuth, canAccessFinancialDisbursementsModule);

financialDisbursementsRoutes.get('/summary', financialDisbursementSummary);
financialDisbursementsRoutes.get('/', listFinancialDisbursements);
financialDisbursementsRoutes.post('/', canCreateFinancialDisbursements, uploadDocumentMiddleware.array('attachments', 10), createFinancialDisbursement);
financialDisbursementsRoutes.get('/:id/pdf', exportFinancialDisbursementPdf);
financialDisbursementsRoutes.post('/:id/whatsapp-link', financialDisbursementWhatsappLink);
financialDisbursementsRoutes.get('/:id', getFinancialDisbursement);
financialDisbursementsRoutes.patch('/:id', canCreateFinancialDisbursements, uploadDocumentMiddleware.array('attachments', 10), updateFinancialDisbursement);
financialDisbursementsRoutes.patch('/:id/submit', canCreateFinancialDisbursements, submitFinancialDisbursement);
financialDisbursementsRoutes.patch('/:id/project-manager-review', canReviewFinancialDisbursements, reviewFinancialDisbursementAsProjectManager);
financialDisbursementsRoutes.patch('/:id/financial-manager-review', canReviewFinancialDisbursements, reviewFinancialDisbursementAsFinancialManager);
financialDisbursementsRoutes.patch('/:id/general-manager-review', canReviewFinancialDisbursements, reviewFinancialDisbursementAsGeneralManager);
financialDisbursementsRoutes.patch('/:id/deliver', canDisburseFinancialFunds, deliverFinancialDisbursement);
financialDisbursementsRoutes.patch('/:id/confirm-receipt', confirmFinancialDisbursementReceipt);

export default financialDisbursementsRoutes;
