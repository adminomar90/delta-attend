import { Router } from 'express';
import { dashboardSummary } from '../controllers/dashboardController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const dashboardRoutes = Router();

dashboardRoutes.use(requireAuth);
dashboardRoutes.get('/summary', dashboardSummary);

export default dashboardRoutes;
