import { Router } from 'express';
import { Permission } from '../../shared/constants.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requireAnyPermission } from '../middlewares/authorizationMiddleware.js';
import { uploadDocumentMiddleware } from '../middlewares/uploadMiddleware.js';
import {
  approvePurchase,
  cancelPurchase,
  createPurchase,
  exportPurchaseQuotes,
  getPublicQuote,
  getPurchase,
  listPurchases,
  purchaseSummary,
  receivePurchase,
  sendSupplierQuoteLink,
  submitPublicQuote,
} from '../controllers/purchaseController.js';

const purchasesRoutes = Router();

purchasesRoutes.get('/public/quotes/:token', getPublicQuote);
purchasesRoutes.post('/public/quotes/:token', uploadDocumentMiddleware.array('attachments', 5), submitPublicQuote);

purchasesRoutes.use(requireAuth);
purchasesRoutes.use(
  requireAnyPermission(
    Permission.VIEW_PURCHASES,
    Permission.CREATE_PURCHASE_REQUESTS,
    Permission.MANAGE_PURCHASE_QUOTES,
    Permission.APPROVE_PURCHASES,
    Permission.RECEIVE_PURCHASES,
    Permission.VIEW_PURCHASE_REPORTS,
  ),
);

purchasesRoutes.get('/', listPurchases);
purchasesRoutes.get('/summary', purchaseSummary);
purchasesRoutes.post('/', requireAnyPermission(Permission.CREATE_PURCHASE_REQUESTS, Permission.MANAGE_PURCHASE_QUOTES), createPurchase);
purchasesRoutes.get('/:id', getPurchase);
purchasesRoutes.get('/:id/quotes/export/:type', exportPurchaseQuotes);
purchasesRoutes.post('/:id/suppliers/:supplierQuoteId/send', requireAnyPermission(Permission.MANAGE_PURCHASE_QUOTES, Permission.CREATE_PURCHASE_REQUESTS), sendSupplierQuoteLink);
purchasesRoutes.post('/:id/approve', requireAnyPermission(Permission.APPROVE_PURCHASES), approvePurchase);
purchasesRoutes.post('/:id/receive', requireAnyPermission(Permission.RECEIVE_PURCHASES, Permission.MANAGE_MATERIAL_INVENTORY), receivePurchase);
purchasesRoutes.patch('/:id/cancel', requireAnyPermission(Permission.MANAGE_PURCHASE_QUOTES, Permission.APPROVE_PURCHASES), cancelPurchase);

export default purchasesRoutes;
