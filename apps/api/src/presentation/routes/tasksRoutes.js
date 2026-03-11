import { Router } from 'express';
import {
  createTask,
  listTasks,
  updateTaskStatus,
  approveTask,
  getMyActivity,
} from '../controllers/taskController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  canApproveTasks,
  canManageTasks,
} from '../middlewares/authorizationMiddleware.js';

const tasksRoutes = Router();

tasksRoutes.use(requireAuth);

tasksRoutes.get('/', listTasks);
tasksRoutes.get('/my-activity', getMyActivity);
tasksRoutes.post('/', canManageTasks, createTask);
tasksRoutes.patch('/:id/status', updateTaskStatus);
tasksRoutes.patch('/:id/approve', canApproveTasks, approveTask);

export default tasksRoutes;
