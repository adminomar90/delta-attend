import mongoose from 'mongoose';
import { CustomerType } from '../../../application/services/customerService.js';
import { CustomerFormStatus } from '../../../application/services/customerFormService.js';

const formDataSchema = new mongoose.Schema(
  {
    customerName: { type: String, default: '', trim: true },
    customerType: { type: String, enum: Object.values(CustomerType), default: CustomerType.COMPANY },
    responsibleName: { type: String, default: '', trim: true },
    position: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    normalizedPhone: { type: String, default: '', trim: true },
    whatsapp: { type: String, default: '', trim: true },
    normalizedWhatsapp: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    province: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    mapUrl: { type: String, default: '', trim: true },
    requestedService: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const attachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0, min: 0 },
    storagePath: { type: String, default: '' },
    publicUrl: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now },
    comment: { type: String, default: '' },
  },
  { _id: true },
);

const customerFormRequestSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: Object.values(CustomerFormStatus),
      default: CustomerFormStatus.NEW,
      index: true,
    },
    data: { type: formDataSchema, default: () => ({}) },
    attachments: { type: [attachmentSchema], default: [] },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentByName: { type: String, default: '', trim: true },
    sentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedAt: { type: Date, default: null, index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '', trim: true },
    reviewedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', trim: true },
    savedCustomer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    duplicateCustomers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }],
  },
  { timestamps: true },
);

customerFormRequestSchema.index({ sentAt: -1, submittedAt: -1 });
customerFormRequestSchema.index({ 'data.normalizedPhone': 1 });
customerFormRequestSchema.index({ 'data.normalizedWhatsapp': 1 });

export const CustomerFormRequestModel = mongoose.model('CustomerFormRequest', customerFormRequestSchema);
