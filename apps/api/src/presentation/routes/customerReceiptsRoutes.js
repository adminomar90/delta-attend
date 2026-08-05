import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requireAnyPermission } from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import {
  createCustomerReceipt,
  exportCustomerReceiptPdf,
  listCustomerReceipts,
} from '../controllers/customerReceiptController.js';

const router = Router();

router.use(
  requireAuth,
  requireAnyPermission(
    Permission.VIEW_FINANCIAL_REPORTS,
    Permission.VIEW_ALL_FINANCIAL_DISBURSEMENTS,
    Permission.CREATE_FINANCIAL_DISBURSEMENTS,
    Permission.REVIEW_FINANCIAL_DISBURSEMENTS,
    Permission.DISBURSE_FINANCIAL_FUNDS,
  ),
);

router.get('/', listCustomerReceipts);
router.post('/', createCustomerReceipt);
router.get('/:id/pdf', exportCustomerReceiptPdf);

export default router;
