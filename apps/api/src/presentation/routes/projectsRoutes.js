import { Router } from 'express';
import {
  createProject,
  listProjects,
  updateProject,
  archiveProject,
  exportProjectWarehouseMaterialsExcel,
  deleteProjectDocument,
  listProjectCustomers,
  listProjectDailyWorkPlans,
  listProjectDocuments,
  listProjectWarehouseMaterials,
  uploadProjectDocuments,
  updateProjectDepartments,
  updateProjectSupervisors,
  updateProjectTeam,
} from '../controllers/projectController.js';
import {
  archiveProjectStage,
  createProjectStage,
  duplicateProjectStage,
  listProjectStages,
  reorderProjectStages,
  updateProjectStage,
} from '../controllers/projectStageController.js';
import {
  archiveProjectTask,
  createProjectTask,
  listProjectTasks,
  updateProjectTask,
} from '../controllers/projectTaskController.js';
import {
  createProjectInvoice,
  exportProjectInvoicePdf,
  listProjectInvoices,
  updateProjectInvoice,
} from '../controllers/projectInvoiceController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requireAnyPermission } from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import { uploadDocumentMiddleware } from '../middlewares/uploadMiddleware.js';

const projectsRoutes = Router();

projectsRoutes.use(requireAuth);
projectsRoutes.get('/', listProjects);
const canChangeProjects = requireAnyPermission(Permission.MANAGE_PROJECTS, Permission.MANAGE_MATERIAL_INVENTORY, Permission.ADD_PROJECT_FROM_WAREHOUSE);
const canViewProjectDashboard = requireAnyPermission(
  Permission.VIEW_PROJECT_DASHBOARD,
  Permission.MANAGE_PROJECTS,
  Permission.MANAGE_PROJECT_STAGES,
  Permission.CREATE_DAILY_WORK_PLANS,
  Permission.MANAGE_DAILY_WORK_PLANS,
  Permission.MANAGE_MATERIAL_INVENTORY,
  Permission.ADD_PROJECT_FROM_WAREHOUSE,
  Permission.VIEW_FINANCIAL_REPORTS,
  Permission.VIEW_ALL_FINANCIAL_DISBURSEMENTS,
  Permission.VIEW_SUPPLIER_FINANCIALS,
);
const canManageProjectStages = requireAnyPermission(Permission.MANAGE_PROJECTS, Permission.MANAGE_PROJECT_STAGES);
const canManageProjectTasks = requireAnyPermission(Permission.MANAGE_PROJECTS, Permission.MANAGE_TASKS);
const canManageProjectInvoices = requireAnyPermission(Permission.MANAGE_PROJECTS, Permission.VIEW_SUPPLIER_FINANCIALS, Permission.VIEW_FINANCIAL_REPORTS);
projectsRoutes.get('/customers/options', canChangeProjects, listProjectCustomers);
projectsRoutes.get('/:id/stages', canViewProjectDashboard, listProjectStages);
projectsRoutes.post('/:id/stages', canManageProjectStages, createProjectStage);
projectsRoutes.patch('/:id/stages/reorder', canManageProjectStages, reorderProjectStages);
projectsRoutes.patch('/:id/stages/:stageId', canManageProjectStages, updateProjectStage);
projectsRoutes.post('/:id/stages/:stageId/duplicate', canManageProjectStages, duplicateProjectStage);
projectsRoutes.delete('/:id/stages/:stageId', canManageProjectStages, archiveProjectStage);
projectsRoutes.get('/:id/tasks', canViewProjectDashboard, listProjectTasks);
projectsRoutes.post('/:id/tasks', canManageProjectTasks, createProjectTask);
projectsRoutes.patch('/:id/tasks/:taskId', canManageProjectTasks, updateProjectTask);
projectsRoutes.delete('/:id/tasks/:taskId', canManageProjectTasks, archiveProjectTask);
projectsRoutes.get('/:id/warehouse/materials', canViewProjectDashboard, listProjectWarehouseMaterials);
projectsRoutes.get('/:id/warehouse/materials/export/excel', canViewProjectDashboard, exportProjectWarehouseMaterialsExcel);
projectsRoutes.get('/:id/documents', canViewProjectDashboard, listProjectDocuments);
projectsRoutes.post('/:id/documents', canChangeProjects, uploadDocumentMiddleware.array('documents', 30), uploadProjectDocuments);
projectsRoutes.delete('/:id/documents/:documentId', canChangeProjects, deleteProjectDocument);
projectsRoutes.get('/:id/invoices', canViewProjectDashboard, listProjectInvoices);
projectsRoutes.post('/:id/invoices', canManageProjectInvoices, uploadDocumentMiddleware.single('originalInvoice'), createProjectInvoice);
projectsRoutes.get('/:id/invoices/:invoiceId/pdf', canViewProjectDashboard, exportProjectInvoicePdf);
projectsRoutes.patch('/:id/invoices/:invoiceId', canManageProjectInvoices, uploadDocumentMiddleware.single('originalInvoice'), updateProjectInvoice);
projectsRoutes.patch('/:id/team', canChangeProjects, updateProjectTeam);
projectsRoutes.patch('/:id/departments', canChangeProjects, updateProjectDepartments);
projectsRoutes.patch('/:id/supervisors', canChangeProjects, updateProjectSupervisors);
projectsRoutes.get(
  '/:id/daily-work-plans',
  requireAnyPermission(Permission.VIEW_DAILY_WORK_PLANS, Permission.MANAGE_DAILY_WORK_PLANS, Permission.MANAGE_PROJECTS, Permission.MANAGE_MATERIAL_INVENTORY),
  listProjectDailyWorkPlans,
);
projectsRoutes.post('/', canChangeProjects, createProject);
projectsRoutes.patch('/:id', canChangeProjects, updateProject);
projectsRoutes.delete('/:id', canChangeProjects, archiveProject);

export default projectsRoutes;
