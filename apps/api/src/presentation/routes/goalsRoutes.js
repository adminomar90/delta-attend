import { Router } from 'express';
import { createGoal, listGoals } from '../controllers/goalController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const goalsRoutes = Router();

goalsRoutes.use(requireAuth);
goalsRoutes.get('/', listGoals);
goalsRoutes.post('/', createGoal);

export default goalsRoutes;
