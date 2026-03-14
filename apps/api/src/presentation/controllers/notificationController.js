import { NotificationRepository } from '../../infrastructure/db/repositories/NotificationRepository.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { addSseClient, notificationService } from '../../application/services/notificationService.js';
import PushSubscription from '../../infrastructure/db/models/PushSubscriptionModel.js';
import { env } from '../../config/env.js';
import { auditService } from '../../application/services/auditService.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { buildChildrenByManager, toHierarchyUserId } from '../../shared/employeeHierarchy.js';
import { Roles } from '../../shared/constants.js';

const notificationRepository = new NotificationRepository();
const userRepository = new UserRepository();

const InternalNotificationKind = {
  CIRCULAR: 'CIRCULAR',
  BULLETIN: 'BULLETIN',
  MEETING: 'MEETING',
};

const InternalNotificationAudience = {
  ALL: 'ALL',
  SPECIFIC_MANAGER: 'SPECIFIC_MANAGER',
  MANAGER_TEAM: 'MANAGER_TEAM',
};

const managementRoles = new Set([
  Roles.GENERAL_MANAGER,
  Roles.HR_MANAGER,
  Roles.FINANCIAL_MANAGER,
  Roles.PROJECT_MANAGER,
  Roles.ASSISTANT_PROJECT_MANAGER,
  Roles.TEAM_LEAD,
]);

const toCleanString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
};

const resolveInternalRecipients = async ({ audienceType, managerId = '' } = {}) => {
  const users = await userRepository.listActive({ includeManager: false });

  if (audienceType === InternalNotificationAudience.ALL) {
    return {
      recipients: users.map((user) => String(user._id || user.id)).filter(Boolean),
      audienceLabel: 'الجميع',
      targetManager: null,
    };
  }

  const manager = users.find((user) => String(user._id || user.id) === String(managerId || ''));
  if (!manager) {
    throw new AppError('Selected manager was not found or inactive', 404);
  }

  if (audienceType === InternalNotificationAudience.SPECIFIC_MANAGER) {
    return {
      recipients: [String(manager._id || manager.id)],
      audienceLabel: `مدير محدد: ${manager.fullName}`,
      targetManager: {
        id: String(manager._id || manager.id),
        fullName: manager.fullName || '',
        role: manager.role || '',
      },
    };
  }

  const { childrenByManager } = buildChildrenByManager(users, { includeInactive: false });
  const descendants = new Set();
  const queue = [String(manager._id || manager.id)];

  while (queue.length) {
    const current = queue.shift();
    const children = childrenByManager.get(current) || [];
    children.forEach((childId) => {
      const normalized = toHierarchyUserId(childId);
      if (!normalized || descendants.has(normalized)) {
        return;
      }
      descendants.add(normalized);
      queue.push(normalized);
    });
  }

  return {
    recipients: [...descendants],
    audienceLabel: `موظفو المدير: ${manager.fullName}`,
    targetManager: {
      id: String(manager._id || manager.id),
      fullName: manager.fullName || '',
      role: manager.role || '',
    },
  };
};

export const listNotifications = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit || 25);
  const notifications = await notificationRepository.listForUser(req.user.id, limit);
  const unreadCount = await notificationRepository.unreadCount(req.user.id);
  res.json({ notifications, unreadCount });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await notificationRepository.markAsRead(req.params.id, req.user.id);

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  const unreadCount = await notificationRepository.unreadCount(req.user.id);
  res.json({ notification, unreadCount });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await notificationRepository.markAllAsRead(req.user.id);
  res.json({ unreadCount: 0 });
});

export const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationRepository.unreadCount(req.user.id);
  res.json({ unreadCount: count });
});

