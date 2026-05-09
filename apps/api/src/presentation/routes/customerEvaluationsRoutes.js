import { Router } from 'express';
import {
  createCustomerEvaluationLink,
  exportCustomerEvaluationsExcel,
  exportCustomerEvaluationsPdf,
  getPublicCustomerEvaluation,
  listCustomerEvaluations,
  reactivateCustomerEvaluation,
  submitPublicCustomerEvaluation,
} from '../controllers/customerEvaluationController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requireAnyPermission } from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';

const customerEvaluationsRoutes = Router();

customerEvaluationsRoutes.get('/public/:token', getPublicCustomerEvaluation);
customerEvaluationsRoutes.post('/public/:token', submitPublicCustomerEvaluation);

customerEvaluationsRoutes.use(requireAuth);
customerEvaluationsRoutes.use(
  requireAnyPermission(
    Permission.VIEW_CUSTOMER_EVALUATIONS,
    Permission.MANAGE_CUSTOMER_EVALUATIONS,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_EXECUTIVE_REPORTS,
    Permission.VIEW_COMPLETED_WORK_REPORTS,
    Permission.MANAGE_DAILY_WORK_PLANS,
  ),
);

customerEvaluationsRoutes.get('/', listCustomerEvaluations);
customerEvaluationsRoutes.get('/export/excel', exportCustomerEvaluationsExcel);
customerEvaluationsRoutes.get('/export/pdf', exportCustomerEvaluationsPdf);
customerEvaluationsRoutes.post('/links', createCustomerEvaluationLink);
customerEvaluationsRoutes.patch('/:id/reactivate', reactivateCustomerEvaluation);

export default customerEvaluationsRoutes;
