import { Router } from 'express';
import {
  createProject,
  listProjects,
  updateProject,
  archiveProject,
  listProjectCustomers,
  listProjectDailyWorkPlans,
} from '../controllers/projectController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requireAnyPermission } from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';

const projectsRoutes = Router();

projectsRoutes.use(requireAuth);
projectsRoutes.get('/', listProjects);
const canChangeProjects = requireAnyPermission(Permission.MANAGE_PROJECTS, Permission.MANAGE_MATERIAL_INVENTORY, Permission.ADD_PROJECT_FROM_WAREHOUSE);
projectsRoutes.get('/customers/options', canChangeProjects, listProjectCustomers);
projectsRoutes.get(
  '/:id/daily-work-plans',
  requireAnyPermission(Permission.VIEW_DAILY_WORK_PLANS, Permission.MANAGE_DAILY_WORK_PLANS, Permission.MANAGE_PROJECTS, Permission.MANAGE_MATERIAL_INVENTORY),
  listProjectDailyWorkPlans,
);
projectsRoutes.post('/', canChangeProjects, createProject);
projectsRoutes.patch('/:id', canChangeProjects, updateProject);
projectsRoutes.delete('/:id', canChangeProjects, archiveProject);

export default projectsRoutes;
