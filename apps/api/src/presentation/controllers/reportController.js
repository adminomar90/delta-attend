import dayjs from 'dayjs';
import { TaskRepository } from '../../infrastructure/db/repositories/TaskRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { buildTasksExcelBuffer } from '../../infrastructure/reports/excelReportBuilder.js';
import { buildTasksPdfBuffer } from '../../infrastructure/reports/pdfReportBuilder.js';
import { applyManagedScopeOnFilter, resolveManagedUserIds } from '../../shared/accessScope.js';
import { asyncHandler } from '../../shared/errors.js';

const taskRepository = new TaskRepository();
const userRepository = new UserRepository();

const resolveDateRange = (query) => {
  const from = query.from ? dayjs(query.from).startOf('day') : dayjs().startOf('month');
  const to = query.to ? dayjs(query.to).endOf('day') : dayjs().endOf('month');

  return {
    from: from.toDate(),
    to: to.toDate(),
  };
};

const loadTasksForReport = async (query, user) => {
  const { from, to } = resolveDateRange(query);
  const filter = {
    createdAt: {
      $gte: from,
      $lte: to,
    },
  };

  if (query.project) {
    filter.project = query.project;
  }

  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: user.id,
    actorRole: user.role,
  });

  applyManagedScopeOnFilter({
    filter,
    managedUserIds,
    field: 'assignee',
    requestedUserId: query.assignee,
  });

  return taskRepository.list(filter, { limit: 1000, sort: { createdAt: -1 } });
};

const isDelayed = (task) => {
  if (!task?.dueDate) return false;

  const due = dayjs(task.dueDate);

  if (task.completedAt) {
    return dayjs(task.completedAt).isAfter(due);
  }

  return dayjs().isAfter(due) && !['APPROVED', 'REJECTED'].includes(task.status);
};

export const exportExcel = asyncHandler(async (req, res) => {
  const tasks = await loadTasksForReport(req.query, req.user);
  const buffer = await buildTasksExcelBuffer(tasks);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="delta-plus-report-${Date.now()}.xlsx"`);
  res.send(Buffer.from(buffer));
});

export const exportPdf = asyncHandler(async (req, res) => {
  const tasks = await loadTasksForReport(req.query, req.user);
  const buffer = await buildTasksPdfBuffer(tasks);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="delta-plus-report-${Date.now()}.pdf"`);
  res.send(buffer);
});

export const reportSummary = asyncHandler(async (req, res) => {
  const tasks = await loadTasksForReport(req.query, req.user);
  const totalPoints = tasks.reduce((sum, task) => sum + (task.pointsAwarded || 0), 0);

  res.json({
    totalTasks: tasks.length,
    totalPoints,
    approvedTasks: tasks.filter((item) => item.status === 'APPROVED').length,
    submittedTasks: tasks.filter((item) => item.status === 'SUBMITTED').length,
    rejectedTasks: tasks.filter((item) => item.status === 'REJECTED').length,
    delayedTasks: tasks.filter((item) => isDelayed(item)).length,
  });
});

export const executiveSummary = asyncHandler(async (req, res) => {
  const tasks = await loadTasksForReport(req.query, req.user);
  const byDepartment = {};

  tasks.forEach((task) => {
    const department = task.assignee?.department || 'UNASSIGNED';
    if (!byDepartment[department]) {
      byDepartment[department] = {
        department,
        totalTasks: 0,
        approvedTasks: 0,
        delayedTasks: 0,
        points: 0,
      };
    }

    byDepartment[department].totalTasks += 1;
    byDepartment[department].points += Number(task.pointsAwarded || 0);

    if (task.status === 'APPROVED') {
      byDepartment[department].approvedTasks += 1;
    }

    if (isDelayed(task)) {
      byDepartment[department].delayedTasks += 1;
    }
  });

  const workloadByAssignee = {};
  tasks.forEach((task) => {
    const key = String(task.assignee?._id || 'unknown');
    if (!workloadByAssignee[key]) {
      workloadByAssignee[key] = {
        userId: key,
        fullName: task.assignee?.fullName || 'Unknown',
        department: task.assignee?.department || 'UNASSIGNED',
        openTasks: 0,
        submittedTasks: 0,
        approvedTasks: 0,
      };
    }

    if (task.status === 'APPROVED') {
      workloadByAssignee[key].approvedTasks += 1;
    } else if (task.status === 'SUBMITTED') {
      workloadByAssignee[key].submittedTasks += 1;
    } else {
      workloadByAssignee[key].openTasks += 1;
    }
  });

  const totalTasks = tasks.length;
  const approvedTasks = tasks.filter((item) => item.status === 'APPROVED').length;

  res.json({
    period: resolveDateRange(req.query),
    totals: {
      totalTasks,
      approvedTasks,
      approvalRate: totalTasks ? Number(((approvedTasks / totalTasks) * 100).toFixed(2)) : 0,
      delayedTasks: tasks.filter((item) => isDelayed(item)).length,
      totalPoints: tasks.reduce((sum, task) => sum + (task.pointsAwarded || 0), 0),
    },
    byDepartment: Object.values(byDepartment).sort((a, b) => b.totalTasks - a.totalTasks),
    workloadByAssignee: Object.values(workloadByAssignee).sort(
      (a, b) => b.openTasks + b.submittedTasks - (a.openTasks + a.submittedTasks),
    ),
  });
});
