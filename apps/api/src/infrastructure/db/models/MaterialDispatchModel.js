import mongoose from 'mongoose';

const dispatchItemSchema = new mongoose.Schema(
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
    deliveredQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    batchNo: {
      type: String,
      default: '',
      trim: true,
    },
    serials: {
      type: [String],
      default: [],
    },
    conditionAtDelivery: {
      type: String,
      default: '',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: true },
);

const materialDispatchSchema = new mongoose.Schema(
  {
    dispatchNo: {
      type: String,
      required: true,
      unique: true,
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
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deliveredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    preparedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    confirmationMethod: {
      type: String,
      enum: ['PIN', 'SIGNATURE', 'CHECKBOX'],
      default: 'CHECKBOX',
    },
    status: {
      type: String,
      enum: ['ISSUED', 'CONFIRMED', 'CANCELLED'],
      default: 'CONFIRMED',
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    items: {
      type: [dispatchItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export const MaterialDispatchModel = mongoose.model('MaterialDispatch', materialDispatchSchema);
