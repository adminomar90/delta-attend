import path from 'path';
import mongoose from 'mongoose';
import { ProjectInvoicePaymentMethod } from '../../infrastructure/db/models/ProjectInvoiceModel.js';
import { ProjectInvoiceRepository } from '../../infrastructure/db/repositories/ProjectInvoiceRepository.js';
import { buildProjectInvoicePdfBuffer } from '../../infrastructure/reports/projectInvoicePdfBuilder.js';
import { auditService } from '../../application/services/auditService.js';
import { env } from '../../config/env.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const repository = new ProjectInvoiceRepository();
const uploadRootDir = path.resolve(process.cwd(), env.uploadsDir);
const resolvePublicBaseUrl = (req) => `${req.protocol}://${req.get('host')}`;

const clean = (value) => String(value || '').trim();
const optionalObjectId = (value, fieldName) => {
  const text = clean(value);
  if (!text) return null;
  if (!mongoose.Types.ObjectId.isValid(text)) throw new AppError(`Invalid ${fieldName}`, 400);
  return text;
};

const amount = (value, fieldName) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) throw new AppError(`${fieldName} must be a positive number`, 400);
  return Math.round(number * 100) / 100;
};

const attachmentFromFile = (file, userId) => {
  if (!file) return null;
  return {
    url: `/uploads/${file.filename}`,
    originalName: file.originalname || '',
    mimeType: file.mimetype || '',
    size: Number(file.size || 0),
    uploadedBy: userId || null,
    uploadedAt: new Date(),
  };
};

const serialize = (invoice) => ({
  id: String(invoice._id || invoice.id || ''),
  _id: String(invoice._id || invoice.id || ''),
  supplierName: invoice.supplierName || invoice.supplier?.supplierName || invoice.supplier?.companyName || '',
  materialType: invoice.materialType || '',
  invoiceNo: invoice.invoiceNo || '',
  invoiceDate: invoice.invoiceDate || null,
  invoiceAmount: Number(invoice.invoiceAmount || 0),
  transportAmount: Number(invoice.transportAmount || 0),
  totalAmount: Number(invoice.totalAmount || 0),
  paidAmount: Number(invoice.paidAmount || 0),
  remainingAmount: Number(invoice.remainingAmount || 0),
  currency: invoice.currency || 'IQD',
  paymentMethod: invoice.paymentMethod || ProjectInvoicePaymentMethod.CREDIT,
  notes: invoice.notes || '',
  supplier: invoice.supplier ? {
    id: String(invoice.supplier._id || invoice.supplier),
    _id: String(invoice.supplier._id || invoice.supplier),
    supplierName: invoice.supplier.supplierName || '',
    companyName: invoice.supplier.companyName || '',
  } : null,
  originalInvoice: invoice.originalInvoice ? {
    id: String(invoice.originalInvoice._id || ''),
    url: invoice.originalInvoice.url || '',
    originalName: invoice.originalInvoice.originalName || '',
    mimeType: invoice.originalInvoice.mimeType || '',
    size: Number(invoice.originalInvoice.size || 0),
  } : null,
  createdBy: invoice.createdBy ? {
    id: String(invoice.createdBy._id || invoice.createdBy),
    fullName: invoice.createdBy.fullName || '',
    role: invoice.createdBy.role || '',
  } : null,
  createdAt: invoice.createdAt || null,
});

export const listProjectInvoices = asyncHandler(async (req, res) => {
  const invoices = await repository.listByProject(req.params.id);
  res.json({ invoices: invoices.map(serialize) });
});

