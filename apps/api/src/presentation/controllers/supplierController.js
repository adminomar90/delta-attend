import path from 'path';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import {
  buildSupplierExcelBuffer,
  buildSupplierPdfBuffer,
  calculateEvaluationScore,
  calculateSupplierAverage,
  cleanString,
  normalizeCompanyName,
  normalizePhone,
  supplierTypeOptions,
  toBool,
  toNumber,
  toStringArray,
} from '../../application/services/supplierService.js';
import { SupplierRepository } from '../../infrastructure/db/repositories/SupplierRepository.js';
import { SupplierStatus } from '../../infrastructure/db/models/SupplierModel.js';
import { UserModel } from '../../infrastructure/db/models/UserModel.js';
import { MaterialModel } from '../../infrastructure/db/models/MaterialModel.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { Permission } from '../../shared/constants.js';
import { resolvePermissions } from '../../shared/permissions.js';

const supplierRepository = new SupplierRepository();

const can = (user, permission) => resolvePermissions(user).includes(permission);

const buildFilter = (query = {}, user = {}) => {
  const filter = {};

  if (!toBool(query.includeArchived)) {
    filter.status = { $ne: SupplierStatus.ARCHIVED };
  }
  if (query.status) filter.status = cleanString(query.status);
  if (query.supplierType) filter.supplierType = cleanString(query.supplierType);
  if (query.city) filter.city = new RegExp(cleanString(query.city), 'i');
  if (query.governorate) filter.governorate = new RegExp(cleanString(query.governorate), 'i');
  if (query.approvedOnly !== undefined && toBool(query.approvedOnly)) filter.status = SupplierStatus.APPROVED;
  if (query.minRating) filter.ratingAverage = { $gte: toNumber(query.minRating, 0) };
  if (query.hasDebt !== undefined && toBool(query.hasDebt)) filter.$or = [{ hasOldDebt: true }, { oldDebtAmount: { $gt: 0 } }];

  const search = cleanString(query.search);
  const phone = cleanString(query.phone);
  if (search) {
    filter.$or = [
      { supplierName: new RegExp(search, 'i') },
      { companyName: new RegExp(search, 'i') },
      { supplierType: new RegExp(search, 'i') },
      { city: new RegExp(search, 'i') },
      { governorate: new RegExp(search, 'i') },
      { mainPhone: new RegExp(search, 'i') },
    ];
  }
  if (phone) filter.normalizedMainPhone = new RegExp(normalizePhone(phone), 'i');

  if (can(user, Permission.VIEW_APPROVED_SUPPLIERS) && !can(user, Permission.VIEW_SUPPLIERS)) {
    filter.status = SupplierStatus.APPROVED;
  }

  return filter;
};

const buildSupplierPayload = (body = {}, userId) => {
  const supplierName = cleanString(body.supplierName);
  const mainPhone = cleanString(body.mainPhone);
  const supplierType = cleanString(body.supplierType);

  if (!supplierName || !mainPhone || !supplierType) {
    throw new AppError('اسم المورد، نوع المورد، ورقم الهاتف الأساسي مطلوبة', 400);
  }

  const openingBalance = toNumber(body.openingBalance, 0);
  const oldDebtAmount = toNumber(body.oldDebtAmount, 0);

  return {
    supplierName,
    companyName: cleanString(body.companyName),
    normalizedCompanyName: normalizeCompanyName(body.companyName),
    supplierType,
    mainPhone,
    normalizedMainPhone: normalizePhone(mainPhone),
    secondPhone: cleanString(body.secondPhone),
    email: cleanString(body.email),
    website: cleanString(body.website),
    governorate: cleanString(body.governorate),
    city: cleanString(body.city),
    address: cleanString(body.address),
    contactPerson: cleanString(body.contactPerson),
    position: cleanString(body.position),
    salesManagerName: cleanString(body.salesManagerName),
    salesManagerPhone: cleanString(body.salesManagerPhone),
    salesManagerPosition: cleanString(body.salesManagerPosition),
    services: toStringArray(body.services),
    linkedMaterials: toStringArray(body.linkedMaterials),
    brands: toStringArray(body.brands),
    isOfficialAgent: toBool(body.isOfficialAgent),
    hasWarranty: toBool(body.hasWarranty),
    warrantyPeriod: cleanString(body.warrantyPeriod),
    deliveryTime: cleanString(body.deliveryTime),
    hasDelivery: toBool(body.hasDelivery),
    coverageAreas: toStringArray(body.coverageAreas),
    minimumOrder: cleanString(body.minimumOrder),
    pricingMethod: cleanString(body.pricingMethod),
    paymentMethod: cleanString(body.paymentMethod || 'AGREEMENT'),
    creditDays: Math.max(0, toNumber(body.creditDays, 0)),
    currency: cleanString(body.currency || 'IQD'),
    bankName: cleanString(body.bankName),
    accountNumber: cleanString(body.accountNumber),
    accountHolder: cleanString(body.accountHolder),
    openingBalance,
    hasOldDebt: toBool(body.hasOldDebt),
    oldDebtAmount,
    financialBalance: toNumber(body.financialBalance, openingBalance + oldDebtAmount),
    classification: cleanString(body.classification),
    lastInteractionAt: body.lastInteractionAt ? new Date(body.lastInteractionAt) : null,
    notes: cleanString(body.notes),
    financialNotes: cleanString(body.financialNotes),
    updatedBy: userId,
  };
};

