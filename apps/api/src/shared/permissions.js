import { RolePermissions } from './constants.js';

export const resolvePermissions = (user = {}) => {
  const rolePermissions = RolePermissions[user.role] || [];
  const customPermissions = Array.isArray(user.customPermissions) ? user.customPermissions : [];
  const explicitPermissions = Array.isArray(user.permissions) ? user.permissions : [];

  return [...new Set([...rolePermissions, ...customPermissions, ...explicitPermissions])];
};

export const hasPermission = (user = {}, permission) =>
  resolvePermissions(user).includes(permission);

export const hasAnyPermission = (user = {}, requiredPermissions = []) =>
  requiredPermissions.some((permission) => hasPermission(user, permission));
