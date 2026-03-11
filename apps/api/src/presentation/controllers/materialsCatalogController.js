import { auditService } from '../../application/services/auditService.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import {
  materialsRepository,
  toCleanString,
  toUpper,
  toNumber,
  roundQty,
  computeQtyAvailable,
  ensureMaterial,
  ensureWarehouse,
  adjustOnHandStock,
} from './materialsCommon.js';

export const listMaterials = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.active !== undefined) {
    filter.active = ['true', '1', 'yes', 'on'].includes(String(req.query.active).toLowerCase());
  }

  if (req.query.search) {
    const regex = new RegExp(toCleanString(req.query.search), 'i');
    filter.$or = [{ name: regex }, { code: regex }, { category: regex }];
  }

  const materials = await materialsRepository.listMaterials(filter);
  res.json({ materials });
});

export const createMaterial = asyncHandler(async (req, res) => {
  const code = toUpper(req.body.code);
  const name = toCleanString(req.body.name);

  if (!code || !name) {
    throw new AppError('code and name are required', 400);
  }

  const created = await materialsRepository.createMaterial({
    code,
    name,
    category: toUpper(req.body.category || 'GENERAL'),
    unit: toUpper(req.body.unit || 'PIECE'),
    trackSerial: !!req.body.trackSerial,
    trackBatch: !!req.body.trackBatch,
    minStock: Math.max(0, toNumber(req.body.minStock, 0)),
    estimatedUnitCost: Math.max(0, toNumber(req.body.estimatedUnitCost, 0)),
    active: req.body.active === undefined ? true : !!req.body.active,
    createdBy: req.user.id,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_CREATED',
    entityType: 'MATERIAL',
    entityId: created._id,
    after: {
      code: created.code,
      name: created.name,
      category: created.category,
      unit: created.unit,
    },
    req,
  });

  res.status(201).json({ material: created });
});

export const updateMaterial = asyncHandler(async (req, res) => {
  const material = await materialsRepository.findMaterialById(req.params.id);
  if (!material) {
    throw new AppError('Material not found', 404);
  }

  const payload = {};

  if (req.body.name !== undefined) payload.name = toCleanString(req.body.name);
  if (req.body.code !== undefined) payload.code = toUpper(req.body.code);
  if (req.body.category !== undefined) payload.category = toUpper(req.body.category);
  if (req.body.unit !== undefined) payload.unit = toUpper(req.body.unit);
  if (req.body.trackSerial !== undefined) payload.trackSerial = !!req.body.trackSerial;
  if (req.body.trackBatch !== undefined) payload.trackBatch = !!req.body.trackBatch;
  if (req.body.minStock !== undefined) payload.minStock = Math.max(0, toNumber(req.body.minStock, 0));
  if (req.body.estimatedUnitCost !== undefined) payload.estimatedUnitCost = Math.max(0, toNumber(req.body.estimatedUnitCost, 0));
  if (req.body.active !== undefined) payload.active = !!req.body.active;

  const updated = await materialsRepository.updateMaterialById(material._id, payload);

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_UPDATED',
    entityType: 'MATERIAL',
    entityId: material._id,
    before: {
      code: material.code,
      name: material.name,
      category: material.category,
      unit: material.unit,
      active: material.active,
    },
    after: {
      code: updated.code,
      name: updated.name,
      category: updated.category,
      unit: updated.unit,
      active: updated.active,
    },
    req,
  });

  res.json({ material: updated });
});

export const listWarehouses = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.active !== undefined) {
    filter.active = ['true', '1', 'yes', 'on'].includes(String(req.query.active).toLowerCase());
  }

  const warehouses = await materialsRepository.listWarehouses(filter);
  res.json({ warehouses });
});

