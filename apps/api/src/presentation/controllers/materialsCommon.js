import dayjs from 'dayjs';
import { env } from '../../config/env.js';
import { MaterialsRepository } from '../../infrastructure/db/repositories/MaterialsRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { ProjectRepository } from '../../infrastructure/db/repositories/ProjectRepository.js';
import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { GoalRepository } from '../../infrastructure/db/repositories/GoalRepository.js';
import { levelService } from '../../application/services/levelService.js';
import { badgeService } from '../../application/services/badgeService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { whatsappService } from '../../application/services/whatsappService.js';
import { buildWhatsAppSendUrl } from '../../shared/attendanceUtils.js';
import { resolveManagedUserIds } from '../../shared/accessScope.js';
import { AppError } from '../../shared/errors.js';

export const materialsRepository = new MaterialsRepository();
export const userRepository = new UserRepository();
export const projectRepository = new ProjectRepository();
export const pointsLedgerRepository = new PointsLedgerRepository();
export const goalRepository = new GoalRepository();

export const toCleanString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

export const toUpper = (value) => toCleanString(value).toUpperCase();

export const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const roundQty = (value) => Number(toNumber(value, 0).toFixed(4));

export const toPositiveQty = (value, fieldName) => {
  const qty = roundQty(value);
  if (qty <= 0) {
    throw new AppError(`${fieldName} must be greater than zero`, 400);
  }
  return qty;
};

export const toDateOrNull = (value) => {
  const raw = toCleanString(value);
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

export const parseArrayPayload = (value, fieldName) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      throw new AppError(`${fieldName} must be a valid JSON array`, 400);
    }
  }

  throw new AppError(`${fieldName} must be an array`, 400);
};

export const mapPriority = (value) => {
  const normalized = toUpper(value || 'NORMAL');
  if (!['URGENT', 'NORMAL', 'LOW'].includes(normalized)) {
    throw new AppError('priority must be URGENT, NORMAL, or LOW', 400);
  }
  return normalized;
};

export const sumBy = (items = [], selector) =>
  items.reduce((sum, item) => sum + Number(selector(item) || 0), 0);

export const computeQtyAvailable = (balance) =>
  roundQty(roundQty(balance?.qtyOnHand || 0) - roundQty(balance?.qtyReserved || 0));

export const resolveManagedScope = async (req) => {
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  return Array.isArray(managedUserIds)
    ? managedUserIds.map((item) => String(item))
    : null;
};

export const isWithinScope = (managedUserIds, userId) => {
  if (!Array.isArray(managedUserIds)) {
    return true;
  }
  return managedUserIds.includes(String(userId || ''));
};

export const resolveRequestedUserIdsFromRequest = (request) => {
  const ids = [];
  if (request?.requestedBy?._id || request?.requestedBy) {
    ids.push(String(request.requestedBy?._id || request.requestedBy));
  }
  if (request?.requestedFor?._id || request?.requestedFor) {
    ids.push(String(request.requestedFor?._id || request.requestedFor));
  }
  if (request?.assignedPreparer?._id || request?.assignedPreparer) {
    ids.push(String(request.assignedPreparer?._id || request.assignedPreparer));
  }
  return [...new Set(ids)];
};

export const assertRequestReadable = async (req, request) => {
  const actorId = String(req.user.id);
  const relatedUserIds = resolveRequestedUserIdsFromRequest(request);
  if (relatedUserIds.includes(actorId)) {
    return;
  }

  const managedUserIds = await resolveManagedScope(req);
  if (relatedUserIds.some((id) => isWithinScope(managedUserIds, id))) {
    return;
  }

  throw new AppError('You cannot access this material request', 403);
};

export const assertCustodyReadable = async (req, custody) => {
  const holderId = String(custody?.holder?._id || custody?.holder || '');
  if (holderId === String(req.user.id)) {
    return;
  }

  const managedUserIds = await resolveManagedScope(req);
  if (isWithinScope(managedUserIds, holderId)) {
    return;
  }

  throw new AppError('You cannot access this custody record', 403);
};

export const ensureWarehouse = async (warehouseId = '') => {
  const requestedId = toCleanString(warehouseId);
  if (requestedId) {
    const warehouse = await materialsRepository.findWarehouseById(requestedId);
    if (!warehouse || !warehouse.active) {
      throw new AppError('Warehouse not found or inactive', 404);
    }
    return warehouse;
  }

  const warehouses = await materialsRepository.listWarehouses({ active: true });
  if (!warehouses.length) {
    throw new AppError('No active warehouse available. Create a warehouse first.', 400);
  }

  return warehouses[0];
};

