import { Roles } from '../../shared/constants.js';
import { AppError } from '../../shared/errors.js';

export const assertWarehouseDeletionAllowed = (user) => {
  if (user?.role !== Roles.GENERAL_MANAGER) throw new AppError('حذف المخزن ومواده متاح للمدير العام فقط', 403);
};

export const deleteWarehouseWithInventory = async ({ user, warehouseId, confirmationName, repository }) => {
  assertWarehouseDeletionAllowed(user);
  const warehouse = await repository.findWarehouseById(warehouseId);
  if (!warehouse) throw new AppError('Warehouse not found', 404);
  if (String(confirmationName || '').trim() !== warehouse.name.trim()) {
    throw new AppError('اكتب اسم المخزن لتأكيد حذف المخزن ومواده نهائياً', 400);
  }

  const materialIds = await repository.findWarehouseMaterialIds(warehouse._id);
  const sharedIds = new Set((await repository.findMaterialIdsUsedOutsideWarehouse(materialIds, warehouse._id)).map(String));
  const deletedMaterialIds = materialIds.filter((id) => !sharedIds.has(String(id)));
  // Keep source balances until material cleanup completes so a failed operation can be retried.
  const materials = await repository.deleteMaterialsByIds(deletedMaterialIds);
  const transactions = await repository.deleteStockTransactionsByWarehouse(warehouse._id);
  const balances = await repository.deleteStockBalancesByWarehouse(warehouse._id);
  await repository.deleteWarehouseById(warehouse._id);

  return {
    warehouse,
    deletedMaterialsCount: materials.deletedCount,
    deletedTransactionsCount: transactions.deletedCount,
    deletedBalancesCount: balances.deletedCount,
    retainedSharedMaterialsCount: sharedIds.size,
  };
};
