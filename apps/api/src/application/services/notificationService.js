import { NotificationRepository } from '../../infrastructure/db/repositories/NotificationRepository.js';
import { emailService } from './emailService.js';
import webpush from 'web-push';
import { env } from '../../config/env.js';
import PushSubscription from '../../infrastructure/db/models/PushSubscriptionModel.js';

const notificationRepository = new NotificationRepository();

/* ── Configure web-push with VAPID keys ── */
if (env.vapidPublicKey && env.vapidPrivateKey) {
  webpush.setVapidDetails(env.vapidEmail, env.vapidPublicKey, env.vapidPrivateKey);
}

/* ── SSE event bus ── */
const sseClients = new Map(); // userId -> Set<res>

export function addSseClient(userId, res) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);
  res.on('close', () => {
    sseClients.get(userId)?.delete(res);
    if (sseClients.get(userId)?.size === 0) sseClients.delete(userId);
  });
}

function pushToUser(userId, event, data) {
  const clients = sseClients.get(String(userId));
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

async function sendWebPush(userId, notification) {
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return;
  try {
    const subscriptions = await PushSubscription.find({ user: userId });
    const pushPayload = JSON.stringify({
      title: notification.titleAr,
      body: notification.messageAr,
      icon: '/brand/delta-plus-logo.png',
      badge: '/brand/delta-plus-logo.png',
      dir: 'rtl',
      tag: `delta-${notification._id}`,
      data: {
        notificationId: notification._id,
        type: notification.type,
        metadata: notification.metadata,
      },
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          pushPayload,
        ).catch(async (err) => {
          // Remove expired/invalid subscriptions (410 Gone or 404 Not Found)
          if (err.statusCode === 410 || err.statusCode === 404) {
            await PushSubscription.deleteOne({ _id: sub._id });
          }
          throw err;
        }),
      ),
    );
  } catch (err) {
    console.error('[WebPush] Error sending push:', err.message);
  }
}

async function createAndPush(payload) {
  const notification = await notificationRepository.create(payload);
  const count = await notificationRepository.unreadCount(payload.user);
  pushToUser(payload.user, 'notification', {
    notification: notification.toObject(),
    unreadCount: count,
  });
  // Send Web Push to all registered devices (non-blocking)
  sendWebPush(payload.user, notification);
  return notification;
}

export const notificationService = {
  async notifyTaskAssigned(userId, task, email = '') {
    await createAndPush({
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
    await createAndPush({
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
    await createAndPush({
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
    return createAndPush({
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
    return createAndPush({
      user: userId,
      type: 'SYSTEM',
      titleAr,
      messageAr,
      metadata,
    });
  },
};
