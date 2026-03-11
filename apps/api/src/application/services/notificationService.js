import { NotificationRepository } from '../../infrastructure/db/repositories/NotificationRepository.js';
import { emailService } from './emailService.js';

const notificationRepository = new NotificationRepository();

export const notificationService = {
  async notifyTaskAssigned(userId, task, email = '') {
    await notificationRepository.create({
      user: userId,
      type: 'TASK_ASSIGNED',
      titleAr: 'مهمة جديدة',
      messageAr: `تم تكليفك بمهمة جديدة بعنوان: ${task.title}`,
      metadata: {
        taskId: task._id,
      },
    });

    await emailService.sendTaskAssignment({
      to: email,
      taskTitle: task.title,
    });
  },

  async notifyTaskApprovalProgress(userId, task, current, required, email = '') {
    await notificationRepository.create({
      user: userId,
      type: 'TASK_APPROVAL_PROGRESS',
      titleAr: 'تقدم اعتماد المهمة',
      messageAr: `المهمة "${task.title}" حصلت على موافقة ${current}/${required}`,
      metadata: {
        taskId: task._id,
        current,
        required,
      },
    });

    await emailService.sendTaskApprovalProgress({
      to: email,
      taskTitle: task.title,
      current,
      required,
    });
  },

  async notifyTaskApproved(userId, task, points, email = '') {
    await notificationRepository.create({
      user: userId,
      type: 'TASK_APPROVED',
      titleAr: 'اعتماد المهمة',
      messageAr: `تم اعتماد المهمة "${task.title}" وحصلت على ${points} نقطة.`,
      metadata: {
        taskId: task._id,
        points,
      },
    });

    await emailService.sendTaskApproved({
      to: email,
      taskTitle: task.title,
      points,
    });
  },

  async notifyGoalAchieved(userId, goal) {
    return notificationRepository.create({
      user: userId,
      type: 'GOAL_ACHIEVED',
      titleAr: 'تحقيق هدف',
      messageAr: `مبروك، تم تحقيق الهدف: ${goal.title}`,
      metadata: {
        goalId: goal._id,
      },
    });
  },

  async notifySystem(userId, titleAr, messageAr, metadata = {}) {
    return notificationRepository.create({
      user: userId,
      type: 'SYSTEM',
      titleAr,
      messageAr,
      metadata,
    });
  },
};
