import mongoose from 'mongoose';

const stockTransactionSchema = new mongoose.Schema(
  {
    material: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material',
      required: true,
      index: true,
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialRequest',
      default: null,
      index: true,
    },
    transactionType: {
      type: String,
      enum: [
        'IN',
        'OUT',
        'RESERVE',
        'RELEASE',
        'RETURN_IN',
        'DAMAGE',
        'LOSS',
        'ADJUSTMENT',
      ],
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unitCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    referenceType: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    referenceId: {
      type: String,
      default: '',
      trim: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    performedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

export const StockTransactionModel = mongoose.model('StockTransaction', stockTransactionSchema);
