import { Router } from 'express';
import {
  approveCustomerFormRequest,
  cancelCustomerFormRequest,
  createCustomerFormLink,
  getCustomerFormRequest,
  getPublicCustomerForm,
  listCustomerFormRequests,
  rejectCustomerFormRequest,
  submitPublicCustomerForm,
  updateCustomerFormRequest,
} from '../controllers/customerFormController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { canCreateCustomers, canManageCustomers, requireAnyPermission } from '../middlewares/authorizationMiddleware.js';
import { uploadDocumentMiddleware } from '../middlewares/uploadMiddleware.js';
import { Permission } from '../../shared/constants.js';

const customerFormsRoutes = Router();

customerFormsRoutes.get('/public/:token', getPublicCustomerForm);
customerFormsRoutes.post('/public/:token', uploadDocumentMiddleware.array('attachments', 20), submitPublicCustomerForm);

customerFormsRoutes.use(requireAuth);
customerFormsRoutes.use(
  requireAnyPermission(Permission.VIEW_CUSTOMERS, Permission.CREATE_CUSTOMERS, Permission.MANAGE_CUSTOMERS),
);

customerFormsRoutes.get('/', listCustomerFormRequests);
customerFormsRoutes.post('/links', canCreateCustomers, createCustomerFormLink);
customerFormsRoutes.get('/:id', getCustomerFormRequest);
customerFormsRoutes.patch('/:id', canManageCustomers, updateCustomerFormRequest);
customerFormsRoutes.patch('/:id/cancel', canManageCustomers, cancelCustomerFormRequest);
customerFormsRoutes.patch('/:id/reject', canManageCustomers, rejectCustomerFormRequest);
customerFormsRoutes.post('/:id/approve', canManageCustomers, approveCustomerFormRequest);

export default customerFormsRoutes;
