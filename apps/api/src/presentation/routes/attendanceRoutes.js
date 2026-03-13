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
import {
  canApproveTasks,
  canViewAttendanceMonitor,
} from '../middlewares/authorizationMiddleware.js';

const attendanceRoutes = Router();

attendanceRoutes.use(requireAuth);
attendanceRoutes.get('/meta', attendanceMeta);
attendanceRoutes.get('/history', attendanceHistory);
attendanceRoutes.post('/check-in', checkIn);
attendanceRoutes.post('/check-out', checkOut);
attendanceRoutes.get('/approvals/pending', canApproveTasks, attendancePendingApprovals);
attendanceRoutes.patch('/:id/approve', canApproveTasks, approveAttendance);
attendanceRoutes.patch('/:id/reject', canApproveTasks, rejectAttendance);
attendanceRoutes.get('/admin/overview', canViewAttendanceMonitor, attendanceAdminOverview);
attendanceRoutes.get('/admin/export/excel', canViewAttendanceMonitor, attendanceAdminExportExcel);
attendanceRoutes.get('/admin/export/pdf', canViewAttendanceMonitor, attendanceAdminExportPdf);

export default attendanceRoutes;