export const createProjectInvoice = asyncHandler(async (req, res) => {
  const invoiceAmount = amount(req.body.invoiceAmount, 'invoiceAmount');
  const transportAmount = amount(req.body.transportAmount, 'transportAmount');
  const supplier = optionalObjectId(req.body.supplier || req.body.supplierId, 'supplier');
  const supplierName = clean(req.body.supplierName);
  const materialType = clean(req.body.materialType);
  const invoiceNo = clean(req.body.invoiceNo);
  const paymentMethod = clean(req.body.paymentMethod || ProjectInvoicePaymentMethod.CREDIT).toUpperCase();
  const totalAmount = invoiceAmount + transportAmount;
  const paidAmount = paymentMethod === ProjectInvoicePaymentMethod.CASH
    ? totalAmount
    : paymentMethod === ProjectInvoicePaymentMethod.PARTIAL
      ? amount(req.body.paidAmount, 'paidAmount')
      : 0;

  if (!supplier && !supplierName) throw new AppError('Supplier name is required', 400);
  if (!materialType) throw new AppError('Material type is required', 400);
  if (!invoiceNo) throw new AppError('Invoice number is required', 400);
  if (!Object.values(ProjectInvoicePaymentMethod).includes(paymentMethod)) throw new AppError('Invalid payment method', 400);
  if (paidAmount > totalAmount) throw new AppError('Paid amount cannot exceed invoice total', 400);

  const created = await repository.create({
    project: req.params.id,
    supplier,
    supplierName,
    materialType,
    invoiceNo,
    invoiceDate: req.body.invoiceDate ? new Date(req.body.invoiceDate) : null,
    invoiceAmount,
    transportAmount,
    totalAmount,
    paidAmount,
    remainingAmount: Math.max(0, totalAmount - paidAmount),
    currency: clean(req.body.currency || 'IQD').toUpperCase() === 'USD' ? 'USD' : 'IQD',
    paymentMethod,
    originalInvoice: attachmentFromFile(req.file, req.user.id),
    notes: clean(req.body.notes),
    createdBy: req.user.id,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_INVOICE_CREATED',
    entityType: 'PROJECT_INVOICE',
    entityId: created._id,
    after: {
      project: req.params.id,
      invoiceNo,
      totalAmount,
      paymentMethod,
    },
    req,
  });

  const invoices = await repository.listByProject(req.params.id, { _id: created._id });
  res.status(201).json({ invoice: serialize(invoices[0] || created) });
});

export const updateProjectInvoice = asyncHandler(async (req, res) => {
  const invoice = await repository.findOne(req.params.id, req.params.invoiceId);
  if (!invoice) throw new AppError('Project invoice not found', 404);

  const invoiceAmount = amount(req.body.invoiceAmount, 'invoiceAmount');
  const transportAmount = amount(req.body.transportAmount, 'transportAmount');
  const supplier = optionalObjectId(req.body.supplier || req.body.supplierId, 'supplier');
  const supplierName = clean(req.body.supplierName);
  const materialType = clean(req.body.materialType);
  const invoiceNo = clean(req.body.invoiceNo);
  const paymentMethod = clean(req.body.paymentMethod || ProjectInvoicePaymentMethod.CREDIT).toUpperCase();
  const totalAmount = invoiceAmount + transportAmount;
  const paidAmount = paymentMethod === ProjectInvoicePaymentMethod.CASH
    ? totalAmount
    : paymentMethod === ProjectInvoicePaymentMethod.PARTIAL
      ? amount(req.body.paidAmount, 'paidAmount')
      : 0;

  if (!supplier && !supplierName) throw new AppError('Supplier name is required', 400);
  if (!materialType) throw new AppError('Material type is required', 400);
  if (!invoiceNo) throw new AppError('Invoice number is required', 400);
  if (!Object.values(ProjectInvoicePaymentMethod).includes(paymentMethod)) throw new AppError('Invalid payment method', 400);
  if (paidAmount > totalAmount) throw new AppError('Paid amount cannot exceed invoice total', 400);

  const payload = {
    supplier,
    supplierName,
    materialType,
    invoiceNo,
    invoiceDate: req.body.invoiceDate ? new Date(req.body.invoiceDate) : null,
    invoiceAmount,
    transportAmount,
    totalAmount,
    paidAmount,
    remainingAmount: Math.max(0, totalAmount - paidAmount),
    currency: clean(req.body.currency || 'IQD').toUpperCase() === 'USD' ? 'USD' : 'IQD',
    paymentMethod,
    notes: clean(req.body.notes),
  };
  if (req.file) {
    payload.originalInvoice = attachmentFromFile(req.file, req.user.id);
  }

  const updated = await repository.updateById(req.params.id, req.params.invoiceId, payload);
  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_INVOICE_UPDATED',
    entityType: 'PROJECT_INVOICE',
    entityId: updated._id,
    before: { invoiceNo: invoice.invoiceNo, totalAmount: invoice.totalAmount },
    after: { invoiceNo: updated.invoiceNo, totalAmount: updated.totalAmount },
    req,
  });

  res.json({ invoice: serialize(updated) });
});

export const exportProjectInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await repository.findOne(req.params.id, req.params.invoiceId);
  if (!invoice) throw new AppError('Project invoice not found', 404);
  const buffer = await buildProjectInvoicePdfBuffer({
    invoice,
    uploadRootDir,
    publicBaseUrl: resolvePublicBaseUrl(req),
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="project-invoice-${invoice.invoiceNo || req.params.invoiceId}.pdf"`);
  res.send(buffer);
});
