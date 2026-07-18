import mongoose from 'mongoose';

export const PurchaseRequestStatus = {
  NEW: 'NEW',
  WAITING_QUOTES: 'WAITING_QUOTES',
  QUOTED: 'QUOTED',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  APPROVED: 'APPROVED',
  WAITING_RECEIPT: 'WAITING_RECEIPT',
  RECEIVED: 'RECEIVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
};

export const PurchaseSupplierStatus = {
  NOT_SENT: 'NOT_SENT',
  SENT: 'SENT',
  OPENED: 'OPENED',
  QUOTED: 'QUOTED',
  EXPIRED: 'EXPIRED',
  LOCKED: 'LOCKED',
  REOPENED: 'REOPENED',
};

const attachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: '', trim: true },
    originalName: { type: String, default: '', trim: true },
    mimeType: { type: String, default: '', trim: true },
    size: { type: Number, default: 0, min: 0 },
    publicUrl: { type: String, default: '', trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const requestItemSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
    materialName: { type: String, required: true, trim: true },
    materialCode: { type: String, default: '', trim: true },
    category: { type: String, default: '', trim: true },
    unit: { type: String, default: 'PIECE', trim: true },
    requestedQty: { type: Number, required: true, min: 0 },
    notes: { type: String, default: '', trim: true },
  },
  { _id: true },
);

const quoteLineSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', default: null },
    materialName: { type: String, default: '', trim: true },
    requestedQty: { type: Number, default: 0, min: 0 },
    availability: {
      type: String,
      enum: ['AVAILABLE', 'UNAVAILABLE', 'PARTIAL'],
      default: 'AVAILABLE',
    },
    offeredQty: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, default: 0, min: 0 },
    totalPrice: { type: Number, default: 0, min: 0 },
    alternativeName: { type: String, default: '', trim: true },
    alternativeUnitPrice: { type: Number, default: 0, min: 0 },
    alternativeNotes: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
  },
  { _id: true },
);

const supplierQuoteSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, required: true, trim: true },
    companyName: { type: String, default: '', trim: true },
    contactPerson: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    publicToken: { type: String, default: '', trim: true },
    tokenHash: { type: String, required: true, trim: true, index: true },
    tokenExpiresAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: Object.values(PurchaseSupplierStatus),
      default: PurchaseSupplierStatus.NOT_SENT,
      index: true,
    },
    sentAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    openedIp: { type: String, default: '', trim: true },
    submittedAt: { type: Date, default: null },
    allowEdit: { type: Boolean, default: false },
    deliveryDays: { type: Number, default: 0, min: 0 },
    validUntil: { type: Date, default: null },
    deliveryFee: { type: Number, default: 0, min: 0 },
    currency: { type: String, enum: ['IQD', 'USD'], default: 'IQD' },
    generalNotes: { type: String, default: '', trim: true },
    lines: { type: [quoteLineSchema], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { _id: true },
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNo: { type: String, default: '', trim: true, index: true },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    supplierName: { type: String, default: '', trim: true },
    mode: { type: String, enum: ['SINGLE_SUPPLIER', 'PER_ITEM'], default: 'SINGLE_SUPPLIER' },
    totalAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, enum: ['IQD', 'USD'], default: 'IQD' },
    status: {
      type: String,
      enum: ['APPROVED', 'PREPARING', 'WAITING_RECEIPT', 'RECEIVED', 'CANCELLED'],
      default: 'APPROVED',
    },
    selectedLines: {
      type: [
        {
          material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', default: null },
          materialName: { type: String, default: '', trim: true },
          supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
          supplierName: { type: String, default: '', trim: true },
          quantity: { type: Number, default: 0, min: 0 },
          unitPrice: { type: Number, default: 0, min: 0 },
          totalPrice: { type: Number, default: 0, min: 0 },
          alternativeName: { type: String, default: '', trim: true },
          notes: { type: String, default: '', trim: true },
        },
      ],
      default: [],
    },
  },
  { _id: true },
);

const receiptSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, default: '', trim: true },
    receivedAt: { type: Date, default: Date.now },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    warehouseName: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    attachments: { type: [attachmentSchema], default: [] },
    items: {
      type: [
        {
          material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', default: null },
          materialName: { type: String, default: '', trim: true },
          orderedQty: { type: Number, default: 0, min: 0 },
          receivedQty: { type: Number, default: 0, min: 0 },
          unitCost: { type: Number, default: 0, min: 0 },
          notes: { type: String, default: '', trim: true },
        },
      ],
      default: [],
    },
  },
  { _id: true },
);

const purchaseRequestSchema = new mongoose.Schema(
  {
    requestNo: { type: String, required: true, unique: true, trim: true, index: true },
    requestDate: { type: Date, default: Date.now, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, default: '', trim: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    projectName: { type: String, default: '', trim: true },
    reason: { type: String, default: '', trim: true },
    priority: { type: String, enum: ['NORMAL', 'IMPORTANT', 'URGENT'], default: 'NORMAL', index: true },
    status: { type: String, enum: Object.values(PurchaseRequestStatus), default: PurchaseRequestStatus.NEW, index: true },
    internalNotes: { type: String, default: '', trim: true },
    autoReceiveToStock: { type: Boolean, default: false },
    defaultWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    items: { type: [requestItemSchema], default: [] },
    suppliers: { type: [supplierQuoteSchema], default: [] },
    purchaseOrder: { type: purchaseOrderSchema, default: null },
    receipts: { type: [receiptSchema], default: [] },
    receiptProcessing: {
      key: { type: String, default: '', trim: true },
      receiptNo: { type: String, default: '', trim: true },
      startedAt: { type: Date, default: null },
      startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    attachments: { type: [attachmentSchema], default: [] },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancellationReason: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

purchaseRequestSchema.index({ status: 1, updatedAt: -1 });

export const PurchaseRequestModel = mongoose.model('PurchaseRequest', purchaseRequestSchema);
