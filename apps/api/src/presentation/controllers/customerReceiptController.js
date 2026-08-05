import mongoose from 'mongoose';
import { CustomerReceiptRepository } from '../../infrastructure/db/repositories/CustomerReceiptRepository.js';
import { sequenceService } from '../../application/services/sequenceService.js';
import { auditService } from '../../application/services/auditService.js';
import { buildCustomerReceiptPdfBuffer } from '../../infrastructure/reports/customerReceiptPdfBuilder.js';
import { Roles } from '../../shared/constants.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const repository = new CustomerReceiptRepository();

const clean = (value) => String(value || '').trim();
const optionalObjectId = (value, field) => {
  const text = clean(value);
  if (!text) return null;
  if (!mongoose.Types.ObjectId.isValid(text)) throw new AppError(`Invalid ${field}`, 400);
  return text;
};

const assertFinancialManager = (req) => {
  if (req.user?.role !== Roles.FINANCIAL_MANAGER && req.user?.role !== Roles.GENERAL_MANAGER) {
    throw new AppError('Only the financial manager can add received customer amounts', 403);
  }
};

const serialize = (receipt) => ({
  id: String(receipt._id || receipt.id || ''),
  receiptNo: receipt.receiptNo || '',
  receiptDate: receipt.receiptDate || null,
  amount: Number(receipt.amount || 0),
  currency: receipt.currency || 'IQD',
  customerName: receipt.customerName || receipt.customer?.name || '',
  details: receipt.details || '',
  notes: receipt.notes || '',
  project: receipt.project ? {
    id: String(receipt.project._id || receipt.project),
    _id: String(receipt.project._id || receipt.project),
    name: receipt.project.name || '',
    code: receipt.project.code || '',
  } : null,
  customer: receipt.customer ? {
    id: String(receipt.customer._id || receipt.customer),
    _id: String(receipt.customer._id || receipt.customer),
    name: receipt.customer.name || '',
  } : null,
  receivedBy: receipt.receivedBy ? {
    id: String(receipt.receivedBy._id || receipt.receivedBy),
    _id: String(receipt.receivedBy._id || receipt.receivedBy),
    fullName: receipt.receivedBy.fullName || '',
    role: receipt.receivedBy.role || '',
  } : null,
  createdBy: receipt.createdBy ? {
    id: String(receipt.createdBy._id || receipt.createdBy),
    fullName: receipt.createdBy.fullName || '',
  } : null,
  createdAt: receipt.createdAt || null,
});

export const listCustomerReceipts = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.project || req.query.projectId) filter.project = optionalObjectId(req.query.project || req.query.projectId, 'project');
  const receipts = await repository.list(filter);
  res.json({ receipts: receipts.map(serialize) });
});

export const createCustomerReceipt = asyncHandler(async (req, res) => {
  assertFinancialManager(req);
  const amount = Number(req.body.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError('Amount must be greater than 0', 400);

  const customer = optionalObjectId(req.body.customer || req.body.customerId, 'customer');
  const customerName = clean(req.body.customerName);
  if (!customer && !customerName) throw new AppError('Customer name is required', 400);

  const payload = {
    receiptNo: await sequenceService.next('CUSTOMER_RECEIPT', { prefix: 'CR', digits: 5 }),
    receiptDate: req.body.receiptDate ? new Date(req.body.receiptDate) : new Date(),
    project: optionalObjectId(req.body.project || req.body.projectId, 'project'),
    customer,
    customerName,
    receivedBy: optionalObjectId(req.body.receivedBy || req.body.receivedById, 'receivedBy'),
    amount,
    currency: clean(req.body.currency || 'IQD').toUpperCase() === 'USD' ? 'USD' : 'IQD',
    details: clean(req.body.details),
    notes: clean(req.body.notes),
    createdBy: req.user.id,
  };
  if (!payload.receivedBy) throw new AppError('Received by employee is required', 400);

  const created = await repository.create(payload);
  const receipt = await repository.findById(created._id);
  await auditService.log({
    actorId: req.user.id,
    action: 'CUSTOMER_RECEIPT_CREATED',
    entityType: 'CUSTOMER_RECEIPT',
    entityId: created._id,
    after: payload,
    req,
  });

  res.status(201).json({ receipt: serialize(receipt) });
});

export const exportCustomerReceiptPdf = asyncHandler(async (req, res) => {
  const receipt = await repository.findById(req.params.id);
  if (!receipt) throw new AppError('Receipt not found', 404);
  const buffer = await buildCustomerReceiptPdfBuffer({ receipt });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="customer-receipt-${receipt.receiptNo || req.params.id}.pdf"`);
  res.send(buffer);
});
