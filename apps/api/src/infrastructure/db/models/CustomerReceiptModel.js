import mongoose from 'mongoose';

const customerReceiptSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, required: true, unique: true, index: true, trim: true },
    receiptDate: { type: Date, default: Date.now, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    customerName: { type: String, required: true, trim: true, index: true },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['IQD', 'USD'], default: 'IQD', uppercase: true, trim: true },
    details: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const CustomerReceiptModel = mongoose.model('CustomerReceipt', customerReceiptSchema);
