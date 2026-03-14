export const toHierarchyUserId = (value) =>
  String(value?._id || value?.id || value || '').trim();

export const isSoftDeletedUser = (user = {}) => !!user?.deletedAt;

export const isActiveHierarchyUser = (user = {}) =>
  !isSoftDeletedUser(user) && user?.active !== false;

export const buildUsersById = (users = []) => {
  const usersById = new Map();

  (users || []).forEach((user) => {
    const userId = toHierarchyUserId(user);
    if (!userId) {
      return;
    }

    usersById.set(userId, user);
  });

  return usersById;
};

export const resolveEffectiveManagerId = ({
  user,
  usersById,
  skipInactiveManagers = true,
} = {}) => {
  const userId = toHierarchyUserId(user);
  const visited = new Set(userId ? [userId] : []);
  let currentManagerId = toHierarchyUserId(user?.manager);

  while (currentManagerId) {
    if (visited.has(currentManagerId)) {
      return '';
    }

    visited.add(currentManagerId);
    const manager = usersById.get(currentManagerId);

    if (!manager || isSoftDeletedUser(manager)) {
      return '';
    }

    if (!skipInactiveManagers || isActiveHierarchyUser(manager)) {
      return currentManagerId;
    }

    currentManagerId = toHierarchyUserId(manager.manager);
  }

  return '';
};

export const wouldCreateManagementCycle = ({
  usersById,
  userId,
  managerId,
} = {}) => {
  const normalizedUserId = toHierarchyUserId(userId);
  let currentManagerId = toHierarchyUserId(managerId);
  const visited = new Set(normalizedUserId ? [normalizedUserId] : []);

  while (currentManagerId) {
    if (currentManagerId === normalizedUserId || visited.has(currentManagerId)) {
      return true;
    }

    visited.add(currentManagerId);
    const manager = usersById.get(currentManagerId);

    if (!manager || isSoftDeletedUser(manager)) {
      return false;
    }

    currentManagerId = toHierarchyUserId(manager.manager);
  }

  return false;
};

export const buildChildrenByManager = (users = [], { includeInactive = false } = {}) => {
  const availableUsers = (users || []).filter((user) => !isSoftDeletedUser(user));
  const usersById = buildUsersById(availableUsers);
  const visibleUsers = availableUsers.filter((user) =>
    includeInactive ? true : isActiveHierarchyUser(user),
  );
  const childrenByManager = new Map();

  visibleUsers.forEach((user) => {
    const userId = toHierarchyUserId(user);
    if (!userId) {
      return;
    }

    const managerId = includeInactive
      ? toHierarchyUserId(user.manager)
      : resolveEffectiveManagerId({
          user,
          usersById,
          skipInactiveManagers: true,
        });

    if (!managerId || managerId === userId || !usersById.has(managerId)) {
      return;
    }

    if (!childrenByManager.has(managerId)) {
      childrenByManager.set(managerId, []);
    }

    childrenByManager.get(managerId).push(userId);
  });

  return {
    usersById,
    visibleUsers,
    childrenByManager,
  };
};
