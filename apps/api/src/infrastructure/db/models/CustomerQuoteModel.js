import mongoose from 'mongoose';

const item = new mongoose.Schema({
  material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  name: { type: String, required: true }, code: String, unit: String,
  imageUrl: { type: String, default: '' }, brand: { type: String, default: '' }, model: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 0.001 },
  unitPrice: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
}, { _id: false });
const schema = new mongoose.Schema({
  quoteNo: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerMode: { type: String, enum: ['EXISTING', 'MANUAL', 'NONE'], required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName: { type: String, default: '' }, phone: { type: String, default: '' }, address: { type: String, default: '' },
  title: { type: String, default: 'عرض أسعار' },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  warehouseName: String,
  currency: { type: String, enum: ['IQD', 'USD'], default: 'IQD' },
  items: { type: [item], required: true },
  installationFee: { type: Number, default: 0 }, programmingFee: { type: Number, default: 0 },
  discount: { type: Number, default: 0, min: 0 },
  productsTotal: { type: Number, required: true }, total: { type: Number, required: true },
  notes: { type: String, default: '' }, terms: { type: String, default: '' },
  validUntil: { type: Date, required: true }, revision: { type: Number, default: 0 },
  shareTokenHash: { type: String, select: false }, shareToken: { type: String, select: false },
  sharedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ shareTokenHash: 1 }, { unique: true, partialFilterExpression: { shareTokenHash: { $type: 'string' } } });
export const CustomerQuoteModel = mongoose.model('CustomerQuote', schema);
