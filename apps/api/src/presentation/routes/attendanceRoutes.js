import { Router } from 'express';
import {
  attendanceMeta,
  attendanceHistory,
  checkIn,
  checkOut,
  attendanceAdminOverview,
  attendanceAdminExportExcel,
  attendanceAdminExportPdf,
  attendancePendingApprovals,
  approveAttendance,
  rejectAttendance,
} from '../controllers/attendanceController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { canApproveTasks, canViewAnalytics } from '../middlewares/authorizationMiddleware.js';

const attendanceRoutes = Router();

attendanceRoutes.use(requireAuth);
attendanceRoutes.get('/meta', attendanceMeta);
attendanceRoutes.get('/history', attendanceHistory);
attendanceRoutes.post('/check-in', checkIn);
attendanceRoutes.post('/check-out', checkOut);
attendanceRoutes.get('/approvals/pending', canApproveTasks, attendancePendingApprovals);
attendanceRoutes.patch('/:id/approve', canApproveTasks, approveAttendance);
attendanceRoutes.patch('/:id/reject', canApproveTasks, rejectAttendance);
attendanceRoutes.get('/admin/overview', canViewAnalytics, attendanceAdminOverview);
attendanceRoutes.get('/admin/export/excel', canViewAnalytics, attendanceAdminExportExcel);
attendanceRoutes.get('/admin/export/pdf', canViewAnalytics, attendanceAdminExportPdf);

export default attendanceRoutes;
