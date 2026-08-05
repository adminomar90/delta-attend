import mongoose from 'mongoose';
import { ProjectRepository } from '../../infrastructure/db/repositories/ProjectRepository.js';
import { ProjectStageRepository } from '../../infrastructure/db/repositories/ProjectStageRepository.js';
import { ProjectStageStatus } from '../../infrastructure/db/models/ProjectStageModel.js';
import { auditService } from '../../application/services/auditService.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const projectRepository = new ProjectRepository();
const projectStageRepository = new ProjectStageRepository();

const stagePayloadFields = [
  'name',
  'description',
  'order',
  'plannedStartDate',
  'plannedEndDate',
  'actualStartDate',
  'actualEndDate',
  'progressPercent',
  'manager',
  'participants',
  'status',
  'notes',
];

const nullableDate = (value, label) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(`${label} غير صالح`, 400);
  return date;
};

const boundedNumber = (value, label, { min = 0, max = 100, fallback = 0 } = {}) => {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new AppError(`${label} يجب أن يكون بين ${min} و ${max}`, 400);
  }
  return number;
};

const normalizeObjectId = (value, label, { required = false } = {}) => {
  if (!value) {
    if (required) throw new AppError(`${label} مطلوب`, 400);
    return null;
  }
  if (!mongoose.Types.ObjectId.isValid(String(value))) throw new AppError(`${label} غير صالح`, 400);
  return value;
};

const normalizeObjectIdArray = (value, label) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new AppError(`${label} يجب أن يكون قائمة`, 400);
  return [...new Set(value.filter(Boolean).map((item) => String(item)))].map((item) => normalizeObjectId(item, label, { required: true }));
};

const pickStagePayload = (body, current = null) => {
  const payload = {};
  for (const field of stagePayloadFields) {
    if (body[field] !== undefined) payload[field] = body[field];
  }

  if (payload.name !== undefined) {
    payload.name = String(payload.name || '').trim();
    if (!payload.name) throw new AppError('اسم المرحلة مطلوب', 400);
  } else if (!current) {
    throw new AppError('اسم المرحلة مطلوب', 400);
  }

  if (payload.description !== undefined) payload.description = String(payload.description || '').trim();
  if (payload.notes !== undefined) payload.notes = String(payload.notes || '').trim();
  if (payload.order !== undefined) payload.order = boundedNumber(payload.order, 'ترتيب المرحلة', { min: 1, max: 10000, fallback: 1 });
  if (payload.progressPercent !== undefined) payload.progressPercent = boundedNumber(payload.progressPercent, 'نسبة الإنجاز', { min: 0, max: 100, fallback: 0 });
  if (payload.manager !== undefined) payload.manager = normalizeObjectId(payload.manager, 'مسؤول المرحلة');
  if (payload.participants !== undefined) payload.participants = normalizeObjectIdArray(payload.participants, 'الموظفون المشاركون');
  if (payload.status !== undefined && !Object.values(ProjectStageStatus).includes(payload.status)) {
    throw new AppError('حالة المرحلة غير صالحة', 400);
  }

  payload.plannedStartDate = nullableDate(payload.plannedStartDate, 'تاريخ البدء المخطط');
  payload.plannedEndDate = nullableDate(payload.plannedEndDate, 'تاريخ الانتهاء المخطط');
  payload.actualStartDate = nullableDate(payload.actualStartDate, 'تاريخ البدء الفعلي');
  payload.actualEndDate = nullableDate(payload.actualEndDate, 'تاريخ الانتهاء الفعلي');
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

  return payload;
};

const loadProject = async (projectId) => {
  if (!mongoose.Types.ObjectId.isValid(String(projectId))) throw new AppError('معرف المشروع غير صالح', 400);
  const project = await projectRepository.findById(projectId);
  if (!project || project.archived) throw new AppError('المشروع غير موجود أو مؤرشف', 404);
  return project;
};

const assertStageBelongsToProject = (stage, projectId) => {
  if (!stage || stage.archived || String(stage.project?._id || stage.project) !== String(projectId)) {
    throw new AppError('المرحلة غير موجودة ضمن هذا المشروع', 404);
  }
};

export const listProjectStages = asyncHandler(async (req, res) => {
  await loadProject(req.params.id);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const stages = await projectStageRepository.listByProject(req.params.id, filter);
  res.json({ stages });
});