const attachmentFromFile = (file, req, documentType = 'OTHER') => ({
  documentType,
  fileName: file.filename,
  originalName: file.originalname,
  mimeType: file.mimetype,
  size: file.size,
  storagePath: file.path,
  publicUrl: `/uploads/${path.basename(file.filename)}`,
  uploadedBy: req.user.id,
  uploadedByName: req.user.fullName || '',
  uploadedAt: new Date(),
});

const notifyManagers = async (payload) => {
  const users = await UserModel.find({ active: true }).select('_id role permissions customPermissions');
  const recipients = users
    .filter((user) => [Permission.MANAGE_SUPPLIERS, Permission.APPROVE_SUPPLIERS].some((permission) => can(user, permission)))
    .map((user) => user._id);
  await notificationService.notifyUsers(recipients, payload);
};

export const listSuppliers = asyncHandler(async (req, res) => {
  const suppliers = await supplierRepository.list(buildFilter(req.query, req.user));
  const materials = await MaterialModel.find({ active: true })
    .select('code name category unit active')
    .sort({ category: 1, name: 1 });
  res.json({ suppliers, supplierTypes: supplierTypeOptions, materials });
});

export const getSupplierById = asyncHandler(async (req, res) => {
  const supplier = await supplierRepository.findById(req.params.id);
  if (!supplier) throw new AppError('Supplier not found', 404);
  if (supplier.status !== SupplierStatus.APPROVED && !can(req.user, Permission.VIEW_SUPPLIERS)) {
    throw new AppError('Insufficient permissions', 403);
  }
  res.json({ supplier });
});

