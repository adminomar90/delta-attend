import { TaskStatus } from '../../shared/constants.js';
import { AppError } from '../../shared/errors.js';

export class ChangeTaskStatusUseCase {
  constructor({ taskRepository, auditService }) {
    this.taskRepository = taskRepository;
    this.auditService = auditService;
  }

  async execute({ taskId, actorId, status, rejectionReason, req }) {
    const task = await this.taskRepository.findById(taskId);

    if (!task) {
      throw new AppError('Task not found', 404);
    }

    const allowedStatuses = [TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED, TaskStatus.REJECTED];
    if (!allowedStatuses.includes(status)) {
      throw new AppError('Invalid status transition', 400);
    }

    const payload = {
      status,
    };

    if (status === TaskStatus.SUBMITTED) {
      payload.submittedAt = new Date();
      payload.completedAt = new Date();
      payload.rejectionReason = '';
    }

    if (status === TaskStatus.REJECTED) {
      payload.rejectionReason = rejectionReason || 'يحتاج تعديل';
      payload.approvedAt = null;
      payload.approvedBy = null;
    }

    const updatedTask = await this.taskRepository.updateById(taskId, payload);

    await this.auditService.log({
      actorId,
      action: `TASK_STATUS_${status}`,
      entityType: 'TASK',
      entityId: task._id,
      before: {
        status: task.status,
      },
      after: {
        status: updatedTask.status,
      },
      req,
    });

    return updatedTask;
  }
}