export const createProjectStage = asyncHandler(async (req, res) => {
  await loadProject(req.params.id);
  const payload = pickStagePayload(req.body);
  payload.project = req.params.id;
  payload.order = payload.order || await projectStageRepository.getNextOrder(req.params.id);

  const stage = await projectStageRepository.create(payload);

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_STAGE_CREATED',
    entityType: 'PROJECT_STAGE',
    entityId: stage._id,
    after: { project: req.params.id, name: stage.name, progressPercent: stage.progressPercent, status: stage.status },
    req,
  });

  res.status(201).json({ stage });
});

export const updateProjectStage = asyncHandler(async (req, res) => {
  await loadProject(req.params.id);
  const stage = await projectStageRepository.findById(req.params.stageId);
  assertStageBelongsToProject(stage, req.params.id);

  const payload = pickStagePayload(req.body, stage);

  const before = {
    name: stage.name,
    order: stage.order,
    progressPercent: stage.progressPercent,
    status: stage.status,
  };
  const updatedStage = await projectStageRepository.updateById(stage._id, payload);

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_STAGE_UPDATED',
    entityType: 'PROJECT_STAGE',
    entityId: stage._id,
    before,
    after: {
      name: updatedStage.name,
      order: updatedStage.order,
      progressPercent: updatedStage.progressPercent,
      status: updatedStage.status,
    },
    req,
  });

  res.json({ stage: updatedStage });
});

export const reorderProjectStages = asyncHandler(async (req, res) => {
  await loadProject(req.params.id);
  const stagesInput = Array.isArray(req.body.stages) ? req.body.stages : [];
  if (!stagesInput.length) throw new AppError('أرسل ترتيب المراحل المطلوب', 400);

  for (const item of stagesInput) {
    if (!mongoose.Types.ObjectId.isValid(String(item.id || item._id || ''))) throw new AppError('معرف مرحلة غير صالح', 400);
    const stage = await projectStageRepository.findById(item.id || item._id);
    assertStageBelongsToProject(stage, req.params.id);
    await projectStageRepository.updateById(stage._id, {
      order: boundedNumber(item.order, 'ترتيب المرحلة', { min: 1, max: 10000, fallback: stage.order }),
    });
  }

  const stages = await projectStageRepository.listByProject(req.params.id);
  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_STAGES_REORDERED',
    entityType: 'PROJECT',
    entityId: req.params.id,
    after: { stages: stages.map((stage) => ({ id: stage._id, order: stage.order })) },
    req,
  });

  res.json({ stages });
});

export const duplicateProjectStage = asyncHandler(async (req, res) => {
  await loadProject(req.params.id);
  const stage = await projectStageRepository.findById(req.params.stageId);
  assertStageBelongsToProject(stage, req.params.id);

  const duplicatedStage = await projectStageRepository.create({
    project: req.params.id,
    name: `${stage.name} - نسخة`,
    description: stage.description,
    order: await projectStageRepository.getNextOrder(req.params.id),
    plannedStartDate: stage.plannedStartDate,
    plannedEndDate: stage.plannedEndDate,
    progressPercent: 0,
    manager: stage.manager?._id || stage.manager || null,
    participants: (stage.participants || []).map((participant) => participant._id || participant),
    status: ProjectStageStatus.NOT_STARTED,
    notes: stage.notes,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_STAGE_DUPLICATED',
    entityType: 'PROJECT_STAGE',
    entityId: duplicatedStage._id,
    before: { sourceStage: stage._id },
    after: { name: duplicatedStage.name, copiedTasksCount: 0 },
    req,
  });

  res.status(201).json({ stage: duplicatedStage });
});

export const archiveProjectStage = asyncHandler(async (req, res) => {
  await loadProject(req.params.id);
  const stage = await projectStageRepository.findById(req.params.stageId);
  assertStageBelongsToProject(stage, req.params.id);

  const linkedTasks = await projectStageRepository.countLinkedTasks(stage._id);
  if (linkedTasks > 0) throw new AppError('لا يمكن حذف مرحلة مرتبطة بمهام. ألغِ أو انقل المهام أولًا.', 409);

  const archivedStage = await projectStageRepository.archiveById(stage._id, req.user.id);

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_STAGE_ARCHIVED',
    entityType: 'PROJECT_STAGE',
    entityId: stage._id,
    before: { archived: false, name: stage.name },
    after: { archived: true, archivedBy: req.user.id },
    req,
  });

  res.json({ stage: archivedStage });
});