export const ensureWarehouseOptional = async (warehouseId = '') => {
  const requestedId = toCleanString(warehouseId);
  if (!requestedId) {
    return null;
  }

  const warehouse = await materialsRepository.findWarehouseById(requestedId);
  if (!warehouse || !warehouse.active) {
    throw new AppError('Warehouse not found or inactive', 404);
  }
  return warehouse;
};

export const ensureMaterial = async (materialId) => {
  const material = await materialsRepository.findMaterialById(materialId);
  if (!material || !material.active) {
    throw new AppError('Material not found or inactive', 404);
  }
  return material;
};

const nextManualMaterialCode = () => {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MAN-${stamp}-${random}`;
};

export const ensureMaterialFromItem = async (item = {}) => {
  const materialId = toCleanString(item.materialId || item.material);
  if (materialId) {
    return ensureMaterial(materialId);
  }

  const materialName = toCleanString(item.materialName || item.name || item.materialLabel);
  if (!materialName) {
    throw new AppError('Each item requires materialName or materialId', 400);
  }

  const materialCode = toUpper(item.materialCode || item.code);
  if (materialCode) {
    const byCode = await materialsRepository.findMaterialByCode(materialCode);
    if (byCode && byCode.active) {
      return byCode;
    }
    if (byCode && !byCode.active) {
      throw new AppError('Material code exists but inactive', 409);
    }
  }

  const byName = await materialsRepository.findMaterialByName(materialName);
  if (byName && byName.active) {
    return byName;
  }

  return materialsRepository.createMaterial({
    code: materialCode || nextManualMaterialCode(),
    name: materialName,
    category: toUpper(item.category || 'GENERAL') || 'GENERAL',
    unit: toUpper(item.unit || 'PIECE') || 'PIECE',
    active: true,
  });
};

export const adjustOnHandStock = async ({
  materialId,
  warehouseId,
  qtyDelta,
  avgCost,
  transactionType,
  projectId = null,
  requestId = null,
  referenceType = '',
  referenceId = '',
  notes = '',
  actorId = null,
}) => {
  const balance = await materialsRepository.upsertStockBalance(materialId, warehouseId, {});

  const currentOnHand = roundQty(balance.qtyOnHand || 0);
  const currentReserved = roundQty(balance.qtyReserved || 0);
  const nextOnHand = roundQty(currentOnHand + roundQty(qtyDelta));

  if (nextOnHand < 0) {
    throw new AppError('Insufficient stock in warehouse for requested operation', 409);
  }

  const payload = {
    qtyOnHand: nextOnHand,
    qtyReserved: currentReserved,
  };

  if (Number.isFinite(avgCost) && avgCost >= 0) {
    payload.avgCost = Number(avgCost);
  }

  await materialsRepository.upsertStockBalance(materialId, warehouseId, { $set: payload });

  await materialsRepository.createStockTransaction({
    material: materialId,
    warehouse: warehouseId,
    project: projectId || null,
    request: requestId || null,
    transactionType,
    quantity: Math.abs(roundQty(qtyDelta)),
    unitCost: Number(avgCost || 0),
    referenceType,
    referenceId,
    performedBy: actorId,
    performedAt: new Date(),
    notes,
  });
};

export const resolveRecipientPhone = async ({ userId, fallback }) => {
  if (!userId) {
    return toCleanString(fallback);
  }

  const user = await userRepository.findByIdWithManager(userId);
  const ownPhone = toCleanString(user?.phone);
  const managerPhone = toCleanString(user?.manager?.phone);
  return ownPhone || managerPhone || toCleanString(fallback);
};

export const sendWhatsappOps = async ({ to, message }) => {
  const normalizedTo = toCleanString(to);
  const fallbackUrl = normalizedTo ? buildWhatsAppSendUrl(normalizedTo, message) : '';
  const delivery = await whatsappService.sendTextMessage({
    to: normalizedTo,
    message,
  });

  return {
    delivery,
    url: delivery?.sent ? '' : fallbackUrl,
    recipient: normalizedTo,
  };
};

export const buildRequestWhatsappMessage = ({ request, detailsUrl }) => {
  const recipientName = request.requestedFor?.fullName || request.requestedBy?.fullName || '-';
  const projectName = request.project?.name || request.projectName || '-';
  const assignedPreparer = request.assignedPreparer?.fullName || '-';
  const requestedQty = sumBy(request.items || [], (item) => item.requestedQty);
  const approvedQty = sumBy(request.items || [], (item) => item.approvedQty);

  return [
    'إشعار طلب مواد - Delta Plus',
    `رقم الطلب: ${request.requestNo}`,
    `المشروع: ${projectName}`,
    `المستلم: ${recipientName}`,
    `مجهز الطلب: ${assignedPreparer}`,
    `الكمية المطلوبة: ${roundQty(requestedQty)}`,
    `الكمية المعتمدة: ${roundQty(approvedQty)}`,
    `الحالة الحالية: ${request.status}`,
    detailsUrl ? `رابط التفاصيل: ${detailsUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

export const buildCustodyWhatsappMessage = ({ custody, detailsUrl }) => {
  const projectName = custody.project?.name || '-';
  const totalReceived = sumBy(custody.items || [], (item) => item.receivedQty);
  const totalRemaining = sumBy(custody.items || [], (item) => item.remainingQty);

  return [
    'إشعار ذمة مواد - Delta Plus',
    `رقم الذمة: ${custody.custodyNo}`,
    `المشروع: ${projectName}`,
    `المستلم: ${custody.holder?.fullName || '-'}`,
    `المستلم كميات: ${roundQty(totalReceived)}`,
    `المتبقي: ${roundQty(totalRemaining)}`,
    `الحالة: ${custody.status}`,
    detailsUrl ? `رابط التفاصيل: ${detailsUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

export const buildReconciliationWhatsappMessage = ({ reconciliation, detailsUrl }) => {
  const projectName = reconciliation.project?.name || '-';
  const consumed = sumBy(reconciliation.items || [], (item) => item.consumedQty);
  const toReturn = sumBy(reconciliation.items || [], (item) => item.toReturnQty);

  return [
    'إشعار تصفية مواد - Delta Plus',
    `رقم التصفية: ${reconciliation.reconcileNo}`,
    `رقم الطلب: ${reconciliation.request?.requestNo || '-'}`,
    `المشروع: ${projectName}`,
    `المصروف الفعلي: ${roundQty(consumed)}`,
    `الكميات للراجع: ${roundQty(toReturn)}`,
    `الحالة: ${reconciliation.status}`,
    detailsUrl ? `رابط التفاصيل: ${detailsUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

export const awardCustodyPoints = async ({ holderId, points, reason, approverId }) => {
  const safePoints = Math.round(toNumber(points, 0));
  if (!safePoints) {
    return;
  }

  if (safePoints < 0 || safePoints > 1000) {
    throw new AppError('points must be between 0 and 1000', 400);
  }

  await pointsLedgerRepository.create({
    user: holderId,
    points: safePoints,
    category: 'MATERIAL_RECONCILIATION',
    reason,
    approvedBy: approverId,
  });

  const holder = await userRepository.findById(holderId);
  if (!holder) {
    return;
  }

  const nextPoints = Number(holder.pointsTotal || 0) + safePoints;
  const nextLevel = levelService.resolveLevel(nextPoints);
  const updated = await userRepository.incrementPointsAndSetLevel(holderId, safePoints, nextLevel);
  const generatedBadges = badgeService.evaluate(updated, 0);

  for (const badgeCode of generatedBadges) {
    if (!updated.badges.includes(badgeCode)) {
      await userRepository.attachBadge(updated._id, badgeCode);
    }
  }

  const goalUpdates = await goalRepository.incrementActiveGoals(updated._id, safePoints);
  for (const goal of goalUpdates) {
    if (goal.achieved) {
      await notificationService.notifyGoalAchieved(updated._id, goal);
    }
  }
};

export const defaultReportPeriod = (query = {}) => {
  const from = query.from ? dayjs(query.from).startOf('day') : dayjs().startOf('month');
  const to = query.to ? dayjs(query.to).endOf('day') : dayjs().endOf('month');

  if (!from.isValid() || !to.isValid()) {
    throw new AppError('Invalid date range', 400);
  }

  return {
    from,
    to,
  };
};

export const appDetailsUrl = (path) => `${env.frontendOrigin.replace(/\/$/, '')}${path}`;
