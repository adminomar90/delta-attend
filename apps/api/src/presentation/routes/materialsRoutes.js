import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  requireAnyPermission,
  canManageMaterialCatalog,
  canManageMaterialInventory,
  canCreateMaterialRequests,
  canReviewMaterialRequests,
  canCloseMaterialCustody,
  canViewMaterialReports,
} from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import { uploadDocumentMiddleware } from '../middlewares/uploadMiddleware.js';
import {
  listMaterials,
  createMaterial,
  updateMaterial,
  getMaterialByBarcode,
  listMaterialCategories,
  renameMaterialCategory,
  deleteMaterialCategory,
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehousePermanently,
  listStockBalances,
  adjustStockBalance,
  issueStockCart,
} from '../controllers/materialsCatalogController.js';
import {
  createMaterialRequest,
  updateMaterialRequest,
  listMaterialEmployees,
  listMaterialRequests,
  getMaterialRequest,
  reviewMaterialRequest,
  prepareMaterialRequest,
  dispatchMaterialRequest,
  requestWhatsappLink,
  listMaterialRequestsForApprovals,
  supplierApproveMaterialRequest,
  confirmReceipt,
  archiveMaterialRequest,
  openCustodiesSummary,
} from '../controllers/materialsRequestController.js';
import {
  listCustodies,
  getCustody,
  custodyWhatsappLink,
  submitCustodyReconciliation,
  listReconciliations,
  reviewReconciliation,
  reconciliationWhatsappLink,
  receiveReturnedMaterials,
  closeCustody,
  listReconciliationsForApprovals,
} from '../controllers/materialsCustodyController.js';
import {
  materialsReportsSummary,
  materialReportByProject,
  exportMaterialsExcel,
  exportMaterialsPdf,
  materialsReportWhatsappLink,
  exportRequestPdf,
} from '../controllers/materialsReportsController.js';
import { listProjectCustodies, getProjectCustody, closeProjectCustody, reopenProjectCustody, updateProjectCustodyItem } from '../controllers/projectCustodyController.js';

const materialsRoutes = Router();

/* ── Self-service routes: only requireAuth, no module permission gate ── */
/* These let the assigned preparer or requestedFor employee act on a request
   even if they don't hold a material-management permission. Each controller
   verifies ownership / assignment. */
materialsRoutes.patch('/requests/:id/confirm-receipt', requireAuth, confirmReceipt);
materialsRoutes.patch('/requests/:id/supplier-approve', requireAuth, supplierApproveMaterialRequest);
materialsRoutes.patch('/requests/:id/prepare', requireAuth, prepareMaterialRequest);

/* ── Module-level permission gate for all other routes ── */
const canAccessMaterialsModule = requireAnyPermission(
  Permission.MANAGE_MATERIAL_CATALOG,
  Permission.MANAGE_MATERIAL_INVENTORY,
  Permission.CREATE_MATERIAL_REQUESTS,
  Permission.REVIEW_MATERIAL_REQUESTS,
  Permission.PREPARE_MATERIAL_REQUESTS,
  Permission.DISPATCH_MATERIAL_REQUESTS,
  Permission.RECONCILE_MATERIAL_CUSTODY,
  Permission.RECONCILE_OTHERS_MATERIAL_CUSTODY,
  Permission.CLOSE_MATERIAL_CUSTODY,
  Permission.VIEW_MATERIAL_REPORTS,
  Permission.VIEW_PROJECT_CUSTODIES,
  Permission.ISSUE_PROJECT_CUSTODY,
  Permission.ADJUST_PROJECT_CUSTODY,
  Permission.CANCEL_PROJECT_CUSTODY_ITEM,
  Permission.RETURN_PROJECT_CUSTODY,
  Permission.TRANSFER_PROJECT_CUSTODY_TECHNICIAN,
  Permission.TRANSFER_PROJECT_CUSTODY_PROJECT,
  Permission.SETTLE_PROJECT_CUSTODY,
  Permission.CLOSE_PROJECT_CUSTODY,
  Permission.REOPEN_PROJECT_CUSTODY,
  Permission.VIEW_PROJECT_CUSTODY_COST,
  Permission.EXPORT_PROJECT_CUSTODIES,
  Permission.VIEW_PROJECT_CUSTODY_AUDIT,
);

materialsRoutes.use(requireAuth, canAccessMaterialsModule);

const productUpload = uploadDocumentMiddleware.fields([
  { name: 'image', maxCount: 1 },
  { name: 'attachments', maxCount: 10 },
]);

materialsRoutes.get('/catalog/categories', listMaterialCategories);
materialsRoutes.patch('/catalog/categories/:category', canManageMaterialCatalog, renameMaterialCategory);
materialsRoutes.delete('/catalog/categories/:category', canManageMaterialCatalog, deleteMaterialCategory);
materialsRoutes.get('/catalog/barcode/:barcode', getMaterialByBarcode);
materialsRoutes.get('/catalog', listMaterials);
materialsRoutes.post('/catalog', canManageMaterialCatalog, productUpload, createMaterial);
materialsRoutes.patch('/catalog/:id', canManageMaterialCatalog, productUpload, updateMaterial);

