import mongoose from 'mongoose';

const reconciliationItemSchema = new mongoose.Schema(
  {
    custodyItem: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
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
    receivedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    consumedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    damagedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    lostQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    toReturnQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    returnedQtyConfirmed: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: true },
);

const materialReconciliationSchema = new mongoose.Schema(
  {
    reconcileNo: {
      type: String,
      required: true,
      unique: true,
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
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'],
      default: 'SUBMITTED',
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    reviewNotes: {
      type: String,
      default: '',
      trim: true,
    },
    pointsAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },
    returnReceiptRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialReturnReceipt',
      default: null,
      index: true,
    },
    items: {
      type: [reconciliationItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export const MaterialReconciliationModel = mongoose.model('MaterialReconciliation', materialReconciliationSchema);
