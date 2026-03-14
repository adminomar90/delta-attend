import { Router } from 'express';
import {
  login,
  verifyOtp,
  me,
  listUsers,
  createUser,
  updateUser,
  updateUserStatus,
  resetUserPassword,
  setUserPermissions,
  uploadAvatar,
  uploadMyAvatar,
  uploadEmployeeDocument,
  listEmployeeFiles,
  deleteUser,
  importUsers,
  createSuperAdmin,
  orgChart,
  listAvailablePermissions,
} from '../controllers/authController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  canManageUsers,
  canManageUserStatus,
  canResetUserPasswords,
  canManagePermissions,
  requireAnyPermission,
  requirePermission,
} from '../middlewares/authorizationMiddleware.js';
import { Permission } from '../../shared/constants.js';
import {
  uploadAvatarMiddleware,
  uploadDocumentMiddleware,
  uploadImportFileMiddleware,
} from '../middlewares/uploadMiddleware.js';

const authRoutes = Router();

authRoutes.post('/login', login);
authRoutes.post('/verify-otp', verifyOtp);
authRoutes.post('/admin/setup', createSuperAdmin);

authRoutes.get('/me', requireAuth, me);
authRoutes.post('/me/avatar', requireAuth, uploadAvatarMiddleware.single('file'), uploadMyAvatar);
authRoutes.get(
  '/org-chart',
  requireAuth,
  requireAnyPermission(Permission.MANAGE_USERS, Permission.MANAGE_TASKS, Permission.VIEW_EMPLOYEES_HIERARCHY),
  orgChart,
);
authRoutes.get('/permissions', requireAuth, listAvailablePermissions);

authRoutes.post('/users', requireAuth, canManageUsers, createUser);
authRoutes.post('/users/import', requireAuth, canManageUsers, uploadImportFileMiddleware.single('file'), importUsers);
authRoutes.get(
  '/users',
  requireAuth,
  requireAnyPermission(
    Permission.MANAGE_USERS,
    Permission.MANAGE_TASKS,
    Permission.VIEW_EMPLOYEES_HIERARCHY,
  ),
  listUsers,
);
authRoutes.patch('/users/:id', requireAuth, canManageUsers, updateUser);
authRoutes.patch('/users/:id/status', requireAuth, canManageUserStatus, updateUserStatus);
authRoutes.patch('/users/:id/reset-password', requireAuth, canResetUserPasswords, resetUserPassword);
authRoutes.patch('/users/:id/permissions', requireAuth, canManagePermissions, setUserPermissions);
authRoutes.delete('/users/:id', requireAuth, canManageUsers, deleteUser);
authRoutes.post('/users/:id/avatar', requireAuth, canManageUsers, uploadAvatarMiddleware.single('file'), uploadAvatar);
authRoutes.post('/users/:id/files', requireAuth, canManageUsers, uploadDocumentMiddleware.single('file'), uploadEmployeeDocument);
authRoutes.get('/users/:id/files', requireAuth, requirePermission(Permission.MANAGE_USERS), listEmployeeFiles);

export default authRoutes;
