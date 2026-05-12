import { Router } from 'express';
import {
  activateFieldInspectionDailyPlan,
  closeFieldInspectionTicket,
  completeFieldInspection,
  createFieldInspectionTicket,
  deleteFieldInspectionTicket,
  downloadFieldInspectionReport,
  getFieldInspectionTicket,
  listFieldInspectionMeta,
  listFieldInspectionTickets,
  saveFieldInspectionForm,
  sendFieldInspectionAppointment,
  sendFieldInspectionReport,
  startFieldInspection,
  updateFieldInspectionTicket,
} from '../controllers/fieldInspectionController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requireAnyPermission } from '../middlewares/authorizationMiddleware.js';
import { uploadFieldInspectionAttachmentsMiddleware } from '../middlewares/uploadMiddleware.js';
import { Permission } from '../../shared/constants.js';

const fieldInspectionsRoutes = Router();

fieldInspectionsRoutes.use(requireAuth);
fieldInspectionsRoutes.use(
  requireAnyPermission(
    Permission.VIEW_FIELD_INSPECTIONS,
    Permission.CREATE_FIELD_INSPECTIONS,
    Permission.MANAGE_FIELD_INSPECTIONS,
    Permission.HANDLE_FIELD_INSPECTIONS,
  ),
);

fieldInspectionsRoutes.get('/meta', listFieldInspectionMeta);
fieldInspectionsRoutes.get('/', listFieldInspectionTickets);
fieldInspectionsRoutes.post('/', createFieldInspectionTicket);
fieldInspectionsRoutes.get('/:id', getFieldInspectionTicket);
fieldInspectionsRoutes.delete('/:id', deleteFieldInspectionTicket);
fieldInspectionsRoutes.patch('/:id', updateFieldInspectionTicket);
fieldInspectionsRoutes.post('/:id/send-appointment', sendFieldInspectionAppointment);
fieldInspectionsRoutes.post('/:id/start', startFieldInspection);
fieldInspectionsRoutes.patch('/:id/form', uploadFieldInspectionAttachmentsMiddleware.array('attachments', 30), saveFieldInspectionForm);
fieldInspectionsRoutes.post('/:id/complete', completeFieldInspection);
fieldInspectionsRoutes.get('/:id/report/download', downloadFieldInspectionReport);
fieldInspectionsRoutes.post('/:id/send-report', sendFieldInspectionReport);
fieldInspectionsRoutes.post('/:id/activate-daily-plan', activateFieldInspectionDailyPlan);
fieldInspectionsRoutes.post('/:id/close', closeFieldInspectionTicket);

export default fieldInspectionsRoutes;
