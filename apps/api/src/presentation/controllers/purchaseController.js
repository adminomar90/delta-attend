import crypto from 'crypto';
import path from 'path';
import { buildPurchaseQuoteExcel, buildPurchaseQuotePdf } from '../../infrastructure/reports/purchaseQuoteReportBuilder.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { sequenceService } from '../../application/services/sequenceService.js';
import { PurchaseRepository } from '../../infrastructure/db/repositories/PurchaseRepository.js';
import { SupplierRepository } from '../../infrastructure/db/repositories/SupplierRepository.js';
import {
  PurchaseRequestStatus,
  PurchaseSupplierStatus,
} from '../../infrastructure/db/models/PurchaseRequestModel.js';
import { UserModel } from '../../infrastructure/db/models/UserModel.js';
import { Permission } from '../../shared/constants.js';
import { resolvePermissions } from '../../shared/permissions.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import {
  materialsRepository,
  projectRepository,
  toCleanString,
  toNumber,
  roundQty,
  ensureWarehouse,
  adjustOnHandStock,
} from './materialsCommon.js';

const purchaseRepository = new PurchaseRepository();
const supplierRepository = new SupplierRepository();

const quoteHours = () => Math.max(1, Number(process.env.PURCHASE_QUOTE_EXPIRY_HOURS || 48));
const hashToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');
const makeToken = () => crypto.randomBytes(32).toString('hex');
const boolFromBody = (value) => value === true || ['true', '1', 'yes', 'on'].includes(String(value || '').toLowerCase());
const hasPerm = (user, permission) => resolvePermissions(user).includes(permission);
const supplierDisplayName = (supplier) => supplier.companyName || supplier.supplierName || '-';
const normalizePriority = (value) => {
  const priority = toCleanString(value || 'NORMAL').toUpperCase();
  return ['NORMAL', 'IMPORTANT', 'URGENT'].includes(priority) ? priority : 'NORMAL';
};

const purchasePermissions = [
  Permission.VIEW_PURCHASES,
  Permission.CREATE_PURCHASE_REQUESTS,
  Permission.MANAGE_PURCHASE_QUOTES,
  Permission.APPROVE_PURCHASES,
  Permission.RECEIVE_PURCHASES,
  Permission.VIEW_PURCHASE_REPORTS,
];

const notifyPurchaseUsers = async (payload = {}) => {
  const users = await UserModel.find({ active: true }).select('_id role permissions customPermissions');
  const recipients = users
    .filter((user) => purchasePermissions.some((permission) => hasPerm(user, permission)))
    .map((user) => user._id);
  await notificationService.notifyUsers(recipients, payload);
};

const quoteUrl = (req, token) => {
  const origin = req.body.publicOrigin || req.headers.origin || process.env.FRONTEND_ORIGIN?.split(',')?.[0] || 'http://localhost:3000';
  return `${String(origin).replace(/\/$/, '')}/purchase-quote/${token}`;
};

