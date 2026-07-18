import mongoose from 'mongoose';

export const SupplierStatus = {
  NEW: 'NEW',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
};

export const SupplierPaymentMethod = {
  CASH: 'CASH',
  CREDIT: 'CREDIT',
  INSTALLMENTS: 'INSTALLMENTS',
  TRANSFER: 'TRANSFER',
  AGREEMENT: 'AGREEMENT',
};

export const SupplierCurrency = {
  IQD: 'IQD',
  USD: 'USD',
};

const attachmentSchema = new mongoose.Schema(
  {
    documentType: { type: String, default: 'OTHER', trim: true },
    fileName: { type: String, default: '', trim: true },
    originalName: { type: String, default: '', trim: true },
    mimeType: { type: String, default: '', trim: true },
    size: { type: Number, default: 0, min: 0 },
    storagePath: { type: String, default: '', trim: true },
    publicUrl: { type: String, default: '', trim: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedByName: { type: String, default: '', trim: true },
    uploadedAt: { type: Date, default: Date.now },
    notes: { type: String, default: '', trim: true },
  },
  { _id: true },
);

const evaluationSchema = new mongoose.Schema(
  {
    evaluator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    evaluatorName: { type: String, default: '', trim: true },
    evaluatedAt: { type: Date, default: Date.now },
    reason: { type: String, default: '', trim: true },
    materialQuality: { type: Number, default: 0, min: 0, max: 5 },
    supplySpeed: { type: Number, default: 0, min: 0, max: 5 },
    timeCommitment: { type: Number, default: 0, min: 0, max: 5 },
    prices: { type: Number, default: 0, min: 0, max: 5 },
    afterSales: { type: Number, default: 0, min: 0, max: 5 },
    support: { type: Number, default: 0, min: 0, max: 5 },
    warrantyCommitment: { type: Number, default: 0, min: 0, max: 5 },
    score: { type: Number, default: 0, min: 0, max: 5 },
    notes: { type: String, default: '', trim: true },
  },
  { _id: true },
);

const noteSchema = new mongoose.Schema(
  {
    note: { type: String, required: true, trim: true },
    type: { type: String, default: 'GENERAL', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const statusHistorySchema = new mongoose.Schema(
  {
    from: { type: String, default: '', trim: true },
    to: { type: String, default: '', trim: true },
    reason: { type: String, default: '', trim: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    changedByName: { type: String, default: '', trim: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const supplierSchema = new mongoose.Schema(
  {
    supplierName: { type: String, required: true, trim: true, index: true },
    companyName: { type: String, default: '', trim: true, index: true },
    normalizedCompanyName: { type: String, default: '', trim: true },
    supplierType: { type: String, required: true, trim: true, index: true },
    mainPhone: { type: String, required: true, trim: true },
    normalizedMainPhone: { type: String, required: true, trim: true },
    secondPhone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    website: { type: String, default: '', trim: true },
    governorate: { type: String, default: '', trim: true, index: true },
    city: { type: String, default: '', trim: true, index: true },
    address: { type: String, default: '', trim: true },
    contactPerson: { type: String, default: '', trim: true },
    position: { type: String, default: '', trim: true },
    salesManagerName: { type: String, default: '', trim: true },
    salesManagerPhone: { type: String, default: '', trim: true },
    salesManagerPosition: { type: String, default: '', trim: true },
    services: { type: [String], default: [] },
    brands: { type: [String], default: [] },
    isOfficialAgent: { type: Boolean, default: false },
    hasWarranty: { type: Boolean, default: false },
    warrantyPeriod: { type: String, default: '', trim: true },
    deliveryTime: { type: String, default: '', trim: true },
    hasDelivery: { type: Boolean, default: false },
    coverageAreas: { type: [String], default: [] },
    minimumOrder: { type: String, default: '', trim: true },
    pricingMethod: { type: String, default: '', trim: true },
    paymentMethod: { type: String, enum: Object.values(SupplierPaymentMethod), default: SupplierPaymentMethod.AGREEMENT },
    creditDays: { type: Number, default: 0, min: 0 },
    currency: { type: String, enum: Object.values(SupplierCurrency), default: SupplierCurrency.IQD },
    bankName: { type: String, default: '', trim: true },
    accountNumber: { type: String, default: '', trim: true },
    accountHolder: { type: String, default: '', trim: true },
    openingBalance: { type: Number, default: 0 },
    hasOldDebt: { type: Boolean, default: false },
    oldDebtAmount: { type: Number, default: 0, min: 0 },
    financialBalance: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(SupplierStatus), default: SupplierStatus.NEW, index: true },
    classification: { type: String, default: '', trim: true },
    lastInteractionAt: { type: Date, default: null },
    ratingAverage: { type: Number, default: 0, min: 0, max: 5, index: true },
    notes: { type: String, default: '', trim: true },
    financialNotes: { type: String, default: '', trim: true },
    linkedMaterials: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Material' }],
    linkedProjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
    interactions: { type: [noteSchema], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    evaluations: { type: [evaluationSchema], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

supplierSchema.index({ normalizedMainPhone: 1 }, { unique: true });
supplierSchema.index(
  { normalizedCompanyName: 1 },
  { unique: true, partialFilterExpression: { normalizedCompanyName: { $type: 'string', $gt: '' } } },
);
supplierSchema.index({
  supplierName: 'text',
  companyName: 'text',
  mainPhone: 'text',
  supplierType: 'text',
  city: 'text',
  governorate: 'text',
  services: 'text',
  brands: 'text',
});

export const SupplierModel = mongoose.model('Supplier', supplierSchema);
