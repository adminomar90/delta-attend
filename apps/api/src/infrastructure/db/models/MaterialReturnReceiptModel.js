import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema(
  {
    material: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material',
      required: true,
      index: true,
    },
    materialName: {
      type: String,
      default: '',
      trim: true,
    },
    unit: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    returnedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    condition: {
      type: String,
      enum: ['NEW', 'USED_PARTIAL', 'DAMAGED', 'NOT_USABLE'],
      default: 'NEW',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: true },
);

const materialReturnReceiptSchema = new mongoose.Schema(
  {
    returnNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    reconciliation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialReconciliation',
      required: true,
      index: true,
    },
    custody: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialCustody',
      required: true,
      index: true,
    },
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialRequest',
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    returnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receivedByStorekeeper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ['RECEIVED', 'PARTIAL', 'RECEIVED_WITH_ISSUES'],
      default: 'RECEIVED',
      index: true,
    },
    inventoryPosted: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    items: {
      type: [returnItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export const MaterialReturnReceiptModel = mongoose.model('MaterialReturnReceipt', materialReturnReceiptSchema);