export const createSupplier = asyncHandler(async (req, res) => {
  const payload = buildSupplierPayload(req.body, req.user.id);
  const duplicate = await supplierRepository.findDuplicate(payload);
  if (duplicate) throw new AppError('هذا المورد موجود مسبقاً حسب رقم الهاتف أو اسم الشركة', 409);

  const attachments = (req.files || []).map((file) => attachmentFromFile(file, req, cleanString(req.body.documentType)));
  const created = await supplierRepository.create({
    ...payload,
    status: can(req.user, Permission.MANAGE_SUPPLIERS) ? cleanString(req.body.status || SupplierStatus.NEW) : SupplierStatus.UNDER_REVIEW,
    attachments,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  await auditService.log({ actorId: req.user.id, action: 'SUPPLIER_CREATED', entityType: 'SUPPLIER', entityId: created._id, after: created.toObject(), req });
  await notifyManagers({
    createdBy: req.user.id,
    type: 'SUPPLIER_CREATED',
    titleAr: 'مورد جديد',
    messageAr: `تمت إضافة مورد جديد: ${created.supplierName}`,
    metadata: { supplierId: created._id, supplierName: created.supplierName, status: created.status },
  });

  res.status(201).json({ supplier: created });
});

export const updateSupplier = asyncHandler(async (req, res) => {
  const supplier = await supplierRepository.findById(req.params.id);
  if (!supplier) throw new AppError('Supplier not found', 404);

  const payload = buildSupplierPayload(req.body, req.user.id);
  const duplicate = await supplierRepository.findDuplicate({ ...payload, excludeId: supplier._id });
  if (duplicate) throw new AppError('هذا المورد موجود مسبقاً حسب رقم الهاتف أو اسم الشركة', 409);

  const attachments = (req.files || []).map((file) => attachmentFromFile(file, req, cleanString(req.body.documentType)));
  if (attachments.length) payload.$push = { attachments: { $each: attachments } };

  const updated = await supplierRepository.updateById(supplier._id, payload);
  await auditService.log({ actorId: req.user.id, action: 'SUPPLIER_UPDATED', entityType: 'SUPPLIER', entityId: supplier._id, before: supplier.toObject(), after: updated.toObject(), req });
  res.json({ supplier: updated });
});

export const changeSupplierStatus = asyncHandler(async (req, res) => {
  const supplier = await supplierRepository.findById(req.params.id);
  if (!supplier) throw new AppError('Supplier not found', 404);

  const nextStatus = cleanString(req.body.status);
  if (!Object.values(SupplierStatus).includes(nextStatus)) throw new AppError('Invalid supplier status', 400);

  const payload = {
    status: nextStatus,
    updatedBy: req.user.id,
    $push: {
      statusHistory: {
        from: supplier.status,
        to: nextStatus,
        reason: cleanString(req.body.reason),
        changedBy: req.user.id,
        changedByName: req.user.fullName || '',
      },
    },
  };
  if (nextStatus === SupplierStatus.ARCHIVED) {
    payload.archivedAt = new Date();
    payload.archivedBy = req.user.id;
  }

  const updated = await supplierRepository.updateById(supplier._id, payload);
  await auditService.log({ actorId: req.user.id, action: 'SUPPLIER_STATUS_CHANGED', entityType: 'SUPPLIER', entityId: supplier._id, before: { status: supplier.status }, after: { status: nextStatus }, req });
  await notifyManagers({
    createdBy: req.user.id,
    type: 'SUPPLIER_STATUS_CHANGED',
    titleAr: 'تغيير حالة مورد',
    messageAr: `تم تغيير حالة المورد ${supplier.supplierName}`,
    metadata: { supplierId: supplier._id, from: supplier.status, to: nextStatus },
  });
  res.json({ supplier: updated });
});

export const archiveSupplier = asyncHandler(async (req, res) => {
  req.body.status = SupplierStatus.ARCHIVED;
  return changeSupplierStatus(req, res);
});

export const addSupplierEvaluation = asyncHandler(async (req, res) => {
  const supplier = await supplierRepository.findById(req.params.id);
  if (!supplier) throw new AppError('Supplier not found', 404);

  const evaluation = {
    evaluator: req.user.id,
    evaluatorName: req.user.fullName || '',
    reason: cleanString(req.body.reason),
    materialQuality: toNumber(req.body.materialQuality, 0),
    supplySpeed: toNumber(req.body.supplySpeed, 0),
    timeCommitment: toNumber(req.body.timeCommitment, 0),
    prices: toNumber(req.body.prices, 0),
    afterSales: toNumber(req.body.afterSales, 0),
    support: toNumber(req.body.support, 0),
    warrantyCommitment: toNumber(req.body.warrantyCommitment, 0),
    notes: cleanString(req.body.notes),
  };
  evaluation.score = calculateEvaluationScore(evaluation);
  if (!evaluation.score) throw new AppError('يجب إدخال تقييم واحد على الأقل', 400);

  const nextEvaluations = [...supplier.evaluations.map((item) => item.toObject()), evaluation];
  const ratingAverage = calculateSupplierAverage(nextEvaluations);
  const updated = await supplierRepository.updateById(supplier._id, {
    ratingAverage,
    lastInteractionAt: new Date(),
    updatedBy: req.user.id,
    $push: { evaluations: evaluation },
  });

  await auditService.log({ actorId: req.user.id, action: 'SUPPLIER_EVALUATED', entityType: 'SUPPLIER', entityId: supplier._id, after: { evaluation, ratingAverage }, req });
  if (ratingAverage < 3) {
    await notifyManagers({
      createdBy: req.user.id,
      type: 'SUPPLIER_LOW_RATING',
      titleAr: 'انخفاض تقييم مورد',
      messageAr: `انخفض تقييم المورد ${supplier.supplierName} إلى ${ratingAverage}/5`,
      metadata: { supplierId: supplier._id, ratingAverage },
    });
  }
  res.status(201).json({ supplier: updated });
});

export const addSupplierNote = asyncHandler(async (req, res) => {
  const supplier = await supplierRepository.findById(req.params.id);
  if (!supplier) throw new AppError('Supplier not found', 404);

  const note = cleanString(req.body.note);
  if (!note) throw new AppError('note is required', 400);

  const updated = await supplierRepository.updateById(supplier._id, {
    lastInteractionAt: new Date(),
    updatedBy: req.user.id,
    $push: {
      interactions: {
        note,
        type: cleanString(req.body.type || 'GENERAL'),
        createdBy: req.user.id,
        createdByName: req.user.fullName || '',
      },
    },
  });

  await auditService.log({ actorId: req.user.id, action: 'SUPPLIER_NOTE_ADDED', entityType: 'SUPPLIER', entityId: supplier._id, after: { note }, req });
  res.status(201).json({ supplier: updated });
});

export const deleteSupplierAttachment = asyncHandler(async (req, res) => {
  const supplier = await supplierRepository.findById(req.params.id);
  if (!supplier) throw new AppError('Supplier not found', 404);

  const updated = await supplierRepository.updateById(supplier._id, {
    updatedBy: req.user.id,
    $pull: { attachments: { _id: req.params.attachmentId } },
  });

  await auditService.log({ actorId: req.user.id, action: 'SUPPLIER_ATTACHMENT_DELETED', entityType: 'SUPPLIER', entityId: supplier._id, after: { attachmentId: req.params.attachmentId }, req });
  res.json({ supplier: updated });
});

export const exportSuppliersExcel = asyncHandler(async (req, res) => {
  const suppliers = await supplierRepository.list(buildFilter(req.query, req.user));
  const buffer = await buildSupplierExcelBuffer(suppliers);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="suppliers-report.xlsx"');
  res.send(Buffer.from(buffer));
});

export const exportSuppliersPdf = asyncHandler(async (req, res) => {
  const suppliers = await supplierRepository.list(buildFilter(req.query, req.user));
  const buffer = await buildSupplierPdfBuffer(suppliers);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="suppliers-report.pdf"');
  res.send(buffer);
});
