import dayjs from 'dayjs';
import { TaskModel } from '../../infrastructure/db/models/TaskModel.js';
import { ProjectModel } from '../../infrastructure/db/models/ProjectModel.js';
import { GoalModel } from '../../infrastructure/db/models/GoalModel.js';
import { NotificationModel } from '../../infrastructure/db/models/NotificationModel.js';
import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { AttendanceRepository } from '../../infrastructure/db/repositories/AttendanceRepository.js';
import { applyManagedScopeOnFilter, resolveManagedUserIds } from '../../shared/accessScope.js';
import { Permission, TaskStatus } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';
import { asyncHandler } from '../../shared/errors.js';

const pointsLedgerRepository = new PointsLedgerRepository();
const userRepository = new UserRepository();
const attendanceRepository = new AttendanceRepository();

export const dashboardSummary = asyncHandler(async (req, res) => {
  const taskFilter = {};
  const goalFilter = {};
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

  const canSeeLeaderboard = hasPermission(req.user, Permission.VIEW_LEADERBOARD);

  const [
    totalTasks,
    pendingApprovals,
    inProgress,
    approvedTasks,
    activeProjects,
    goals,
    unreadNotifications,
    leaderboard,
  ] = await Promise.all([
    TaskModel.countDocuments(taskFilter),
    TaskModel.countDocuments({ ...taskFilter, status: TaskStatus.SUBMITTED }),
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