const publicAssetUrl = (req, assetPath) => {
  const value = toCleanString(assetPath);
  if (!value || /^https?:\/\//i.test(value)) return value;
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  const forwardedProtocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProtocol || req.protocol;
  return `${protocol}://${host}${value.startsWith('/') ? '' : '/'}${value}`;
};

const normalizeWhatsappPhone = (phone) => {
  let normalized = String(phone || '').replace(/[^\d+]/g, '');
  if (!normalized) return '';
  if (normalized.startsWith('+')) normalized = normalized.slice(1);
  if (normalized.startsWith('00')) normalized = normalized.slice(2);
  if (normalized.startsWith('0')) normalized = `964${normalized.slice(1)}`;
  return normalized;
};

const whatsappUrl = (phone, message) => {
  const normalized = normalizeWhatsappPhone(phone);
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : '';
};

const resolveStatus = (request) => {
  if (request.status === PurchaseRequestStatus.CANCELLED || request.status === PurchaseRequestStatus.RECEIVED) return request.status;
  if (request.purchaseOrder?.poNo) return request.status;
  const suppliers = request.suppliers || [];
  if (suppliers.some((item) => item.status === PurchaseSupplierStatus.QUOTED)) return PurchaseRequestStatus.QUOTED;
  if (suppliers.some((item) => [PurchaseSupplierStatus.SENT, PurchaseSupplierStatus.OPENED].includes(item.status))) return PurchaseRequestStatus.WAITING_QUOTES;
  return PurchaseRequestStatus.NEW;
};

const normalizeLines = (items = []) => items.map((item) => ({
  material: item.material?._id || item.material,
  materialName: item.materialName || item.material?.name || '',
  materialCode: item.materialCode || item.material?.code || '',
  category: item.category || item.material?.category || '',
  unit: item.unit || item.material?.unit || 'PIECE',
  requestedQty: Math.max(0, toNumber(item.requestedQty || item.quantity, 0)),
  notes: toCleanString(item.notes),
})).filter((item) => item.material && item.requestedQty > 0);

const buildComparison = (request) => {
  const suppliers = request.suppliers || [];
  const itemRows = (request.items || []).map((item) => {
    const quotes = suppliers.map((supplier) => {
      const line = (supplier.lines || []).find((quoteLine) => String(quoteLine.material || '') === String(item.material?._id || item.material || ''));
      return {
        supplierId: String(supplier.supplier?._id || supplier.supplier || ''),
        supplierName: supplierDisplayName(supplier),
        status: supplier.status,
        unitPrice: Number(line?.unitPrice || 0),
        totalPrice: Number(line?.totalPrice || 0),
        availability: line?.availability || '',
        alternativeName: line?.alternativeName || '',
        alternativeUnitPrice: Number(line?.alternativeUnitPrice || 0),
        notes: line?.notes || line?.alternativeNotes || '',
      };
    });
    const positivePrices = quotes.filter((quote) => quote.unitPrice > 0);
    const minUnitPrice = positivePrices.length ? Math.min(...positivePrices.map((quote) => quote.unitPrice)) : 0;
    return {
      materialId: String(item.material?._id || item.material || ''),
      materialName: item.materialName,
      requestedQty: item.requestedQty,
      unit: item.unit,
      minUnitPrice,
      quotes,
    };
  });

  const supplierTotals = suppliers.map((supplier) => {
    const linesTotal = (supplier.lines || []).reduce((sum, line) => sum + Number(line.totalPrice || 0), 0);
    return {
      supplierId: String(supplier.supplier?._id || supplier.supplier || ''),
      supplierName: supplierDisplayName(supplier),
      status: supplier.status,
      deliveryDays: supplier.deliveryDays,
      deliveryFee: Number(supplier.deliveryFee || 0),
      currency: supplier.currency || 'IQD',
      total: linesTotal + Number(supplier.deliveryFee || 0),
      generalNotes: supplier.generalNotes || '',
    };
  });
  const positiveTotals = supplierTotals.filter((item) => item.total > 0);
  const bestTotal = positiveTotals.length ? Math.min(...positiveTotals.map((item) => item.total)) : 0;

  return { itemRows, supplierTotals, bestTotal };
};

export const listPurchases = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = toCleanString(req.query.status);
  const purchases = await purchaseRepository.list(filter, { limit: 300 });
  res.json({ purchases });
});

export const getPurchase = asyncHandler(async (req, res) => {
  const purchase = await purchaseRepository.findById(req.params.id);
  if (!purchase) throw new AppError('Purchase request not found', 404);
  res.json({ purchase, comparison: buildComparison(purchase) });
});

export const purchaseSummary = asyncHandler(async (_req, res) => {
  const purchases = await purchaseRepository.list({}, { limit: 1000 });
  const counts = Object.values(PurchaseRequestStatus).reduce((acc, status) => ({ ...acc, [status]: 0 }), {});
  purchases.forEach((item) => { counts[item.status] = (counts[item.status] || 0) + 1; });
  res.json({ counts, recent: purchases.slice(0, 8) });
});