export const listNotificationManagers = asyncHandler(async (_req, res) => {
  const users = await userRepository.listActive({ includeManager: false });
  const { childrenByManager } = buildChildrenByManager(users, { includeInactive: false });

  const managers = users
    .filter((user) => {
      const userId = String(user._id || user.id);
      return managementRoles.has(user.role) || (childrenByManager.get(userId) || []).length > 0;
    })
    .map((user) => ({
      id: String(user._id || user.id),
      fullName: user.fullName || '',
      role: user.role || '',
      employeeCode: user.employeeCode || '',
      directReportsCount: (childrenByManager.get(String(user._id || user.id)) || []).length,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'));

  res.json({ managers });
});

export const createInternalNotification = asyncHandler(async (req, res) => {
  const notificationKind = toCleanString(req.body.notificationKind).toUpperCase();
  const audienceType = toCleanString(req.body.audienceType).toUpperCase();
  const managerId = toCleanString(req.body.managerId);
  const titleAr = toCleanString(req.body.titleAr || req.body.title);
  const messageAr = toCleanString(req.body.messageAr || req.body.details);

  if (!Object.values(InternalNotificationKind).includes(notificationKind)) {
    throw new AppError('notificationKind must be CIRCULAR, BULLETIN, or MEETING', 400);
  }

  if (!Object.values(InternalNotificationAudience).includes(audienceType)) {
    throw new AppError('audienceType must be ALL, SPECIFIC_MANAGER, or MANAGER_TEAM', 400);
  }

  if (!titleAr || !messageAr) {
    throw new AppError('titleAr and messageAr are required', 400);
  }

  if ([InternalNotificationAudience.SPECIFIC_MANAGER, InternalNotificationAudience.MANAGER_TEAM].includes(audienceType) && !managerId) {
    throw new AppError('managerId is required for the selected audience', 400);
  }

  const { recipients, audienceLabel, targetManager } = await resolveInternalRecipients({
    audienceType,
    managerId,
  });

  if (!recipients.length) {
    throw new AppError('No recipients found for the selected audience', 409);
  }

  await notificationService.notifyInternalNotification(recipients, {
    createdBy: req.user.id,
    notificationKind,
    audienceType,
    audienceLabel,
    creatorName: req.user.fullName || '',
    titleAr,
    messageAr,
    details: messageAr,
    targetManager,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'INTERNAL_NOTIFICATION_CREATED',
    entityType: 'NOTIFICATION',
    entityId: `${notificationKind}:${Date.now()}`,
    after: {
      notificationKind,
      audienceType,
      audienceLabel,
      targetManager,
      recipientsCount: recipients.length,
      titleAr,
      messageAr,
    },
    req,
  });

  res.status(201).json({
    success: true,
    recipientsCount: recipients.length,
    audienceLabel,
  });
});

export const testNotification = asyncHandler(async (req, res) => {
  await notificationService.notifySystem(
    req.user.id,
    'إشعار تجريبي 🔔',
    'هذا إشعار تجريبي للتأكد من عمل منظومة الإشعارات بنجاح.',
    { test: true },
  );
  res.json({ success: true, message: 'تم إرسال إشعار تجريبي' });
});

export const sseStream = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('event: connected\ndata: {}\n\n');

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
  addSseClient(req.user.id, res);

  req.on('close', () => clearInterval(keepAlive));
};

export const getVapidPublicKey = (req, res) => {
  res.json({ publicKey: env.vapidPublicKey });
};

export const subscribePush = asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new AppError('بيانات الاشتراك غير مكتملة', 400);
  }

  await PushSubscription.findOneAndUpdate(
    { user: req.user.id, endpoint },
    { user: req.user.id, endpoint, keys, userAgent: req.headers['user-agent'] || '' },
    { upsert: true, new: true },
  );

  res.json({ success: true, message: 'تم تسجيل الاشتراك بنجاح' });
});

export const unsubscribePush = asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    throw new AppError('endpoint مطلوب', 400);
  }

  await PushSubscription.deleteOne({ user: req.user.id, endpoint });
  res.json({ success: true, message: 'تم إلغاء الاشتراك' });
});
