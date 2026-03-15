import dayjs from 'dayjs';
import { TaskModel } from '../../infrastructure/db/models/TaskModel.js';
import { ProjectModel } from '../../infrastructure/db/models/ProjectModel.js';
import { WorkReportModel } from '../../infrastructure/db/models/WorkReportModel.js';
import { AttendanceModel } from '../../infrastructure/db/models/AttendanceModel.js';
import { MaterialRequestModel } from '../../infrastructure/db/models/MaterialRequestModel.js';
import { MaterialReconciliationModel } from '../../infrastructure/db/models/MaterialReconciliationModel.js';
import { FinancialDisbursementModel } from '../../infrastructure/db/models/FinancialDisbursementModel.js';
import { MaintenanceReportModel } from '../../infrastructure/db/models/MaintenanceReportModel.js';
import { UserModel } from '../../infrastructure/db/models/UserModel.js';
import { GoalModel, GoalStatus } from '../../infrastructure/db/models/GoalModel.js';
import { NotificationModel } from '../../infrastructure/db/models/NotificationModel.js';
import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { AttendanceRepository } from '../../infrastructure/db/repositories/AttendanceRepository.js';
import { applyManagedScopeOnFilter, resolveManagedUserIds } from '../../shared/accessScope.js';
import { Permission, Roles, TaskStatus } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';
import { asyncHandler } from '../../shared/errors.js';

const pointsLedgerRepository = new PointsLedgerRepository();
const userRepository = new UserRepository();
const attendanceRepository = new AttendanceRepository();