export const createPurchase = asyncHandler(async (req, res) => {
  const items = [];
  for (const input of Array.isArray(req.body.items) ? req.body.items : []) {
    const material = await materialsRepository.findMaterialById(input.materialId || input.material);
    if (!material || !material.active) throw new AppError('Material not found or inactive', 404);
    const requestedQty = Math.max(0, toNumber(input.quantity || input.requestedQty, 0));
    if (requestedQty <= 0) {
      throw new AppError(`أدخل كمية صحيحة للمادة ${material.name}`, 400);
    }
    items.push({
      material: material._id,
      materialName: material.name || material.code || 'مادة',
      materialCode: material.code,
      category: material.category,
      unit: material.unit,
      requestedQty,
      notes: toCleanString(input.notes),
    });
  }
  if (!items.length) throw new AppError('At least one material is required', 400);

  const suppliers = [];
  const expiresAt = new Date(Date.now() + quoteHours() * 60 * 60 * 1000);
  for (const supplierId of Array.isArray(req.body.supplierIds) ? req.body.supplierIds : []) {
    const supplier = await supplierRepository.findById(supplierId);
    if (!supplier) continue;
    const token = makeToken();
    const displayName = supplier.supplierName || supplier.companyName || supplier.contactPerson || 'مورد';
    suppliers.push({
      supplier: supplier._id,
      supplierName: displayName,
      companyName: supplier.companyName,
      contactPerson: supplier.contactPerson,
      phone: supplier.mainPhone,
      publicToken: token,
      tokenHash: hashToken(token),
      tokenExpiresAt: expiresAt,
      status: PurchaseSupplierStatus.NOT_SENT,
      _plainToken: token,
    });
  }
  if (!suppliers.length) throw new AppError('At least one supplier is required', 400);

  const project = req.body.projectId ? await projectRepository.findById(req.body.projectId) : null;
  const requestNo = await sequenceService.next('PURCHASE_REQUEST', { prefix: 'PR', digits: 5 });
  let created;
  try {
    created = await purchaseRepository.create({
      requestNo,
      createdBy: req.user.id,
      createdByName: req.user.fullName || '',
      project: project?._id || null,
      projectName: project?.name || toCleanString(req.body.projectName),
      reason: toCleanString(req.body.reason),
      priority: normalizePriority(req.body.priority),
      internalNotes: toCleanString(req.body.internalNotes),
      autoReceiveToStock: boolFromBody(req.body.autoReceiveToStock),
      defaultWarehouse: toCleanString(req.body.warehouseId) || null,
      items,
      suppliers: suppliers.map(({ _plainToken, ...item }) => item),
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      console.error('[Purchase Validation]', Object.values(error.errors).map((item) => item.message));
    }
    throw error;
  }

  await notifyPurchaseUsers({
    createdBy: req.user.id,
    type: 'PURCHASE_REQUEST_CREATED',
    titleAr: 'طلب شراء جديد',
    messageAr: `تم إنشاء طلب شراء ${requestNo}.`,
    metadata: { purchaseId: created._id, requestNo },
  });
  await auditService.log({ actorId: req.user.id, action: 'PURCHASE_CREATED', entityType: 'PURCHASE_REQUEST', entityId: created._id, after: { requestNo }, req });

  res.status(201).json({ purchase: created });
});

export const sendSupplierQuoteLink = asyncHandler(async (req, res) => {
  const purchase = await purchaseRepository.findById(req.params.id);
  if (!purchase) throw new AppError('Purchase request not found', 404);
  const quote = purchase.suppliers.id(req.params.supplierQuoteId);
  if (!quote) throw new AppError('Supplier quote not found', 404);

  const tokenIsUsable = quote.publicToken && quote.tokenExpiresAt && quote.tokenExpiresAt > new Date();
  const token = tokenIsUsable ? quote.publicToken : makeToken();
  quote.publicToken = token;
  quote.tokenHash = hashToken(token);
  if (!tokenIsUsable) {
    quote.tokenExpiresAt = new Date(Date.now() + quoteHours() * 60 * 60 * 1000);
  }
  quote.status = PurchaseSupplierStatus.SENT;
  quote.sentAt = new Date();
  purchase.status = PurchaseRequestStatus.WAITING_QUOTES;
  await purchase.save();

  const link = quoteUrl(req, token);
  const message = [
    'السلام عليكم،',
    'يرجى تزويدنا بعرض سعر للمواد المطلوبة من خلال الرابط التالي:',
    link,
    `رقم الطلب: ${purchase.requestNo}`,
    `تنتهي صلاحية الرابط: ${quote.tokenExpiresAt.toLocaleString('ar-IQ')}`,
    'مع التقدير.',
  ].join('\n');

  await notifyPurchaseUsers({
    createdBy: req.user.id,
    type: 'PURCHASE_QUOTE_LINK_SENT',
    titleAr: 'إرسال طلب تسعير',
    messageAr: `تم تجهيز رابط التسعير للمورد ${supplierDisplayName(quote)} للطلب ${purchase.requestNo}.`,
    metadata: { purchaseId: purchase._id, requestNo: purchase.requestNo, supplierQuoteId: quote._id },
  });
  await auditService.log({ actorId: req.user.id, action: 'PURCHASE_QUOTE_LINK_SENT', entityType: 'PURCHASE_REQUEST', entityId: purchase._id, after: { supplier: supplierDisplayName(quote) }, req });

  res.json({ link, whatsappUrl: whatsappUrl(quote.phone, message), message, expiresAt: quote.tokenExpiresAt });
});

export const getPublicQuote = asyncHandler(async (req, res) => {
  const token = toCleanString(req.params.token);
  const tokenHash = hashToken(token);
  const purchase = await purchaseRepository.findByTokenHash(tokenHash) || await purchaseRepository.findByPublicToken(token);
  if (!purchase) throw new AppError('الرابط غير صالح', 404);
  const quote = purchase.suppliers.find((item) => item.tokenHash === tokenHash || item.publicToken === token);
  if (!quote) throw new AppError('الرابط غير صالح', 404);
  if (quote.tokenExpiresAt < new Date()) {
    quote.status = PurchaseSupplierStatus.EXPIRED;
    await purchase.save();
    throw new AppError('انتهت صلاحية الرابط', 410);
  }
  if (quote.status === PurchaseSupplierStatus.QUOTED && !quote.allowEdit) {
    return res.json({ locked: true, requestNo: purchase.requestNo, supplierName: supplierDisplayName(quote), submittedAt: quote.submittedAt });
  }

  if (!quote.openedAt) {
    try {
      quote.openedAt = new Date();
      quote.openedIp = req.ip || '';
      quote.status = PurchaseSupplierStatus.OPENED;
      await purchase.save();
      await notifyPurchaseUsers({
        type: 'PURCHASE_QUOTE_OPENED',
        titleAr: 'فتح رابط التسعير',
        messageAr: `فتح المورد ${supplierDisplayName(quote)} رابط طلب ${purchase.requestNo}.`,
        metadata: { purchaseId: purchase._id, requestNo: purchase.requestNo },
      });
    } catch (error) {
      console.error('[Purchase Quote Open Tracking]', error.message);
    }
  }

  res.json({
    requestNo: purchase.requestNo,
    requestDate: purchase.requestDate,
    supplierName: supplierDisplayName(quote),
    items: (purchase.items || []).map((item) => ({
      _id: item._id,
      material: item.material?._id || item.material || null,
      materialName: item.materialName || item.material?.name || '-',
      materialCode: item.materialCode || item.material?.code || '',
      category: item.category || item.material?.category || '',
      unit: item.unit || item.material?.unit || '',
      model: item.material?.model || '',
      barcode: item.material?.barcode || '',
      brand: item.material?.brand || '',
      imageUrl: publicAssetUrl(req, item.material?.imageUrl),
      requestedQty: Number(item.requestedQty || 0),
      notes: item.notes || '',
    })),
    quote: {
      deliveryDays: quote.deliveryDays,
      validUntil: quote.validUntil,
      deliveryFee: quote.deliveryFee,
      currency: quote.currency,
      generalNotes: quote.generalNotes,
      lines: quote.lines,
    },
  });
});

export const submitPublicQuote = asyncHandler(async (req, res) => {
  let body = req.body;
  if (typeof req.body.payload === 'string') {
    try {
      body = JSON.parse(req.body.payload);
    } catch {
      throw new AppError('بيانات عرض السعر غير صالحة', 400);
    }
  }
  const token = toCleanString(req.params.token);
  const tokenHash = hashToken(token);
  const purchase = await purchaseRepository.findByTokenHash(tokenHash) || await purchaseRepository.findByPublicToken(token);
  if (!purchase) throw new AppError('الرابط غير صالح', 404);
  const quote = purchase.suppliers.find((item) => item.tokenHash === tokenHash || item.publicToken === token);
  if (!quote) throw new AppError('الرابط غير صالح', 404);
  if (quote.tokenExpiresAt < new Date()) throw new AppError('انتهت صلاحية الرابط', 410);
  if (quote.status === PurchaseSupplierStatus.QUOTED && !quote.allowEdit) throw new AppError('تم إرسال العرض مسبقاً', 409);

  quote.lines = (Array.isArray(body.lines) ? body.lines : []).map((line) => {
    const item = purchase.items.id(line.itemId) || purchase.items.find((row) => String(row.material) === String(line.materialId));
    const requestedQty = Number(item?.requestedQty || 0);
    const offeredQty = Math.max(0, toNumber(line.offeredQty, 0));
    const unitPrice = Math.max(0, toNumber(line.unitPrice, 0));
    return {
      material: item?.material || line.materialId || null,
      materialName: item?.materialName || line.materialName || '',
      requestedQty,
      availability: toCleanString(line.availability || 'AVAILABLE'),
      offeredQty,
      unitPrice,
      totalPrice: roundQty(offeredQty * unitPrice),
      alternativeName: toCleanString(line.alternativeName),
      alternativeUnitPrice: Math.max(0, toNumber(line.alternativeUnitPrice, 0)),
      alternativeNotes: toCleanString(line.alternativeNotes),
      notes: toCleanString(line.notes),
    };
  });
  quote.deliveryDays = Math.max(0, toNumber(body.deliveryDays, 0));
  quote.validUntil = body.validUntil ? new Date(body.validUntil) : null;
  quote.deliveryFee = Math.max(0, toNumber(body.deliveryFee, 0));
  quote.currency = toCleanString(body.currency || 'IQD') === 'USD' ? 'USD' : 'IQD';
  quote.generalNotes = toCleanString(body.generalNotes);
  if (req.files?.length) {
    quote.attachments.push(...req.files.map((file) => ({
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      publicUrl: `/uploads/${path.basename(file.filename)}`,
      uploadedAt: new Date(),
    })));
  }
  quote.submittedAt = new Date();
  quote.status = PurchaseSupplierStatus.QUOTED;
  quote.allowEdit = false;
  purchase.status = PurchaseRequestStatus.QUOTED;
  await purchase.save();

  await notifyPurchaseUsers({
    type: 'PURCHASE_QUOTE_SUBMITTED',
    titleAr: 'وصل عرض سعر',
    messageAr: `أرسل المورد ${supplierDisplayName(quote)} عرضه للطلب ${purchase.requestNo}.`,
    metadata: { purchaseId: purchase._id, requestNo: purchase.requestNo },
  });
  await auditService.log({ action: 'PURCHASE_QUOTE_SUBMITTED', entityType: 'PURCHASE_REQUEST', entityId: purchase._id, after: { supplier: supplierDisplayName(quote) }, req });
  res.json({ ok: true });
});

export const exportPurchaseQuotes = asyncHandler(async (req, res) => {
  const purchase = await purchaseRepository.findById(req.params.id);
  if (!purchase) throw new AppError('Purchase request not found', 404);
  const type = toCleanString(req.params.type).toLowerCase();
  if (!['pdf', 'excel'].includes(type)) throw new AppError('Unsupported export type', 400);
  const buffer = type === 'pdf' ? await buildPurchaseQuotePdf(purchase) : await buildPurchaseQuoteExcel(purchase);
  const extension = type === 'pdf' ? 'pdf' : 'xlsx';
  res.setHeader('Content-Type', type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="purchase-quotes-${purchase.requestNo}.${extension}"`);
  res.send(buffer);
});

export const approvePurchase = asyncHandler(async (req, res) => {
  const purchase = await purchaseRepository.findById(req.params.id);
  if (!purchase) throw new AppError('Purchase request not found', 404);
  const mode = toCleanString(req.body.mode || 'SINGLE_SUPPLIER');
  const selectedLines = [];
  let currency = 'IQD';
  let selectedSupplier = null;

  if (mode === 'PER_ITEM') {
    for (const selection of Array.isArray(req.body.selections) ? req.body.selections : []) {
      const quote = purchase.suppliers.id(selection.supplierQuoteId);
      const line = quote?.lines?.find((item) => String(item.material || '') === String(selection.materialId || ''));
      if (!quote || !line) continue;
      selectedSupplier = selectedSupplier || quote;
      currency = quote.currency || currency;
      selectedLines.push({
        material: line.material,
        materialName: line.materialName,
        supplier: quote.supplier,
        supplierName: supplierDisplayName(quote),
        quantity: Number(line.offeredQty || line.requestedQty || 0),
        unitPrice: Number(line.unitPrice || 0),
        totalPrice: Number(line.totalPrice || 0),
        alternativeName: line.alternativeName,
        notes: line.notes,
      });
    }
  } else {
    const quote = purchase.suppliers.id(req.body.supplierQuoteId);
    if (!quote || quote.status !== PurchaseSupplierStatus.QUOTED) throw new AppError('اختر عرضاً مسعراً', 400);
    selectedSupplier = quote;
    currency = quote.currency || currency;
    quote.lines.forEach((line) => selectedLines.push({
      material: line.material,
      materialName: line.materialName,
      supplier: quote.supplier,
      supplierName: supplierDisplayName(quote),
      quantity: Number(line.offeredQty || line.requestedQty || 0),
      unitPrice: Number(line.unitPrice || 0),
      totalPrice: Number(line.totalPrice || 0),
      alternativeName: line.alternativeName,
      notes: line.notes,
    }));
  }

  if (!selectedLines.length) throw new AppError('لا توجد مواد مختارة للاعتماد', 400);
  const poNo = await sequenceService.next('PURCHASE_ORDER', { prefix: 'PO', digits: 5 });
  purchase.purchaseOrder = {
    poNo,
    approvedAt: new Date(),
    approvedBy: req.user.id,
    supplier: selectedSupplier?.supplier || null,
    supplierName: selectedSupplier ? supplierDisplayName(selectedSupplier) : '',
    mode,
    totalAmount: selectedLines.reduce((sum, line) => sum + Number(line.totalPrice || 0), 0),
    currency,
    status: purchase.autoReceiveToStock ? 'RECEIVED' : 'WAITING_RECEIPT',
    selectedLines,
  };
  purchase.suppliers.forEach((quote) => {
    if (quote.status !== PurchaseSupplierStatus.QUOTED) quote.status = PurchaseSupplierStatus.LOCKED;
  });
  purchase.status = purchase.autoReceiveToStock ? PurchaseRequestStatus.RECEIVED : PurchaseRequestStatus.WAITING_RECEIPT;
  await purchase.save();

  if (purchase.autoReceiveToStock) {
    await receiveToStock({ purchase, req, warehouseId: req.body.warehouseId || purchase.defaultWarehouse, items: selectedLines });
  }

  await notifyPurchaseUsers({
    createdBy: req.user.id,
    type: 'PURCHASE_APPROVED',
    titleAr: 'اعتماد شراء',
    messageAr: `تم اعتماد أمر الشراء ${poNo} للطلب ${purchase.requestNo}.`,
    metadata: { purchaseId: purchase._id, requestNo: purchase.requestNo, poNo },
  });
  await auditService.log({ actorId: req.user.id, action: 'PURCHASE_APPROVED', entityType: 'PURCHASE_REQUEST', entityId: purchase._id, after: { poNo }, req });
  res.json({ purchase });
});

const receivedByMaterial = (purchase) => {
  const totals = new Map();
  for (const receipt of purchase.receipts || []) {
    for (const item of receipt.items || []) {
      const materialId = String(item.material?._id || item.material || '');
      totals.set(materialId, roundQty((totals.get(materialId) || 0) + Number(item.receivedQty || 0)));
    }
  }
  return totals;
};

const receiveToStock = async ({ purchase, req, warehouseId, items, notes = '', receiptNo: suppliedReceiptNo = '' }) => {
  const warehouse = await ensureWarehouse(warehouseId);
  const receiptNo = suppliedReceiptNo || await sequenceService.next('PURCHASE_RECEIPT', { prefix: 'RC', digits: 5 });
  const previousTotals = receivedByMaterial(purchase);
  const orderedByMaterial = new Map(
    (purchase.purchaseOrder?.selectedLines || []).map((line) => [
      String(line.material?._id || line.material),
      roundQty(line.quantity || 0),
    ]),
  );
  const receiptItems = [];
  const validatedItems = [];
  const projectedTotals = new Map(previousTotals);
  for (const item of items) {
    const receivedQty = Math.max(0, toNumber(item.receivedQty || item.quantity, 0));
    if (!item.material || receivedQty <= 0) continue;
    const materialId = String(item.material?._id || item.material);
    const orderedQty = orderedByMaterial.get(materialId) || 0;
    const alreadyReceived = projectedTotals.get(materialId) || 0;
    const remainingQty = roundQty(Math.max(0, orderedQty - alreadyReceived));
    if (receivedQty > remainingQty) {
      throw new AppError(`الكمية المستلمة للمادة ${item.materialName || materialId} تتجاوز المتبقي (${remainingQty})`, 409);
    }
    projectedTotals.set(materialId, roundQty(alreadyReceived + receivedQty));
    validatedItems.push({ item, receivedQty, materialId });
  }
  if (!validatedItems.length) throw new AppError('لا توجد كميات صالحة للاستلام', 400);

  for (const { item, receivedQty, materialId } of validatedItems) {
    await adjustOnHandStock({
      materialId: item.material,
      warehouseId: warehouse._id,
      qtyDelta: receivedQty,
      avgCost: Number(item.unitCost ?? item.unitPrice ?? 0),
      transactionType: 'IN',
      referenceType: 'PURCHASE_ORDER',
      referenceId: purchase.purchaseOrder?.poNo || purchase.requestNo,
      notes: notes || `شراء من المورد ${item.supplierName || purchase.purchaseOrder?.supplierName || '-'}`,
      actorId: req.user.id,
      operationKey: `PURCHASE_RECEIPT:${String(purchase._id)}:${receiptNo}:${materialId}`,
    });
    receiptItems.push({
      material: item.material,
      materialName: item.materialName,
      orderedQty: Number(item.quantity || 0),
      receivedQty,
      unitCost: Number(item.unitCost ?? item.unitPrice ?? 0),
      notes: toCleanString(item.notes),
    });
  }
  purchase.receipts.push({
    receiptNo,
    receivedAt: new Date(),
    receivedBy: req.user.id,
    warehouse: warehouse._id,
    warehouseName: warehouse.name,
    notes,
    items: receiptItems,
  });
  const fullyReceived = [...orderedByMaterial.entries()].every(
    ([materialId, orderedQty]) => (projectedTotals.get(materialId) || 0) >= orderedQty,
  );
  purchase.purchaseOrder.status = fullyReceived ? 'RECEIVED' : 'WAITING_RECEIPT';
  purchase.status = fullyReceived ? PurchaseRequestStatus.RECEIVED : PurchaseRequestStatus.WAITING_RECEIPT;
  purchase.receiptProcessing = { key: '', receiptNo: '', startedAt: null, startedBy: null };
  await purchase.save();
  return receiptNo;
};

export const receivePurchase = asyncHandler(async (req, res) => {
  const existing = await purchaseRepository.findById(req.params.id);
  if (!existing || !existing.purchaseOrder?.poNo) throw new AppError('Purchase order not found', 404);
  if (existing.status === PurchaseRequestStatus.RECEIVED || existing.purchaseOrder.status === 'RECEIVED') {
    throw new AppError('تم استلام أمر الشراء بالكامل مسبقًا', 409);
  }
  const receiptNo = await sequenceService.next('PURCHASE_RECEIPT', { prefix: 'RC', digits: 5 });
  const processingKey = `PURCHASE_RECEIVE:${String(existing._id)}:${receiptNo}`;
  const purchase = await purchaseRepository.claimReceipt(existing._id, {
    key: processingKey,
    receiptNo,
    actorId: req.user.id,
    staleBefore: new Date(Date.now() - 15 * 60 * 1000),
  });
  if (!purchase) throw new AppError('عملية استلام أمر الشراء قيد التنفيذ أو اكتملت بالفعل', 409);
  const linesByMaterial = new Map((purchase.purchaseOrder.selectedLines || []).map((line) => [String(line.material?._id || line.material), line]));
  const items = (Array.isArray(req.body.items) ? req.body.items : []).map((item) => {
    const selected = linesByMaterial.get(String(item.materialId || item.material));
    return {
      ...selected?.toObject?.() || selected || {},
      material: selected?.material?._id || selected?.material || item.materialId || item.material,
      materialName: selected?.materialName || item.materialName,
      quantity: selected?.quantity || item.orderedQty || item.receivedQty,
      receivedQty: item.receivedQty,
      unitCost: item.unitCost ?? selected?.unitPrice,
      notes: item.notes,
    };
  });
  try {
    await receiveToStock({
      purchase,
      req,
      warehouseId: req.body.warehouseId || purchase.defaultWarehouse,
      items,
      notes: toCleanString(req.body.notes),
      receiptNo,
    });
  } catch (error) {
    await purchaseRepository.releaseReceiptClaim(purchase._id, processingKey);
    throw error;
  }
  await notifyPurchaseUsers({
    createdBy: req.user.id,
    type: 'PURCHASE_RECEIVED',
    titleAr: 'استلام مشتريات',
    messageAr: `تم استلام مواد أمر الشراء ${purchase.purchaseOrder.poNo}.`,
    metadata: { purchaseId: purchase._id, requestNo: purchase.requestNo, receiptNo },
  });
  await auditService.log({ actorId: req.user.id, action: 'PURCHASE_RECEIVED', entityType: 'PURCHASE_REQUEST', entityId: purchase._id, after: { receiptNo }, req });
  res.json({ purchase, receiptNo });
});

export const cancelPurchase = asyncHandler(async (req, res) => {
  const purchase = await purchaseRepository.findById(req.params.id);
  if (!purchase) throw new AppError('Purchase request not found', 404);
  purchase.status = PurchaseRequestStatus.CANCELLED;
  purchase.cancelledAt = new Date();
  purchase.cancelledBy = req.user.id;
  purchase.cancellationReason = toCleanString(req.body.reason);
  await purchase.save();
  await auditService.log({ actorId: req.user.id, action: 'PURCHASE_CANCELLED', entityType: 'PURCHASE_REQUEST', entityId: purchase._id, after: { reason: purchase.cancellationReason }, req });
  res.json({ purchase });
});
