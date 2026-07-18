import mongoose from 'mongoose';

const materialSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    barcode: {
      type: String,
      default: '',
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    category: {
      type: String,
      default: 'GENERAL',
      trim: true,
      uppercase: true,
    },
    brand: {
      type: String,
      default: '',
      trim: true,
    },
    model: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    unit: {
      type: String,
      default: 'PIECE',
      trim: true,
      uppercase: true,
    },
    trackSerial: {
      type: Boolean,
      default: false,
    },
    trackBatch: {
      type: Boolean,
      default: false,
    },
    minStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    estimatedUnitCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    storageLocation: {
      type: String,
      default: '',
      trim: true,
    },
    shelfSection: {
      type: String,
      default: '',
      trim: true,
    },
    productStatus: {
      type: String,
      enum: ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK', 'DAMAGED', 'ARCHIVED'],
      default: 'AVAILABLE',
      index: true,
    },
    supplierName: {
      type: String,
      default: '',
      trim: true,
    },
    purchaseCurrency: {
      type: String,
      enum: ['IQD', 'USD'],
      default: 'IQD',
    },
    purchaseDate: {
      type: Date,
      default: null,
    },
    invoiceNo: {
      type: String,
      default: '',
      trim: true,
    },
    attachments: {
      type: [
        {
          fileName: { type: String, default: '' },
          originalName: { type: String, default: '' },
          mimeType: { type: String, default: '' },
          size: { type: Number, default: 0, min: 0 },
          publicUrl: { type: String, default: '' },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

materialSchema.index(
  { barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } },
);

export const MaterialModel = mongoose.model('Material', materialSchema);