export const dashboardSummary = asyncHandler(async (req, res) => {
  const taskFilter = {};
  const goalFilter = {};
  const userId = String(req.user.id);
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  applyManagedScopeOnFilter({
    filter: taskFilter,
    managedUserIds,
    field: 'assignee',
  });

  if (Array.isArray(managedUserIds)) {
    goalFilter.user = { $in: managedUserIds };
  }

  goalFilter.deletedAt = null;
  goalFilter.status = { $in: [GoalStatus.ACTIVE, GoalStatus.ACHIEVED, GoalStatus.EXPIRED] };

  const canApproveTasks = hasPermission(req.user, Permission.APPROVE_TASKS);
  const canApproveProjects = hasPermission(req.user, Permission.APPROVE_PROJECTS);
  const canReviewMaterials = hasPermission(req.user, Permission.REVIEW_MATERIAL_REQUESTS);
  const canReviewMaintenanceReports = hasPermission(req.user, Permission.REVIEW_MAINTENANCE_REPORTS);
  const canReviewFinancialDisbursements = hasPermission(req.user, Permission.REVIEW_FINANCIAL_DISBURSEMENTS);
  const canApproveWorkReports = canApproveTasks || hasPermission(req.user, Permission.VIEW_TEAM_WORK_REPORTS);

  const directReportUserIds = req.user.role === Roles.GENERAL_MANAGER || !canApproveWorkReports
    ? []
    : await UserModel.find({
        manager: req.user.id,
        deletedAt: null,
        active: true,
      }).distinct('_id');

  const canSeeLeaderboard = hasPermission(req.user, Permission.VIEW_LEADERBOARD);

  const taskPendingApprovalsPromise = canApproveTasks
    ? TaskModel.countDocuments({
        ...taskFilter,
        status: TaskStatus.SUBMITTED,
        'approvalTrail.approver': { $ne: req.user.id },
      })
    : Promise.resolve(0);

  const workReportPendingApprovalsPromise = canApproveWorkReports
    ? (req.user.role === Roles.GENERAL_MANAGER
      ? WorkReportModel.countDocuments({
          status: 'SUBMITTED',
          user: { $ne: req.user.id },
        })
      : (directReportUserIds.length
        ? WorkReportModel.countDocuments({
            status: 'SUBMITTED',
            user: {
              $in: directReportUserIds,
              $ne: req.user.id,
            },
          })
        : Promise.resolve(0)))
    : Promise.resolve(0);

  const projectPendingApprovalsPromise = canApproveProjects
    ? ProjectModel.countDocuments({
        status: 'PENDING_APPROVAL',
        requiredApprovalRoles: req.user.role,
        'approvalTrail.approver': { $ne: req.user.id },
      })
    : Promise.resolve(0);

  const attendanceApprovalFilter = {
    status: 'CLOSED',
    approvalStatus: 'PENDING',
  };
  if (Array.isArray(managedUserIds)) {
    attendanceApprovalFilter.user = {
      $in: managedUserIds.filter((id) => String(id) !== userId),
    };
  } else {
    attendanceApprovalFilter.user = { $ne: req.user.id };
  }
  const attendancePendingApprovalsPromise = canApproveTasks
    ? AttendanceModel.countDocuments(attendanceApprovalFilter)
    : Promise.resolve(0);

  const materialRequestApprovalsPromise = (() => {
    if (!canReviewMaterials) {
      return Promise.resolve(0);
    }

    const filter = {
      status: { $in: ['NEW', 'UNDER_REVIEW'] },
      requestedBy: { $ne: req.user.id },
    };

    if (Array.isArray(managedUserIds)) {
      filter.$or = [
        { requestedBy: { $in: managedUserIds } },
        { requestedFor: { $in: managedUserIds } },
        { assignedPreparer: { $in: managedUserIds } },
      ];
    }

    return MaterialRequestModel.countDocuments(filter);
  })();

  const materialReconciliationApprovalsPromise = (() => {
    if (!canReviewMaterials) {
      return Promise.resolve(0);
    }

    const filter = {
      status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] },
    };

    if (Array.isArray(managedUserIds)) {
      filter.$or = [
        { submittedBy: { $in: managedUserIds } },
        { reviewedBy: { $in: managedUserIds } },
      ];
    }

    return MaterialReconciliationModel.countDocuments(filter);
  })();

  const maintenancePendingApprovalsPromise = canReviewMaintenanceReports
    ? MaintenanceReportModel.countDocuments({
        status: 'PENDING_MANAGER_APPROVAL',
        managerReviewer: req.user.id,
      })
    : Promise.resolve(0);

  const financialPendingApprovalsPromise = (() => {
    if (!canReviewFinancialDisbursements) {
      return Promise.resolve(0);
    }

    const pendingFilters = [
      {
        status: 'PENDING_PROJECT_MANAGER_APPROVAL',
        projectManagerReviewer: req.user.id,
      },
      {
        status: 'PENDING_FINANCIAL_MANAGER_APPROVAL',
        financialManagerReviewer: req.user.id,
      },
      req.user.role === Roles.GENERAL_MANAGER
        ? { status: 'PENDING_GENERAL_MANAGER_APPROVAL' }
        : {
            status: 'PENDING_GENERAL_MANAGER_APPROVAL',
            generalManagerReviewer: req.user.id,
          },
    ];

    return FinancialDisbursementModel.countDocuments({ $or: pendingFilters });
  })();

  const [
    totalTasks,
    taskPendingApprovals,
    workReportPendingApprovals,
    projectPendingApprovals,
    attendancePendingApprovals,
    materialRequestPendingApprovals,
    materialReconciliationPendingApprovals,
    maintenancePendingApprovals,
    financialPendingApprovals,
    inProgress,
    approvedTasks,
    activeProjects,
    goals,
    unreadNotifications,
    leaderboard,
  ] = await Promise.all([
    TaskModel.countDocuments(taskFilter),
    taskPendingApprovalsPromise,
    workReportPendingApprovalsPromise,
    projectPendingApprovalsPromise,
    attendancePendingApprovalsPromise,
    materialRequestApprovalsPromise,
    materialReconciliationApprovalsPromise,
    maintenancePendingApprovalsPromise,
    financialPendingApprovalsPromise,
    TaskModel.countDocuments({ ...taskFilter, status: TaskStatus.IN_PROGRESS }),
    TaskModel.countDocuments({ ...taskFilter, status: TaskStatus.APPROVED }),
    ProjectModel.countDocuments({ status: 'ACTIVE' }),
    GoalModel.find(goalFilter).sort({ endDate: 1 }).limit(6).populate('user', 'fullName level pointsTotal'),
    NotificationModel.countDocuments({ user: req.user.id, readAt: null }),
    canSeeLeaderboard
      ? pointsLedgerRepository.leaderboard({
          startDate: dayjs().startOf('month').toDate(),
          endDate: dayjs().endOf('month').toDate(),
          limit: 10,
          userIds: managedUserIds,
        })
      : [],
  ]);

  const pendingApprovals = Number(taskPendingApprovals || 0)
    + Number(workReportPendingApprovals || 0)
    + Number(projectPendingApprovals || 0)
    + Number(attendancePendingApprovals || 0)
    + Number(materialRequestPendingApprovals || 0)
    + Number(materialReconciliationPendingApprovals || 0)
    + Number(maintenancePendingApprovals || 0)
    + Number(financialPendingApprovals || 0);

  const attendanceAggregates = await attendanceRepository.aggregateByUserForDateRange({
    from: dayjs().startOf('day').toDate(),
    to: dayjs().endOf('day').toDate(),
    userIds: managedUserIds,
  });

  const taskStatusBreakdown = await TaskModel.aggregate([
    { $match: taskFilter },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const attendanceSummary = attendanceAggregates.reduce(
    (acc, item) => {
      const sessionsCount = Number(item.sessionsCount || 0);
      const openSessions = Number(item.openSessions || 0);
      const closedSessions = Number(item.closedSessions || 0);
      const workedMinutes = Number(item.workedMinutes || 0);

      acc.employeesWithAttendance += sessionsCount > 0 ? 1 : 0;
      acc.checkedInNow += openSessions > 0 ? 1 : 0;
      acc.checkedOutToday += openSessions === 0 && closedSessions > 0 ? 1 : 0;
      acc.openSessions += openSessions;
      acc.closedSessions += closedSessions;
      acc.totalWorkedMinutes += workedMinutes;

      return acc;
    },
    {
      employeesWithAttendance: 0,
      checkedInNow: 0,
      checkedOutToday: 0,
      openSessions: 0,
      closedSessions: 0,
      totalWorkedMinutes: 0,
    },
  );

  res.json({
    summary: {
      totalTasks,
      pendingApprovals,
      inProgress,
      approvedTasks,
      activeProjects,
      unreadNotifications,
    },
    attendance: {
      ...attendanceSummary,
      totalWorkedHours: Number((attendanceSummary.totalWorkedMinutes / 60).toFixed(2)),
    },
    taskStatusBreakdown,
    goals,
    leaderboard: canSeeLeaderboard
      ? leaderboard.map((item, index) => ({ rank: index + 1, ...item }))
      : [],
  });
});