export const createWarehouse = asyncHandler(async (req, res) => {
  const name = toCleanString(req.body.name);
  const code = toUpper(req.body.code);

  if (!name || !code) {
    throw new AppError('name and code are required', 400);
  }

  const created = await materialsRepository.createWarehouse({
    name,
    code,
    location: toCleanString(req.body.location),
    active: req.body.active === undefined ? true : !!req.body.active,
    notes: toCleanString(req.body.notes),
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'WAREHOUSE_CREATED',
    entityType: 'WAREHOUSE',
    entityId: created._id,
    after: {
      name: created.name,
      code: created.code,
      location: created.location,
      active: created.active,
    },
    req,
  });

  res.status(201).json({ warehouse: created });
});

export const updateWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await materialsRepository.findWarehouseById(req.params.id);
  if (!warehouse) {
    throw new AppError('Warehouse not found', 404);
  }

  const payload = {};
  if (req.body.name !== undefined) payload.name = toCleanString(req.body.name);
  if (req.body.code !== undefined) payload.code = toUpper(req.body.code);
  if (req.body.location !== undefined) payload.location = toCleanString(req.body.location);
  if (req.body.notes !== undefined) payload.notes = toCleanString(req.body.notes);
  if (req.body.active !== undefined) payload.active = !!req.body.active;

  const updated = await materialsRepository.updateWarehouseById(warehouse._id, payload);

  await auditService.log({
    actorId: req.user.id,
    action: 'WAREHOUSE_UPDATED',
    entityType: 'WAREHOUSE',
    entityId: warehouse._id,
    before: {
      name: warehouse.name,
      code: warehouse.code,
      location: warehouse.location,
      active: warehouse.active,
    },
    after: {
      name: updated.name,
      code: updated.code,
      location: updated.location,
      active: updated.active,
    },
    req,
  });

  res.json({ warehouse: updated });
});

export const listStockBalances = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.materialId) {
    filter.material = req.query.materialId;
  }
  if (req.query.warehouseId) {
    filter.warehouse = req.query.warehouseId;
  }

  const balances = await materialsRepository.listStockBalances(filter);
  const rows = balances.map((balance) => ({
    ...balance.toObject(),
    qtyAvailable: computeQtyAvailable(balance),
  }));

  res.json({ balances: rows });
});

export const adjustStockBalance = asyncHandler(async (req, res) => {
  const materialId = toCleanString(req.body.materialId || req.body.material);
  const warehouseId = toCleanString(req.body.warehouseId || req.body.warehouse);
  const quantity = roundQty(req.body.quantity);
  const transactionType = toUpper(req.body.transactionType || (quantity >= 0 ? 'IN' : 'OUT'));

  if (!materialId || !warehouseId) {
    throw new AppError('materialId and warehouseId are required', 400);
  }

  if (!quantity) {
    throw new AppError('quantity cannot be zero', 400);
  }

  await ensureMaterial(materialId);
  await ensureWarehouse(warehouseId);

  await adjustOnHandStock({
    materialId,
    warehouseId,
    qtyDelta: quantity,
    avgCost: Math.max(0, toNumber(req.body.unitCost, 0)),
    transactionType,
    projectId: toCleanString(req.body.projectId) || null,
    requestId: toCleanString(req.body.requestId) || null,
    referenceType: toUpper(req.body.referenceType || 'MANUAL_STOCK_ADJUSTMENT'),
    referenceId: toCleanString(req.body.referenceId || `MNL-${Date.now()}`),
    notes: toCleanString(req.body.notes),
    actorId: req.user.id,
  });

  const updatedBalance = await materialsRepository.findStockBalance(materialId, warehouseId);

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_STOCK_ADJUSTED',
    entityType: 'STOCK_BALANCE',
    entityId: `${materialId}:${warehouseId}`,
    after: {
      materialId,
      warehouseId,
      quantity,
      transactionType,
      qtyOnHand: updatedBalance?.qtyOnHand || 0,
      qtyAvailable: computeQtyAvailable(updatedBalance),
    },
    req,
  });

  res.json({
    balance: {
      ...updatedBalance.toObject(),
      qtyAvailable: computeQtyAvailable(updatedBalance),
    },
  });
});
