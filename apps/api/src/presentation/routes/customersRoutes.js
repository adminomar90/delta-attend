import { Router } from 'express';
import {
  archiveCustomer,
  createCustomer,
  getCustomerById,
  listCustomers,
  unarchiveCustomer,
  updateCustomer,
} from '../controllers/customerController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  canCreateCustomers,
  canManageCustomers,
  requireAnyPermission,
} from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import { uploadDocumentMiddleware } from '../middlewares/uploadMiddleware.js';

const customersRoutes = Router();

customersRoutes.use(requireAuth);
customersRoutes.use(
  requireAnyPermission(
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_CUSTOMERS,
    Permission.MANAGE_CUSTOMERS,
    Permission.VIEW_CUSTOMER_FINANCIAL_INFO,
  ),
);

customersRoutes.get('/', listCustomers);
customersRoutes.post('/', canCreateCustomers, uploadDocumentMiddleware.array('attachments', 20), createCustomer);
customersRoutes.get('/:id', getCustomerById);
customersRoutes.patch('/:id', canManageCustomers, uploadDocumentMiddleware.array('attachments', 20), updateCustomer);
customersRoutes.patch('/:id/archive', canManageCustomers, archiveCustomer);
customersRoutes.patch('/:id/unarchive', canManageCustomers, unarchiveCustomer);

export default customersRoutes;
