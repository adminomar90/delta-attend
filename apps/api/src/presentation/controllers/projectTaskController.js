import mongoose from 'mongoose';
import { ProjectRepository } from '../../infrastructure/db/repositories/ProjectRepository.js';
import { ProjectStageRepository } from '../../infrastructure/db/repositories/ProjectStageRepository.js';
import { ProjectTaskRepository } from '../../infrastructure/db/repositories/ProjectTaskRepository.js';
import { ProjectTaskPriority, ProjectTaskStatus } from '../../infrastructure/db/models/ProjectTaskModel.js';
import { auditService } from '../../application/services/auditService.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const projectRepository = new ProjectRepository();
const projectStageRepository = new ProjectStageRepository();
const projectTaskRepository = new ProjectTaskRepository();

const clean = (value) => String(value ?? '').trim();

const toDate = (value, label) => {
  if (value === undefined) return undefined;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(`${label} غير صالح`, 400);
  return date;
};

const toPercent = (value, label = 'نسبة الإنجاز') => {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new AppError(`${label} يجب أن تكون بين 0 و 100`, 400);
  return Math.round(number);
};

const toObjectId = (value, label, { required = false } = {}) => {
  const id = clean(value);
  if (!id) {
    if (required) throw new AppError(`${label} مطلوب`, 400);
    return null;
  }
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError(`${label} غير صالح`, 400);
  return id;
};

const toObjectIdArray = (value, label) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new AppError(`${label} يجب أن يكون قائمة`, 400);
  return [...new Set(value.map((item) => clean(item)).filter(Boolean))]
    .map((id) => toObjectId(id, label, { required: true }));
};

const loadProject = async (projectId) => {
  if (!mongoose.Types.ObjectId.isValid(String(projectId))) throw new AppError('معرف المشروع غير صالح', 400);
  const project = await projectRepository.findById(projectId);
  if (!project || project.archived) throw new AppError('المشروع غير موجود أو مؤرشف', 404);
  return project;
};

const loadStageInProject = async (stageId, projectId) => {
  const stage = await projectStageRepository.findById(stageId);
  if (!stage || stage.archived || String(stage.project?._id || stage.project) !== String(projectId)) {
    throw new AppError('المرحلة غير موجودة ضمن هذا المشروع', 404);
  }
  return stage;
};

const assertTaskInProject = (task, projectId) => {
  if (!task || task.archived || String(task.project?._id || task.project) !== String(projectId)) {
    throw new AppError('المهمة غير موجودة ضمن هذا المشروع', 404);
  }
};

const buildTaskPayload = async (body, projectId, current = null) => {
  const payload = {};
  if (body.title !== undefined) {
    payload.title = clean(body.title);
    if (!payload.title) throw new AppError('عنوان المهمة مطلوب', 400);
  } else if (!current) {
    throw new AppError('عنوان المهمة مطلوب', 400);
  }

  const stageId = body.stage || body.stageId || current?.stage?._id || current?.stage;
  if (body.stage !== undefined || body.stageId !== undefined || !current) {
    payload.stage = toObjectId(stageId, 'المرحلة', { required: true });
    await loadStageInProject(payload.stage, projectId);
  }

  if (body.description !== undefined) payload.description = clean(body.description);
  if (body.notes !== undefined) payload.notes = clean(body.notes);
  if (body.location !== undefined) payload.location = clean(body.location);
  if (body.priority !== undefined) {
    payload.priority = clean(body.priority);
    if (!Object.values(ProjectTaskPriority).includes(payload.priority)) throw new AppError('أولوية المهمة غير صالحة', 400);
  }
  if (body.status !== undefined) {
    payload.status = clean(body.status);
    if (!Object.values(ProjectTaskStatus).includes(payload.status)) throw new AppError('حالة المهمة غير صالحة', 400);
  }
  if (body.progressPercent !== undefined) payload.progressPercent = toPercent(body.progressPercent);
  if (body.startDate !== undefined) payload.startDate = toDate(body.startDate, 'تاريخ البدء');
  if (body.dueDate !== undefined) payload.dueDate = toDate(body.dueDate, 'الموعد النهائي');
  if (body.estimatedHours !== undefined) payload.estimatedHours = Math.max(0, Number(body.estimatedHours || 0));
  if (body.teamLeader !== undefined) payload.teamLeader = toObjectId(body.teamLeader, 'قائد الفريق');
  if (body.assignees !== undefined) payload.assignees = toObjectIdArray(body.assignees, 'الموظفون المكلفون');

  return payload;
};

export const listProjectTasks = asyncHandler(async (req, res) => {
  await loadProject(req.params.id);
  const filter = { project: req.params.id };
  if (req.query.stageId || req.query.stage) filter.stage = req.query.stageId || req.query.stage;
  if (req.query.status) filter.status = req.query.status;
  const tasks = await projectTaskRepository.list(filter, { limit: 1000, sort: { dueDate: 1, createdAt: -1 } });
  res.json({ tasks });
});

export const createProjectTask = asyncHandler(async (req, res) => {
  await loadProject(req.params.id);
  const payload = await buildTaskPayload(req.body, req.params.id);
  const task = await projectTaskRepository.create({ ...payload, project: req.params.id });

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_TASK_CREATED',
    entityType: 'PROJECT_TASK',
    entityId: task._id,
    after: { project: req.params.id, stage: task.stage?._id || task.stage, title: task.title, status: task.status },
    req,
  });

  res.status(201).json({ task });
});

export const updateProjectTask = asyncHandler(async (req, res) => {
  await loadProject(req.params.id);
  const task = await projectTaskRepository.findById(req.params.taskId);
  assertTaskInProject(task, req.params.id);
  const payload = await buildTaskPayload(req.body, req.params.id, task);
  const updatedTask = await projectTaskRepository.updateById(task._id, payload);

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_TASK_UPDATED',
    entityType: 'PROJECT_TASK',
    entityId: task._id,
    before: { title: task.title, status: task.status, progressPercent: task.progressPercent },
    after: { title: updatedTask.title, status: updatedTask.status, progressPercent: updatedTask.progressPercent },
    req,
  });

  res.json({ task: updatedTask });
});

export const archiveProjectTask = asyncHandler(async (req, res) => {
  await loadProject(req.params.id);
  const task = await projectTaskRepository.findById(req.params.taskId);
  assertTaskInProject(task, req.params.id);
  const archivedTask = await projectTaskRepository.archiveById(task._id, req.user.id);

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_TASK_ARCHIVED',
    entityType: 'PROJECT_TASK',
    entityId: task._id,
    before: { archived: false, title: task.title },
    after: { archived: true, archivedBy: req.user.id },
    req,
  });

  res.json({ task: archivedTask });
});
