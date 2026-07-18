import { Router } from 'express';
import { Permission } from '../../shared/constants.js';
import {
  requireAnyPermission,
  requirePermission,
} from '../middlewares/authorizationMiddleware.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { uploadDocumentMiddleware } from '../middlewares/uploadMiddleware.js';
import {
  addSupplierEvaluation,
  addSupplierNote,
  archiveSupplier,
  changeSupplierStatus,
  createSupplier,
  deleteSupplierAttachment,
  exportSuppliersExcel,
  exportSuppliersPdf,
  getSupplierById,
  listSuppliers,
  updateSupplier,
} from '../controllers/supplierController.js';

const suppliersRoutes = Router();

suppliersRoutes.use(requireAuth);
suppliersRoutes.use(
  requireAnyPermission(
    Permission.VIEW_SUPPLIERS,
    Permission.VIEW_APPROVED_SUPPLIERS,
    Permission.CREATE_SUPPLIERS,
    Permission.MANAGE_SUPPLIERS,
    Permission.APPROVE_SUPPLIERS,
    Permission.VIEW_SUPPLIER_FINANCIALS,
  ),
);

suppliersRoutes.get('/', listSuppliers);
suppliersRoutes.get('/reports/excel', requireAnyPermission(Permission.EXPORT_SUPPLIER_REPORTS, Permission.VIEW_SUPPLIER_FINANCIALS), exportSuppliersExcel);
suppliersRoutes.get('/reports/pdf', requireAnyPermission(Permission.EXPORT_SUPPLIER_REPORTS, Permission.VIEW_SUPPLIER_FINANCIALS), exportSuppliersPdf);
suppliersRoutes.post('/', requireAnyPermission(Permission.CREATE_SUPPLIERS, Permission.MANAGE_SUPPLIERS), uploadDocumentMiddleware.array('attachments', 20), createSupplier);
suppliersRoutes.get('/:id', getSupplierById);
suppliersRoutes.patch('/:id', requirePermission(Permission.MANAGE_SUPPLIERS), uploadDocumentMiddleware.array('attachments', 20), updateSupplier);
suppliersRoutes.patch('/:id/status', requireAnyPermission(Permission.MANAGE_SUPPLIERS, Permission.APPROVE_SUPPLIERS), changeSupplierStatus);
suppliersRoutes.patch('/:id/archive', requirePermission(Permission.MANAGE_SUPPLIERS), archiveSupplier);
suppliersRoutes.post('/:id/evaluations', requireAnyPermission(Permission.EVALUATE_SUPPLIERS, Permission.MANAGE_SUPPLIERS), addSupplierEvaluation);
suppliersRoutes.post('/:id/notes', requireAnyPermission(Permission.MANAGE_SUPPLIERS, Permission.VIEW_SUPPLIER_FINANCIALS), addSupplierNote);
suppliersRoutes.delete('/:id/attachments/:attachmentId', requirePermission(Permission.MANAGE_SUPPLIERS), deleteSupplierAttachment);

export default suppliersRoutes;
