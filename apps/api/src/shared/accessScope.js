import { Roles } from './constants.js';
import {
  buildChildrenByManager,
  toHierarchyUserId,
} from './employeeHierarchy.js';

const HIERARCHY_SCOPED_ROLES = new Set([
  Roles.PROJECT_MANAGER,
  Roles.ASSISTANT_PROJECT_MANAGER,
  Roles.TEAM_LEAD,
]);

export const resolveManagedUserIds = async ({
  userRepository,
  actorId,
  actorRole,
  includeInactive = false,
}) => {
  const actorIdString = String(actorId || '');
  if (!actorIdString) {
    return [];
  }

  if (actorRole === Roles.TECHNICAL_STAFF) {
    return [actorIdString];
  }

  if (actorRole !== Roles.GENERAL_MANAGER && !HIERARCHY_SCOPED_ROLES.has(actorRole)) {
    return null;
  }

  const hierarchyNodes = await userRepository.listHierarchyNodes();
  const { visibleUsers, childrenByManager } = buildChildrenByManager(hierarchyNodes, {
    includeInactive,
  });

  if (actorRole === Roles.GENERAL_MANAGER) {
    return visibleUsers.map((node) => toHierarchyUserId(node)).filter(Boolean);
  }

  const managed = new Set([actorIdString]);
  const queue = [actorIdString];

  while (queue.length) {
    const current = queue.shift();
    const children = childrenByManager.get(current) || [];

    children.forEach((childId) => {
      if (managed.has(childId)) {
        return;
      }

      managed.add(childId);
      queue.push(childId);
    });
  }

  return [...managed];
};

export const isUserWithinManagedScope = ({ managedUserIds, userId }) => {
  if (!Array.isArray(managedUserIds)) {
    return true;
  }

  return managedUserIds.includes(String(userId));
};

export const applyManagedScopeOnFilter = ({
  filter,
  managedUserIds,
  field = 'assignee',
  requestedUserId,
}) => {
  if (!Array.isArray(managedUserIds)) {
    if (requestedUserId) {
      filter[field] = requestedUserId;
    }
    return filter;
  }

  const requestedIdString = requestedUserId ? String(requestedUserId) : '';
  const managedSet = new Set(managedUserIds.map((item) => String(item)));

  if (requestedIdString) {
    filter[field] = managedSet.has(requestedIdString) ? requestedUserId : { $in: [] };
    return filter;
  }

  filter[field] = {
    $in: [...managedSet],
  };

  return filter;
};
