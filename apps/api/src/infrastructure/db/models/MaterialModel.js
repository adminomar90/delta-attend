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
    category: {
      type: String,
      default: 'GENERAL',
      trim: true,
      uppercase: true,
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
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const MaterialModel = mongoose.model('Material', materialSchema);
