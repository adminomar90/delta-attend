import mongoose from 'mongoose';

const stockBalanceSchema = new mongoose.Schema(
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
    qtyOnHand: {
      type: Number,
      default: 0,
      min: 0,
    },
    qtyReserved: {
      type: Number,
      default: 0,
      min: 0,
    },
    avgCost: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

stockBalanceSchema.index({ material: 1, warehouse: 1 }, { unique: true });

stockBalanceSchema.virtual('qtyAvailable').get(function qtyAvailable() {
  return Number(this.qtyOnHand || 0) - Number(this.qtyReserved || 0);
});

export const StockBalanceModel = mongoose.model('StockBalance', stockBalanceSchema);
