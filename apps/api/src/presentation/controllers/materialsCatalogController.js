import { createMaterialRequest } from './materialsRequestController.js';
import { auditService } from '../../application/services/auditService.js';
import { sequenceService } from '../../application/services/sequenceService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { deleteWarehouseWithInventory } from '../../application/services/warehouseDeletionService.js';
import { previewUnlinkedMaterialsDeletion, deleteUnlinkedMaterials } from '../../application/services/unlinkedMaterialsDeletionService.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { Permission } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';
import path from 'path';
import { env } from '../../config/env.js';
import {
  materialsRepository,
  projectRepository,
  userRepository,
  toCleanString,
  toUpper,
  toNumber,
  roundQty,
  computeQtyAvailable,
  ensureMaterial,
  ensureWarehouse,
  adjustOnHandStock,
} from './materialsCommon.js';

const boolFromBody = (value) => value === true || ['true', '1', 'yes', 'on'].includes(String(value || '').toLowerCase());

export const previewUnlinkedProducts = asyncHandler(async (req, res) => {
  res.json(await previewUnlinkedMaterialsDeletion({ user: req.user, repository: materialsRepository }));
});

export const deleteUnlinkedProducts = asyncHandler(async (req, res) => {
  const result = await deleteUnlinkedMaterials({ user: req.user, repository: materialsRepository, adminPassword: req.body.adminPassword, expectedCount: req.body.expectedCount, materialIds: req.body.materialIds, maxFailures: env.maxAuthFailures, lockMinutes: env.lockMinutes });
  await auditService.log({ actorId: req.user.id, action: 'UNLINKED_MATERIALS_PERMANENTLY_DELETED', entityType: 'MATERIAL_CATALOG', entityId: 'UNLINKED', after: result, req });
  res.json(result);
});
const fileToAttachment = (file) => ({
  fileName: file.filename,
  originalName: file.originalname,
  mimeType: file.mimetype,
  size: file.size,
  publicUrl: `/uploads/${path.basename(file.filename)}`,
  uploadedAt: new Date(),
});

const resolveUploadFiles = (req) => {
  if (Array.isArray(req.files)) {
    return { image: null, attachments: req.files.map(fileToAttachment) };
  }
  const imageFile = req.files?.image?.[0] || null;
  const attachments = (req.files?.attachments || []).map(fileToAttachment);
  return {
    image: imageFile ? fileToAttachment(imageFile) : null,
    attachments,
  };
};

const resolveProductStatus = ({ explicitStatus, qtyOnHand = 0, minStock = 0, active = true }) => {
  const requested = toUpper(explicitStatus);
  if (requested && ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK', 'DAMAGED', 'ARCHIVED'].includes(requested)) {
    return requested;
  }
  if (!active) return 'ARCHIVED';
  if (Number(qtyOnHand || 0) <= 0) return 'OUT_OF_STOCK';
  if (Number(qtyOnHand || 0) <= Number(minStock || 0)) return 'LOW_STOCK';
  return 'AVAILABLE';
};

const ensureUniqueBarcode = async ({ barcode, excludeId = '' }) => {
  const safeBarcode = toCleanString(barcode);
  if (!safeBarcode) return;
  const existing = await materialsRepository.findMaterialByBarcode(safeBarcode);
  if (existing && String(existing._id) !== String(excludeId || '')) {
    throw new AppError('هذا الباركود مستخدم مسبقاً لمنتج آخر', 409);
  }
};

export const listMaterials = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.active !== undefined) {
    filter.active = ['true', '1', 'yes', 'on'].includes(String(req.query.active).toLowerCase());
  }

  if (req.query.search) {
    const regex = new RegExp(toCleanString(req.query.search), 'i');
    filter.$or = [
      { name: regex },
      { code: regex },
      { barcode: regex },
      { category: regex },
      { brand: regex },
      { model: regex },
      { storageLocation: regex },
    ];
  }
  if (req.query.barcode) {
    filter.barcode = toCleanString(req.query.barcode);
  }
  if (req.query.category) {
    filter.category = toUpper(req.query.category);
  }
  if (req.query.brand) {
    filter.brand = new RegExp(toCleanString(req.query.brand), 'i');
  }
  if (req.query.model) {
    filter.model = new RegExp(toCleanString(req.query.model), 'i');
  }
  if (req.query.status) {
    filter.productStatus = toUpper(req.query.status);
  }

  const materials = await materialsRepository.listMaterials(filter);
  res.json({ materials });
});

