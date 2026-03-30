import dayjs from 'dayjs';
import { TaskModel } from '../../infrastructure/db/models/TaskModel.js';
import { ProjectModel } from '../../infrastructure/db/models/ProjectModel.js';
import { WorkReportModel } from '../../infrastructure/db/models/WorkReportModel.js';
import { AttendanceModel } from '../../infrastructure/db/models/AttendanceModel.js';
import { MaterialRequestModel } from '../../infrastructure/db/models/MaterialRequestModel.js';
import { MaterialReconciliationModel } from '../../infrastructure/db/models/MaterialReconciliationModel.js';
import { FinancialDisbursementModel } from '../../infrastructure/db/models/FinancialDisbursementModel.js';
import { MaintenanceReportModel } from '../../infrastructure/db/models/MaintenanceReportModel.js';
import { MaintenancePlanRepository } from '../../infrastructure/db/repositories/MaintenancePlanRepository.js';
import { DailyWorkPlanRepository } from '../../infrastructure/db/repositories/DailyWorkPlanRepository.js';
import { UserModel } from '../../infrastructure/db/models/UserModel.js';
import { GoalModel, GoalStatus } from '../../infrastructure/db/models/GoalModel.js';
import { NotificationModel } from '../../infrastructure/db/models/NotificationModel.js';
import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { AttendanceRepository } from '../../infrastructure/db/repositories/AttendanceRepository.js';
import { summarizeMaintenancePlans } from '../../application/services/maintenancePlanService.js';
import {
  buildDailyProductivitySummary,
  buildDailyWorkPlanSummary,
  syncOverdueDailyWorkPlans,
} from '../../application/services/dailyWorkPlanService.js';
import { applyManagedScopeOnFilter, resolveManagedUserIds } from '../../shared/accessScope.js';
import { Permission, Roles, TaskStatus } from '../../shared/constants.js';
import { hasAnyPermission, hasPermission } from '../../shared/permissions.js';
import { asyncHandler } from '../../shared/errors.js';

const pointsLedgerRepository = new PointsLedgerRepository();
const userRepository = new UserRepository();
const attendanceRepository = new AttendanceRepository();
const maintenancePlanRepository = new MaintenancePlanRepository();
const dailyWorkPlanRepository = new DailyWorkPlanRepository();

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
  const canViewPeriodicMaintenance = hasAnyPermission(req.user, [
    Permission.VIEW_MAINTENANCE_PLANS,
    Permission.CREATE_MAINTENANCE_PLANS,
    Permission.MANAGE_MAINTENANCE_PLANS,
    Permission.REGISTER_MAINTENANCE_VISITS,
  ]);
  const canViewDailyWorkPlans = hasAnyPermission(req.user, [
    Permission.VIEW_DAILY_WORK_PLANS,
    Permission.CREATE_DAILY_WORK_PLANS,
    Permission.MANAGE_DAILY_WORK_PLANS,
    Permission.UPDATE_ASSIGNED_DAILY_WORK_PLANS,
    Permission.APPROVE_DAILY_WORK_PLANS,
  ]);
  const canSeeAllPeriodicMaintenance = req.user.role === Roles.GENERAL_MANAGER
    || hasPermission(req.user, Permission.CREATE_MAINTENANCE_PLANS)
    || hasPermission(req.user, Permission.MANAGE_MAINTENANCE_PLANS)
    || [Roles.PROJECT_MANAGER, Roles.ASSISTANT_PROJECT_MANAGER].includes(req.user.role);

  const directReportUserIds = req.user.role === Roles.GENERAL_MANAGER || !canApproveWorkReports
    ? []
    : await UserModel.find({
        manager: req.user.id,
        deletedAt: null,
        active: true,
      }).distinct('_id');

  const canSeeLeaderboard = hasPermission(req.user, Permission.VIEW_LEADERBOARD);
  const maintenancePlansFilter = canSeeAllPeriodicMaintenance
    ? {}
    : {
        $or: [
          { assignedEmployee: req.user.id },
          { createdBy: req.user.id },
        ],
      };
  const dailyWorkPlansFilter = Array.isArray(managedUserIds)
    ? {
        'assignees.user': { $in: managedUserIds },
      }
    : {};

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
  const maintenancePlansPromise = canViewPeriodicMaintenance
    ? maintenancePlanRepository.list(maintenancePlansFilter)
    : Promise.resolve([]);
  const dailyWorkPlansPromise = canViewDailyWorkPlans
    ? (async () => {
        await syncOverdueDailyWorkPlans({
          repository: dailyWorkPlanRepository,
          now: new Date(),
        });
        return dailyWorkPlanRepository.list(dailyWorkPlansFilter, { limit: 200 });
      })()
    : Promise.resolve([]);

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
    maintenancePlans,
    dailyWorkPlans,
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
    maintenancePlansPromise,
    dailyWorkPlansPromise,
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
  const maintenanceDueSummary = summarizeMaintenancePlans(maintenancePlans || [], {
    dueLimit: 5,
  });
  const dailyWorkPlansSummary = buildDailyWorkPlanSummary(dailyWorkPlans || [], {
    today: new Date(),
    featuredLimit: 5,
  });
  const dailyWorkProductivity = buildDailyProductivitySummary(dailyWorkPlans || []);

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
    maintenanceDue: {
      dueToday: maintenanceDueSummary.dueToday,
      overdue: maintenanceDueSummary.overdue,
      upcoming: maintenanceDueSummary.upcoming,
      featured: (maintenanceDueSummary.featuredDuePlans || []).map(({ plan, summary }) => ({
        id: String(plan._id || plan.id),
        customerName: plan.customerName || '',
        location: plan.location || '',
        maintenanceType: plan.maintenanceType || '',
        nextVisitDate: summary.nextVisitDate || null,
        nextVisitState: summary.nextVisitState || '',
          status: summary.status || plan.status || '',
        })),
    },
    dailyWorkPlans: {
      totalToday: dailyWorkPlansSummary.totalToday,
      completed: dailyWorkPlansSummary.completed,
      inProgress: dailyWorkPlansSummary.inProgress,
      overdue: dailyWorkPlansSummary.overdue,
      postponed: dailyWorkPlansSummary.postponed,
      pendingApproval: dailyWorkPlansSummary.pendingApproval,
      featured: (dailyWorkPlansSummary.featuredPlans || []).map((plan) => ({
        id: String(plan._id || plan.id),
        title: plan.title || '',
        customerName: plan.customerName || '',
        projectName: plan.project?.name || plan.projectNameSnapshot || '',
        location: plan.location || '',
        planDate: plan.planDate || null,
        status: plan.status || '',
        priority: plan.priority || '',
        progressPercent: Number(plan.progressPercent || 0),
        assigneesLabel: (plan.assignees || [])
          .map((item) => item.user?.fullName || '')
          .filter(Boolean)
          .join('، '),
      })),
      topPerformers: dailyWorkProductivity.slice(0, 5),
      delayedEmployees: dailyWorkProductivity
        .filter((item) => item.overdueAssignments > 0)
        .slice(0, 5),
    },
    leaderboard: canSeeLeaderboard
      ? leaderboard.map((item, index) => ({ rank: index + 1, ...item }))
      : [],
  });
});
