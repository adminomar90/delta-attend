import mongoose from 'mongoose';

export const ProjectInvoicePaymentMethod = {
  CASH: 'CASH',
  CREDIT: 'CREDIT',
  PARTIAL: 'PARTIAL',
};

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, default: '', trim: true },
    originalName: { type: String, default: '', trim: true },
    mimeType: { type: String, default: '', trim: true },
    size: { type: Number, default: 0, min: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const projectInvoiceSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
    supplierName: { type: String, required: true, trim: true, index: true },
    materialType: { type: String, required: true, trim: true, index: true },
    invoiceNo: { type: String, required: true, trim: true, index: true },
    invoiceDate: { type: Date, default: null, index: true },
    invoiceAmount: { type: Number, required: true, min: 0 },
    transportAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, enum: ['IQD', 'USD'], default: 'IQD', uppercase: true, trim: true },
    paymentMethod: {
      type: String,
      enum: Object.values(ProjectInvoicePaymentMethod),
      default: ProjectInvoicePaymentMethod.CREDIT,
      index: true,
    },
    originalInvoice: { type: attachmentSchema, default: null },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

projectInvoiceSchema.index({ project: 1, invoiceNo: 1 });

export const ProjectInvoiceModel = mongoose.model('ProjectInvoice', projectInvoiceSchema);