export const getMaterialByBarcode = asyncHandler(async (req, res) => {
  const barcode = toCleanString(req.params.barcode || req.query.barcode);
  if (!barcode) {
    throw new AppError('barcode is required', 400);
  }

  const material = await materialsRepository.findMaterialByBarcode(barcode);
  if (!material || !material.active) {
    throw new AppError('لا يوجد منتج بهذا الباركود', 404);
  }

  res.json({ material });
});

export const listMaterialCategories = asyncHandler(async (_req, res) => {
  const materials = await materialsRepository.listMaterials({});
  const categories = [...new Set(materials.map((item) => item.category).filter(Boolean))].sort();
  res.json({ categories });
});

export const renameMaterialCategory = asyncHandler(async (req, res) => {
  const oldCategory = toUpper(req.params.category);
  const newCategory = toUpper(req.body.category || req.body.newCategory);

  if (!oldCategory || !newCategory) {
    throw new AppError('category is required', 400);
  }
  if (oldCategory === newCategory) {
    return res.json({ category: newCategory, modifiedCount: 0 });
  }

  const result = await materialsRepository.updateMaterialsByCategory(oldCategory, {
    category: newCategory,
    updatedBy: req.user.id,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_CATEGORY_RENAMED',
    entityType: 'MATERIAL_CATEGORY',
    entityId: oldCategory,
    before: { category: oldCategory },
    after: { category: newCategory, modifiedCount: result.modifiedCount || 0 },
    req,
  });

  res.json({ category: newCategory, modifiedCount: result.modifiedCount || 0 });
});

export const deleteMaterialCategory = asyncHandler(async (req, res) => {
  const category = toUpper(req.params.category);
  const replacementCategory = toUpper(req.body.replacementCategory || req.body.category || 'GENERAL');

  if (!category) {
    throw new AppError('category is required', 400);
  }
  if (category === replacementCategory) {
    throw new AppError('replacementCategory must be different', 400);
  }

  const result = await materialsRepository.updateMaterialsByCategory(category, {
    category: replacementCategory,
    updatedBy: req.user.id,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'MATERIAL_CATEGORY_DELETED',
    entityType: 'MATERIAL_CATEGORY',
    entityId: category,
    before: { category },
    after: { replacementCategory, modifiedCount: result.modifiedCount || 0 },
    req,
  });

  res.json({ replacementCategory, modifiedCount: result.modifiedCount || 0 });
});

