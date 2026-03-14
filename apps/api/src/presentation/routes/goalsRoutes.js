import { Router } from 'express';
import {
  createGoal,
  updateGoal,
  deleteGoal,
  listGoals,
  goalsSummary,
} from '../controllers/goalController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const goalsRoutes = Router();

goalsRoutes.use(requireAuth);
goalsRoutes.get('/summary', goalsSummary);
goalsRoutes.get('/', listGoals);
goalsRoutes.post('/', createGoal);
goalsRoutes.patch('/:id', updateGoal);
goalsRoutes.delete('/:id', deleteGoal);

export default goalsRoutes;
