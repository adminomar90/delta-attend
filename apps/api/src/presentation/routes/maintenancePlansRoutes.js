import { Router } from 'express';
import {
  createMaintenancePlan,
  exportMaintenanceVisitPdf,
  getMaintenancePlan,
  listMaintenancePlanTechnicians,
  listMaintenancePlans,
  listMaintenanceVisits,
  maintenanceVisitWhatsappLink,
  registerMaintenanceVisit,
  updateMaintenancePlan,
  updateMaintenancePlanStatus,
} from '../controllers/maintenancePlanController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requireAnyPermission } from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import { uploadWorkReportImagesMiddleware } from '../middlewares/uploadMiddleware.js';

const maintenancePlansRoutes = Router();

maintenancePlansRoutes.use(requireAuth);
maintenancePlansRoutes.use(
  requireAnyPermission(
    Permission.VIEW_MAINTENANCE_PLANS,
    Permission.CREATE_MAINTENANCE_PLANS,
    Permission.MANAGE_MAINTENANCE_PLANS,
    Permission.REGISTER_MAINTENANCE_VISITS,
  ),
);

maintenancePlansRoutes.get('/technicians', listMaintenancePlanTechnicians);
maintenancePlansRoutes.get('/visits', listMaintenanceVisits);
maintenancePlansRoutes.get('/visits/:visitId/pdf', exportMaintenanceVisitPdf);
maintenancePlansRoutes.post('/visits/:visitId/whatsapp-link', maintenanceVisitWhatsappLink);
maintenancePlansRoutes.get('/', listMaintenancePlans);
maintenancePlansRoutes.post('/', createMaintenancePlan);
maintenancePlansRoutes.get('/:id', getMaintenancePlan);
maintenancePlansRoutes.patch('/:id', updateMaintenancePlan);
maintenancePlansRoutes.patch('/:id/status', updateMaintenancePlanStatus);
maintenancePlansRoutes.post(
  '/:id/visits',
  uploadWorkReportImagesMiddleware.array('images', 20),
  registerMaintenanceVisit,
);

export default maintenancePlansRoutes;
