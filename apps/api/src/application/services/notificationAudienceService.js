import { Permission, Roles } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';

export const NotificationWatchPermission = {
  ATTENDANCE: Permission.VIEW_ATTENDANCE_NOTIFICATIONS,
  WORK_REPORT: Permission.VIEW_WORK_REPORT_NOTIFICATIONS,
  OPERATION: Permission.VIEW_OPERATION_NOTIFICATIONS,
};

const toId = (value) => String(value?._id || value?.id || value || '').trim();

export const resolveNotificationAudience = async ({
  userRepository,
  actorId,
  watchPermission,
  includeManagementChain = true,
  includeGeneralManagers = true,
  excludeUserIds = [],
} = {}) => {
  const actorIdString = toId(actorId);
  if (!actorIdString) {
    return [];
  }

  const users = await userRepository.listActive({ includeManager: false });
  const usersById = new Map(
    users.map((user) => [toId(user._id || user.id), user]),
  );

  const actor = usersById.get(actorIdString) || await userRepository.findById(actorIdString);
  if (!actor) {
    return [];
  }

  const recipients = new Set();

  if (includeManagementChain) {
    const seenManagers = new Set();
    let currentManagerId = toId(actor.manager);

    while (currentManagerId && !seenManagers.has(currentManagerId)) {
      seenManagers.add(currentManagerId);
      recipients.add(currentManagerId);

      const manager = usersById.get(currentManagerId);
      currentManagerId = manager ? toId(manager.manager) : '';
    }
  }

  if (includeGeneralManagers) {
    users.forEach((user) => {
      if (user.role === Roles.GENERAL_MANAGER) {
        recipients.add(toId(user._id || user.id));
      }
    });
  }

  if (watchPermission) {
    users.forEach((user) => {
      if (hasPermission(user, watchPermission)) {
        recipients.add(toId(user._id || user.id));
      }
    });
  }

  const excluded = new Set(
    [actorIdString, ...excludeUserIds.map((item) => toId(item))].filter(Boolean),
  );

  return [...recipients].filter((userId) => userId && !excluded.has(userId));
};
