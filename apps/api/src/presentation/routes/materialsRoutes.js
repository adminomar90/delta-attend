import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  requireAnyPermission,
  canManageMaterialCatalog,
  canManageMaterialInventory,
  canCreateMaterialRequests,
  canReviewMaterialRequests,
  canPrepareMaterialRequests,
  canDispatchMaterialRequests,
  canReconcileMaterialCustody,
  canCloseMaterialCustody,
  canViewMaterialReports,
} from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import {
  listMaterials,
  createMaterial,
  updateMaterial,
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  listStockBalances,
  adjustStockBalance,
} from '../controllers/materialsCatalogController.js';
import {
  createMaterialRequest,
  listMaterialEmployees,
  listMaterialRequests,
  getMaterialRequest,
  reviewMaterialRequest,
  prepareMaterialRequest,
  dispatchMaterialRequest,
  requestWhatsappLink,
  listMaterialRequestsForApprovals,
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
} from '../controllers/materialsReportsController.js';

const materialsRoutes = Router();

const canAccessMaterialsModule = requireAnyPermission(
  Permission.MANAGE_MATERIAL_CATALOG,
  Permission.MANAGE_MATERIAL_INVENTORY,
  Permission.CREATE_MATERIAL_REQUESTS,
  Permission.REVIEW_MATERIAL_REQUESTS,
  Permission.PREPARE_MATERIAL_REQUESTS,
  Permission.DISPATCH_MATERIAL_REQUESTS,
  Permission.RECONCILE_MATERIAL_CUSTODY,
  Permission.CLOSE_MATERIAL_CUSTODY,
  Permission.VIEW_MATERIAL_REPORTS,
);

materialsRoutes.use(requireAuth, canAccessMaterialsModule);

materialsRoutes.get('/catalog', listMaterials);
materialsRoutes.post('/catalog', canManageMaterialCatalog, createMaterial);
materialsRoutes.patch('/catalog/:id', canManageMaterialCatalog, updateMaterial);

materialsRoutes.get('/warehouses', listWarehouses);
materialsRoutes.post('/warehouses', canManageMaterialInventory, createWarehouse);
materialsRoutes.patch('/warehouses/:id', canManageMaterialInventory, updateWarehouse);

materialsRoutes.get('/stock', listStockBalances);
materialsRoutes.post('/stock/adjust', canManageMaterialInventory, adjustStockBalance);

materialsRoutes.get('/requests', listMaterialRequests);
materialsRoutes.get('/employees', listMaterialEmployees);
materialsRoutes.get('/approvals/requests/pending', canReviewMaterialRequests, listMaterialRequestsForApprovals);
materialsRoutes.post('/requests', canCreateMaterialRequests, createMaterialRequest);
materialsRoutes.get('/requests/:id', getMaterialRequest);
materialsRoutes.patch('/requests/:id/review', canReviewMaterialRequests, reviewMaterialRequest);
materialsRoutes.patch('/requests/:id/prepare', canPrepareMaterialRequests, prepareMaterialRequest);
materialsRoutes.patch('/requests/:id/dispatch', canDispatchMaterialRequests, dispatchMaterialRequest);
materialsRoutes.post('/requests/:id/whatsapp-link', requestWhatsappLink);

materialsRoutes.get('/custodies', listCustodies);
materialsRoutes.get('/custodies/:id', getCustody);
materialsRoutes.post('/custodies/:id/whatsapp-link', custodyWhatsappLink);
materialsRoutes.post('/custodies/:id/reconcile', canReconcileMaterialCustody, submitCustodyReconciliation);
materialsRoutes.patch('/custodies/:id/close', canCloseMaterialCustody, closeCustody);

materialsRoutes.get('/reconciliations', listReconciliations);
materialsRoutes.get('/approvals/reconciliations/pending', canReviewMaterialRequests, listReconciliationsForApprovals);
materialsRoutes.patch('/reconciliations/:id/review', canReviewMaterialRequests, reviewReconciliation);
materialsRoutes.post('/reconciliations/:id/returns', canDispatchMaterialRequests, receiveReturnedMaterials);
materialsRoutes.post('/reconciliations/:id/whatsapp-link', reconciliationWhatsappLink);

materialsRoutes.get('/reports/summary', canViewMaterialReports, materialsReportsSummary);
materialsRoutes.get('/reports/project', canViewMaterialReports, materialReportByProject);
materialsRoutes.get('/reports/excel', canViewMaterialReports, exportMaterialsExcel);
materialsRoutes.get('/reports/pdf', canViewMaterialReports, exportMaterialsPdf);
materialsRoutes.post('/reports/whatsapp-link', canViewMaterialReports, materialsReportWhatsappLink);

export default materialsRoutes;
