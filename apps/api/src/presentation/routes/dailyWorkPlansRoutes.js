import { Router } from 'express';
import {
  archiveDailyWorkPlan,
  approveDailyWorkPlan,
  createDailyWorkPlan,
  deleteDailyWorkPlan,
  exportDailyWorkPlansExcel,
  exportDailyWorkPlansPdf,
  getDailyWorkPlanById,
  getDailyWorkPlanSummary,
  listDailyWorkPlanMeta,
  listDailyWorkPlans,
  postponeDailyWorkPlan,
  rolloverDailyWorkPlan,
  updateDailyWorkPlan,
  updateDailyWorkPlanProgress,
  updateDailyWorkPlanStatus,
  unarchiveDailyWorkPlan,
} from '../controllers/dailyWorkPlanController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  canApproveDailyWorkPlans,
  canCreateDailyWorkPlans,
  canExportDailyWorkPlans,
  canManageDailyWorkPlans,
  requireAnyPermission,
} from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import { uploadDailyWorkPlanAttachmentsMiddleware } from '../middlewares/uploadMiddleware.js';

const dailyWorkPlansRoutes = Router();

dailyWorkPlansRoutes.use(requireAuth);
dailyWorkPlansRoutes.use(
  requireAnyPermission(
    Permission.VIEW_DAILY_WORK_PLANS,
    Permission.CREATE_DAILY_WORK_PLANS,
    Permission.MANAGE_DAILY_WORK_PLANS,
    Permission.UPDATE_ASSIGNED_DAILY_WORK_PLANS,
    Permission.APPROVE_DAILY_WORK_PLANS,
    Permission.EXPORT_DAILY_WORK_PLANS,
  ),
);

dailyWorkPlansRoutes.get('/summary', getDailyWorkPlanSummary);
dailyWorkPlansRoutes.get('/meta', listDailyWorkPlanMeta);
dailyWorkPlansRoutes.get('/export/excel', canExportDailyWorkPlans, exportDailyWorkPlansExcel);
dailyWorkPlansRoutes.get('/export/pdf', canExportDailyWorkPlans, exportDailyWorkPlansPdf);
dailyWorkPlansRoutes.get('/', listDailyWorkPlans);
dailyWorkPlansRoutes.post('/', canCreateDailyWorkPlans, uploadDailyWorkPlanAttachmentsMiddleware.array('attachments', 20), createDailyWorkPlan);
dailyWorkPlansRoutes.get('/:id', getDailyWorkPlanById);
dailyWorkPlansRoutes.patch('/:id', canManageDailyWorkPlans, uploadDailyWorkPlanAttachmentsMiddleware.array('attachments', 20), updateDailyWorkPlan);
dailyWorkPlansRoutes.patch('/:id/status', uploadDailyWorkPlanAttachmentsMiddleware.array('attachments', 20), updateDailyWorkPlanStatus);
dailyWorkPlansRoutes.patch('/:id/progress', uploadDailyWorkPlanAttachmentsMiddleware.array('attachments', 20), updateDailyWorkPlanProgress);
dailyWorkPlansRoutes.post('/:id/postpone', uploadDailyWorkPlanAttachmentsMiddleware.array('attachments', 20), postponeDailyWorkPlan);
dailyWorkPlansRoutes.post('/:id/rollover', canManageDailyWorkPlans, rolloverDailyWorkPlan);
dailyWorkPlansRoutes.patch('/:id/approve', canApproveDailyWorkPlans, approveDailyWorkPlan);
dailyWorkPlansRoutes.patch('/:id/archive', archiveDailyWorkPlan);
dailyWorkPlansRoutes.patch('/:id/unarchive', unarchiveDailyWorkPlan);
dailyWorkPlansRoutes.delete('/:id', canManageDailyWorkPlans, deleteDailyWorkPlan);

export default dailyWorkPlansRoutes;