export const createMaterial = asyncHandler(async (req, res) => {
  const code = toUpper(req.body.code);
  const name = toCleanString(req.body.name);

  if (!code || !name) {
    throw new AppError('code and name are required', 400);
  }
  await ensureUniqueBarcode({ barcode: req.body.barcode });

  const { image, attachments } = resolveUploadFiles(req);
  const warehouseId = toCleanString(req.body.warehouseId || req.body.warehouse);
  const openingQty = Math.max(0, toNumber(req.body.currentQty || req.body.qtyOnHand, 0));
  const minStock = Math.max(0, toNumber(req.body.minStock, 0));

  const created = await materialsRepository.createMaterial({
    code,
    name,
    barcode: toCleanString(req.body.barcode),
    imageUrl: image?.publicUrl || toCleanString(req.body.imageUrl),
    category: toUpper(req.body.category || 'GENERAL'),
    brand: toCleanString(req.body.brand),
    model: toCleanString(req.body.model),
    description: toCleanString(req.body.description),
    unit: toUpper(req.body.unit || 'PIECE'),
    trackSerial: boolFromBody(req.body.trackSerial),
    trackBatch: boolFromBody(req.body.trackBatch),
    minStock,
    estimatedUnitCost: Math.max(0, toNumber(req.body.estimatedUnitCost || req.body.purchasePrice, 0)),
    storageLocation: toCleanString(req.body.storageLocation),
    shelfSection: toCleanString(req.body.shelfSection),
    productStatus: resolveProductStatus({
      explicitStatus: req.body.productStatus,
      qtyOnHand: openingQty,
      minStock,
      active: req.body.active === undefined ? true : boolFromBody(req.body.active),
    }),
    supplierName: toCleanString(req.body.supplierName),
    purchaseCurrency: toUpper(req.body.purchaseCurrency || req.body.currency || 'IQD') === 'USD' ? 'USD' : 'IQD',
    purchaseDate: req.body.purchaseDate ? new Date(req.body.purchaseDate) : null,
    invoiceNo: toCleanString(req.body.invoiceNo),
    attachments,
    active: req.body.active === undefined ? true : boolFromBody(req.body.active),
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  if (warehouseId && openingQty > 0) {
    await ensureWarehouse(warehouseId);
    await adjustOnHandStock({
      materialId: created._id,
      warehouseId,
      qtyDelta: openingQty,
      avgCost: Math.max(0, toNumber(req.body.estimatedUnitCost || req.body.purchasePrice, 0)),
      transactionType: 'IN',
      referenceType: 'PRODUCT_INITIAL_STOCK',
      referenceId: created.code,
      notes: toCleanString(req.body.notes || 'إدخال كمية أولية للمنتج'),
      actorId: req.user.id,
    });
  }

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
      barcode: created.barcode,
      brand: created.brand,
      model: created.model,
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

  const stockWarehouseId = toCleanString(req.body.warehouseId || req.body.warehouse);
  if (req.body.currentQty !== undefined || req.body.qtyOnHand !== undefined || boolFromBody(req.body.transferStockOnWarehouseChange)) {
    if (!hasPermission(req.user, Permission.MANAGE_MATERIAL_INVENTORY)) throw new AppError('تعديل الأرصدة يحتاج صلاحية إدارة المخزون', 403);
    if (stockWarehouseId && !boolFromBody(req.body.transferStockOnWarehouseChange)) {
      const stockBalance = await materialsRepository.findStockBalance(material._id, stockWarehouseId);
      const newQuantity = Number(req.body.currentQty ?? req.body.qtyOnHand);
      if (!Number.isFinite(newQuantity) || newQuantity < 0) throw new AppError('كمية المخزون غير صالحة', 400);
      if (newQuantity < Number(stockBalance?.qtyOnHand || 0) && (req.user.role !== 'GENERAL_MANAGER' || !String(req.body.notes || '').trim())) throw new AppError('خفض الرصيد بتسوية الجرد متاح للمدير العام مع ذكر السبب؛ صرف الفني يتم عبر الطلب', 403);
      if (newQuantity < Number(stockBalance?.qtyReserved || 0)) throw new AppError('لا يمكن خفض الرصيد عن الكمية المحجوزة', 409);
    }
  }

  const payload = {};
  const { image, attachments } = resolveUploadFiles(req);

  if (req.body.name !== undefined) payload.name = toCleanString(req.body.name);
  if (req.body.code !== undefined) payload.code = toUpper(req.body.code);
  if (req.body.barcode !== undefined) {
    await ensureUniqueBarcode({ barcode: req.body.barcode, excludeId: material._id });
    payload.barcode = toCleanString(req.body.barcode);
  }
  if (image) {
    payload.imageUrl = image.publicUrl;
  } else if (req.body.imageUrl !== undefined) {
    payload.imageUrl = toCleanString(req.body.imageUrl);
  }
  if (req.body.category !== undefined) payload.category = toUpper(req.body.category);
  if (req.body.brand !== undefined) payload.brand = toCleanString(req.body.brand);
  if (req.body.model !== undefined) payload.model = toCleanString(req.body.model);
  if (req.body.description !== undefined) payload.description = toCleanString(req.body.description);
  if (req.body.unit !== undefined) payload.unit = toUpper(req.body.unit);
  if (req.body.trackSerial !== undefined) payload.trackSerial = boolFromBody(req.body.trackSerial);
  if (req.body.trackBatch !== undefined) payload.trackBatch = boolFromBody(req.body.trackBatch);
  if (req.body.minStock !== undefined) payload.minStock = Math.max(0, toNumber(req.body.minStock, 0));
  if (req.body.estimatedUnitCost !== undefined || req.body.purchasePrice !== undefined) payload.estimatedUnitCost = Math.max(0, toNumber(req.body.estimatedUnitCost || req.body.purchasePrice, 0));
  if (req.body.storageLocation !== undefined) payload.storageLocation = toCleanString(req.body.storageLocation);
  if (req.body.shelfSection !== undefined) payload.shelfSection = toCleanString(req.body.shelfSection);
  if (req.body.productStatus !== undefined) payload.productStatus = toUpper(req.body.productStatus);
  if (req.body.supplierName !== undefined) payload.supplierName = toCleanString(req.body.supplierName);
  if (req.body.purchaseCurrency !== undefined || req.body.currency !== undefined) payload.purchaseCurrency = toUpper(req.body.purchaseCurrency || req.body.currency) === 'USD' ? 'USD' : 'IQD';
  if (req.body.purchaseDate !== undefined) payload.purchaseDate = req.body.purchaseDate ? new Date(req.body.purchaseDate) : null;
  if (req.body.invoiceNo !== undefined) payload.invoiceNo = toCleanString(req.body.invoiceNo);
  if (req.body.active !== undefined) {
    payload.active = boolFromBody(req.body.active);
    if (!payload.active) {
      payload.productStatus = 'ARCHIVED';
      payload.archivedAt = new Date();
      payload.archivedBy = req.user.id;
    }
  }
  if (attachments.length) payload.$push = { attachments: { $each: attachments } };
  payload.updatedBy = req.user.id;

  const updated = await materialsRepository.updateMaterialById(material._id, payload);
  const warehouseId = toCleanString(req.body.warehouseId || req.body.warehouse);
  const sourceWarehouseId = toCleanString(req.body.sourceWarehouseId || req.body.currentWarehouseId);
  const shouldTransferWarehouseStock = boolFromBody(req.body.transferStockOnWarehouseChange);
  const hasCurrentQtyInput = req.body.currentQty !== undefined || req.body.qtyOnHand !== undefined;
  let updatedBalance = null;
  let stockTransfer = null;

  if (warehouseId && sourceWarehouseId && sourceWarehouseId !== warehouseId && shouldTransferWarehouseStock) {
    await ensureWarehouse(sourceWarehouseId);
    await ensureWarehouse(warehouseId);
    const sourceBalance = await materialsRepository.findStockBalance(material._id, sourceWarehouseId);
    const reservedQty = roundQty(sourceBalance?.qtyReserved || 0);
    if (reservedQty > 0) {
      throw new AppError('لا يمكن تحويل المادة من المخزن الحالي لوجود كمية محجوزة عليها', 409);
    }

    const availableToTransfer = roundQty(sourceBalance?.qtyOnHand || 0);
    const transferQtyInput = Array.isArray(req.body.transferQty) ? req.body.transferQty.at(-1) : req.body.transferQty;
    const requestedTransferQty = transferQtyInput !== undefined
      ? roundQty(transferQtyInput)
      : availableToTransfer;
    const transferQty = Math.min(availableToTransfer, Math.max(0, requestedTransferQty));
    if (requestedTransferQty <= 0) {
      throw new AppError('كمية التحويل يجب أن تكون أكبر من صفر', 400);
    }
    if (requestedTransferQty > availableToTransfer) {
      throw new AppError(`كمية التحويل أكبر من الرصيد المتوفر. المتوفر: ${availableToTransfer}`, 400);
    }
    if (transferQty > 0) {
      const referenceId = `PRODUCT_WAREHOUSE_TRANSFER:${updated.code}:${Date.now()}`;
      await adjustOnHandStock({
        materialId: material._id,
        warehouseId: sourceWarehouseId,
        qtyDelta: -transferQty,
        avgCost: toNumber(sourceBalance?.avgCost || updated.estimatedUnitCost, 0),
        transactionType: 'OUT',
        referenceType: 'PRODUCT_WAREHOUSE_TRANSFER',
        referenceId,
        notes: toCleanString(req.body.notes || 'تحويل رصيد المادة عند تغيير مخزنها'),
        actorId: req.user.id,
        operationKey: `${referenceId}:OUT`,
      });
      await adjustOnHandStock({
        materialId: material._id,
        warehouseId,
        qtyDelta: transferQty,
        avgCost: toNumber(sourceBalance?.avgCost || updated.estimatedUnitCost, 0),
        transactionType: 'IN',
        referenceType: 'PRODUCT_WAREHOUSE_TRANSFER',
        referenceId,
        notes: toCleanString(req.body.notes || 'استلام رصيد المادة من المخزن السابق'),
        actorId: req.user.id,
        operationKey: `${referenceId}:IN`,
      });
      stockTransfer = {
        fromWarehouseId: sourceWarehouseId,
        toWarehouseId: warehouseId,
        quantity: transferQty,
        referenceId,
      };
    }
  }

  const skipRecountAfterPlainTransfer = !!stockTransfer;

  if (warehouseId && hasCurrentQtyInput && !skipRecountAfterPlainTransfer) {
    await ensureWarehouse(warehouseId);
    const requestedQtyOnHand = Math.max(0, roundQty(req.body.currentQty ?? req.body.qtyOnHand));
    const currentBalance = await materialsRepository.findStockBalance(material._id, warehouseId);
    const currentQtyOnHand = roundQty(currentBalance?.qtyOnHand || 0);
    const qtyDelta = roundQty(requestedQtyOnHand - currentQtyOnHand);

    if (qtyDelta !== 0) {
      await adjustOnHandStock({
        materialId: material._id,
        warehouseId,
        qtyDelta,
        avgCost: Math.max(0, toNumber(req.body.estimatedUnitCost || req.body.purchasePrice || updated.estimatedUnitCost, 0)),
        transactionType: 'ADJUSTMENT',
        referenceType: 'PRODUCT_STOCK_RECOUNT',
        referenceId: updated.code,
        notes: toCleanString(req.body.notes || 'تسوية كمية المنتج من شاشة تعديل المنتج'),
        actorId: req.user.id,
      });
    }
    updatedBalance = await materialsRepository.findStockBalance(material._id, warehouseId);
  } else if (warehouseId && stockTransfer) {
    updatedBalance = await materialsRepository.findStockBalance(material._id, warehouseId);
  }

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
      barcode: updated.barcode,
      brand: updated.brand,
      model: updated.model,
      stockAdjustment: updatedBalance
        ? {
          warehouseId,
          qtyOnHand: updatedBalance.qtyOnHand,
          qtyAvailable: computeQtyAvailable(updatedBalance),
        }
        : undefined,
      stockTransfer,
    },
    req,
  });

  res.json({
    material: updated,
    balance: updatedBalance ? {
      ...updatedBalance.toObject(),
      qtyAvailable: computeQtyAvailable(updatedBalance),
    } : undefined,
  });
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
  const type = toUpper(req.body.type || 'REGULAR');
  if (!['REGULAR', 'DAMAGED'].includes(type)) throw new AppError('نوع المخزن غير صالح', 400);

  if (!name || !code) {
    throw new AppError('name and code are required', 400);
  }

  const created = await materialsRepository.createWarehouse({
    name,
    code,
    type,
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

export const deleteWarehousePermanently = asyncHandler(async (req, res) => {
  const { warehouse, ...result } = await deleteWarehouseWithInventory({
    user: req.user,
    warehouseId: req.params.id,
    confirmationName: req.body.confirmationName,
    repository: materialsRepository,
  });
  await auditService.log({
    actorId: req.user.id,
    action: 'WAREHOUSE_PERMANENTLY_DELETED',
    entityType: 'WAREHOUSE',
    entityId: warehouse._id,
    before: { name: warehouse.name, code: warehouse.code, active: warehouse.active },
    after: { deleted: true, ...result },
    req,
  });
  res.json({ deleted: true, warehouseId: String(warehouse._id), ...result });
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
  let materialId = toCleanString(req.body.materialId || req.body.material);
  if (!materialId && req.body.barcode) {
    const material = await materialsRepository.findMaterialByBarcode(req.body.barcode);
    if (!material || !material.active) {
      throw new AppError('لا يوجد منتج بهذا الباركود', 404);
    }
    materialId = String(material._id);
  }
  const warehouseId = toCleanString(req.body.warehouseId || req.body.warehouse);
  const quantity = roundQty(req.body.quantity);
  const transactionType = toUpper(req.body.transactionType || (quantity >= 0 ? 'IN' : 'OUT'));
  if (transactionType === 'RETURN_IN') throw new AppError('استلام فائض الفني يتم من التصفية المعتمدة وربطه بالذمة', 409);
  if (quantity < 0 && (req.user.role !== 'GENERAL_MANAGER' || !String(req.body.notes || '').trim())) throw new AppError('الصرف للفني يتم بالطلب والاستلام؛ تصحيح الرصيد السالب للمدير العام مع سبب فقط', 403);

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

export const issueStockCart = asyncHandler(async (req, res, next) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const warehouses = [...new Set(items.map((item) => String(item.warehouseId || '')))];
  if (!items.length || warehouses.length !== 1 || !warehouses[0]) throw new AppError('يجب تحديد مخزن واحد لكل طلب', 400);
  const technicianId = String(req.body.employeeId || req.body.technicianId || '');
  if (!technicianId) throw new AppError('اختر الفني المستلم', 400);
  req.body = { ...req.body, operationKey: req.body.referenceId || req.body.operationKey, warehouseId: warehouses[0], requestedForId: technicianId,
    manualProjectName: req.body.projectId ? '' : 'طلب مواد للفني',
    items: items.map((item) => ({ materialId: item.materialId || item.material, requestedQty: item.quantity, notes: item.notes })) };
  return createMaterialRequest(req, res, next);
});
