import { AppError } from '../../shared/errors.js';
import { assertWarehouseDeletionAllowed } from './warehouseDeletionService.js';
import { verifyPrimaryAdminPassword } from './primaryAdminPasswordService.js';

export const previewUnlinkedMaterialsDeletion = async ({ user, repository }) => {
  assertWarehouseDeletionAllowed(user);
  const ids = await repository.findUnlinkedMaterialIds();
  const products = await repository.findMaterialsForDeletion(ids);
  return { count: products.length, products };
};

export const deleteUnlinkedMaterials = async ({ user, repository, adminPassword, expectedCount, materialIds, userRepository, maxFailures, lockMinutes }) => {
  assertWarehouseDeletionAllowed(user);
  if (!Array.isArray(materialIds) || !materialIds.length || materialIds.some((id) => typeof id !== 'string')) throw new AppError('حدد المنتجات المطلوب حذفها', 400);
  const selectedIds = [...new Set(materialIds)];
  if (!Number.isInteger(expectedCount) || selectedIds.length !== expectedCount) throw new AppError('عدد المنتجات المحددة لا يطابق طلب الحذف', 409);
  const authorization = await verifyPrimaryAdminPassword({ actor: user, password: adminPassword, userRepository, maxFailures, lockMinutes });
  const eligible = new Set((await repository.findUnlinkedMaterialIds()).map(String));
  if (selectedIds.some((id) => !eligible.has(id))) throw new AppError('تغير ارتباط أحد المنتجات أو حذف مسبقاً؛ حدث قائمة المنتجات قبل الحذف', 409);
  const result = await repository.deleteUnlinkedMaterialInventory(selectedIds);
  return { ...result, deletedMaterialIds: selectedIds, ...authorization };
};
