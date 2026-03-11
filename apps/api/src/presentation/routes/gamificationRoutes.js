import { Router } from 'express';
import {
  leaderboard,
  myGamificationState,
  policies,
  listOperationRules,
  upsertOperationRules,
  listOperationEvents,
  grantPointsByOperation,
  grantManualPoints,
  deductManualPoints,
  overrideUserLevel,
} from '../controllers/gamificationController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { canManageGamification } from '../middlewares/authorizationMiddleware.js';

const gamificationRoutes = Router();

gamificationRoutes.use(requireAuth);
gamificationRoutes.get('/leaderboard', leaderboard);
gamificationRoutes.get('/me', myGamificationState);
gamificationRoutes.get('/policies', policies);

gamificationRoutes.get('/admin/operation-rules', canManageGamification, listOperationRules);
gamificationRoutes.put('/admin/operation-rules', canManageGamification, upsertOperationRules);
gamificationRoutes.get('/admin/operations', canManageGamification, listOperationEvents);
gamificationRoutes.post('/admin/operations/:id/grant', canManageGamification, grantPointsByOperation);
gamificationRoutes.post('/admin/manual-grants', canManageGamification, grantManualPoints);
gamificationRoutes.post('/admin/manual-deductions', canManageGamification, deductManualPoints);
gamificationRoutes.post('/admin/override-level', canManageGamification, overrideUserLevel);

export default gamificationRoutes;