materialsRoutes.get('/warehouses', listWarehouses);
materialsRoutes.post('/warehouses', canManageMaterialInventory, createWarehouse);
materialsRoutes.patch('/warehouses/:id', canManageMaterialInventory, updateWarehouse);
materialsRoutes.delete('/warehouses/:id/permanent', canManageMaterialInventory, deleteWarehousePermanently);

materialsRoutes.get('/stock', listStockBalances);
materialsRoutes.post('/stock/adjust', canManageMaterialInventory, adjustStockBalance);
materialsRoutes.post('/stock/cart-issue', canManageMaterialInventory, issueStockCart);

materialsRoutes.get('/requests', listMaterialRequests);
materialsRoutes.get('/employees', listMaterialEmployees);
materialsRoutes.get('/approvals/requests/pending', canReviewMaterialRequests, listMaterialRequestsForApprovals);
materialsRoutes.post('/requests', canCreateMaterialRequests, createMaterialRequest);
materialsRoutes.get('/requests/:id', getMaterialRequest);
materialsRoutes.patch('/requests/:id', canCreateMaterialRequests, updateMaterialRequest);
materialsRoutes.patch(
  '/requests/:id/review',
  requireAnyPermission(Permission.REVIEW_MATERIAL_REQUESTS, Permission.MANAGE_MATERIAL_INVENTORY),
  reviewMaterialRequest,
);
materialsRoutes.patch(
  '/requests/:id/dispatch',
  requireAnyPermission(Permission.DISPATCH_MATERIAL_REQUESTS, Permission.MANAGE_MATERIAL_INVENTORY),
  dispatchMaterialRequest,
);
materialsRoutes.patch('/requests/:id/archive', canReviewMaterialRequests, archiveMaterialRequest);
materialsRoutes.post('/requests/:id/whatsapp-link', requestWhatsappLink);
materialsRoutes.get('/requests/:id/pdf', exportRequestPdf);

materialsRoutes.get('/open-custodies-summary', openCustodiesSummary);

materialsRoutes.get(
  '/project-custodies',
  requireAnyPermission(Permission.VIEW_PROJECT_CUSTODIES, Permission.MANAGE_PROJECTS, Permission.MANAGE_MATERIAL_INVENTORY),
  listProjectCustodies,
);
materialsRoutes.get(
  '/project-custodies/:projectId',
  requireAnyPermission(Permission.VIEW_PROJECT_CUSTODIES, Permission.MANAGE_PROJECTS, Permission.MANAGE_MATERIAL_INVENTORY),
  getProjectCustody,
);
materialsRoutes.patch('/project-custodies/:projectId/close', requireAnyPermission(Permission.CLOSE_MATERIAL_CUSTODY, Permission.CLOSE_PROJECT_CUSTODY), closeProjectCustody);
materialsRoutes.patch('/project-custodies/:projectId/reopen', requireAnyPermission(Permission.REOPEN_PROJECT_CUSTODY), reopenProjectCustody);
materialsRoutes.patch('/project-custodies/:projectId/custodies/:custodyId/items/:itemId', requireAnyPermission(Permission.MANAGE_MATERIAL_INVENTORY, Permission.ADJUST_PROJECT_CUSTODY, Permission.CANCEL_PROJECT_CUSTODY_ITEM, Permission.TRANSFER_PROJECT_CUSTODY_TECHNICIAN, Permission.TRANSFER_PROJECT_CUSTODY_PROJECT), updateProjectCustodyItem);

materialsRoutes.get('/custodies', listCustodies);
materialsRoutes.get('/custodies/:id', getCustody);
materialsRoutes.post('/custodies/:id/whatsapp-link', custodyWhatsappLink);
materialsRoutes.post(
  '/custodies/:id/reconcile',
  requireAnyPermission(
    Permission.RECONCILE_MATERIAL_CUSTODY,
    Permission.RECONCILE_OTHERS_MATERIAL_CUSTODY,
  ),
  submitCustodyReconciliation,
);
materialsRoutes.patch('/custodies/:id/close', canCloseMaterialCustody, closeCustody);

materialsRoutes.get('/reconciliations', listReconciliations);
materialsRoutes.get('/approvals/reconciliations/pending', canReviewMaterialRequests, listReconciliationsForApprovals);
materialsRoutes.patch(
  '/reconciliations/:id/review',
  requireAnyPermission(Permission.REVIEW_MATERIAL_REQUESTS, Permission.MANAGE_MATERIAL_INVENTORY),
  reviewReconciliation,
);
materialsRoutes.post(
  '/reconciliations/:id/returns',
  requireAnyPermission(Permission.DISPATCH_MATERIAL_REQUESTS, Permission.MANAGE_MATERIAL_INVENTORY),
  receiveReturnedMaterials,
);
materialsRoutes.post('/reconciliations/:id/whatsapp-link', reconciliationWhatsappLink);

materialsRoutes.get('/reports/summary', canViewMaterialReports, materialsReportsSummary);
materialsRoutes.get('/reports/project', canViewMaterialReports, materialReportByProject);
materialsRoutes.get('/reports/excel', canViewMaterialReports, exportMaterialsExcel);
materialsRoutes.get('/reports/pdf', canViewMaterialReports, exportMaterialsPdf);
materialsRoutes.post('/reports/whatsapp-link', canViewMaterialReports, materialsReportWhatsappLink);

export default materialsRoutes;
