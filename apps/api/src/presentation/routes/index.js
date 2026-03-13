import { Router } from 'express';
import authRoutes from './authRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import tasksRoutes from './tasksRoutes.js';
import projectsRoutes from './projectsRoutes.js';
import goalsRoutes from './goalsRoutes.js';
import gamificationRoutes from './gamificationRoutes.js';
import reportsRoutes from './reportsRoutes.js';
import auditRoutes from './auditRoutes.js';
import notificationsRoutes from './notificationsRoutes.js';
import attendanceRoutes from './attendanceRoutes.js';
import workReportsRoutes from './workReportsRoutes.js';
import materialsRoutes from './materialsRoutes.js';
import approvalHistoryRoutes from './approvalHistoryRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/tasks', tasksRoutes);
router.use('/projects', projectsRoutes);
router.use('/goals', goalsRoutes);
router.use('/gamification', gamificationRoutes);
router.use('/reports', reportsRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/work-reports', workReportsRoutes);
router.use('/materials', materialsRoutes);
router.use('/approval-history', approvalHistoryRoutes);

export default router;
