import { Router } from 'express';
import {
  createProject,
  listProjects,
  updateProject,
  approveProject,
  rejectProject,
} from '../controllers/projectController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  canApproveProjects,
  canManageProjects,
} from '../middlewares/authorizationMiddleware.js';

const projectsRoutes = Router();

projectsRoutes.use(requireAuth);
projectsRoutes.get('/', listProjects);
projectsRoutes.post('/', canManageProjects, createProject);
projectsRoutes.patch('/:id', canManageProjects, updateProject);
projectsRoutes.patch('/:id/approve', canApproveProjects, approveProject);
projectsRoutes.patch('/:id/reject', canApproveProjects, rejectProject);

export default projectsRoutes;
