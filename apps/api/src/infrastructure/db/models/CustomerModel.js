import mongoose from 'mongoose';
import {
  CustomerStatus,
  CustomerType,
  FollowUpStatus,
  FollowUpType,
} from '../../../application/services/customerService.js';

const contactPersonSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true },
    position: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    whatsapp: { type: String, default: '', trim: true },
    isDecisionMaker: { type: Boolean, default: false },
    isTechnical: { type: Boolean, default: false },
    isFinancial: { type: Boolean, default: false },
  },
  { _id: true },
);

const customerSiteSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    mapUrl: { type: String, default: '', trim: true },
    managerName: { type: String, default: '', trim: true },
    managerPhone: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
  },
  { _id: true },
);

const followUpSchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.values(FollowUpType), default: FollowUpType.CALL },
    employeeName: { type: String, default: '', trim: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: '', trim: true },
    nextFollowUpAt: { type: Date, default: null },
    status: { type: String, enum: Object.values(FollowUpStatus), default: FollowUpStatus.OPEN },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const attachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0, min: 0 },
    storagePath: { type: String, default: '' },
    publicUrl: { type: String, default: '' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedByName: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now },
    comment: { type: String, default: '' },
  },
  { _id: true },
);

const customerFormSubmissionSchema = new mongoose.Schema(
  {
    formRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerFormRequest', default: null },
    sentAt: { type: Date, default: null },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentByName: { type: String, default: '', trim: true },
    status: { type: String, default: '', trim: true },
    approvedAt: { type: Date, default: null },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { _id: true },
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    customerType: { type: String, enum: Object.values(CustomerType), default: CustomerType.COMPANY },
    phone: { type: String, default: '', trim: true },
    normalizedPhone: { type: String, default: '', trim: true },
    whatsapp: { type: String, default: '', trim: true },
    normalizedWhatsapp: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    province: { type: String, default: '', trim: true, index: true },
    address: { type: String, default: '', trim: true },
    mapUrl: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    status: { type: String, enum: Object.values(CustomerStatus), default: CustomerStatus.NEW, index: true },
    contactPersons: { type: [contactPersonSchema], default: [] },
    sites: { type: [customerSiteSchema], default: [] },
    followUps: { type: [followUpSchema], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    formSubmissions: { type: [customerFormSubmissionSchema], default: [] },
    linkedProjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
    linkedDailyWorkPlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DailyWorkPlan' }],
    archived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastModifiedByName: { type: String, default: '', trim: true },
    lastModifiedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

customerSchema.index({ normalizedPhone: 1 });
customerSchema.index({ normalizedWhatsapp: 1 });
customerSchema.index({
  name: 'text',
  phone: 'text',
  whatsapp: 'text',
  province: 'text',
  address: 'text',
  'sites.name': 'text',
  'sites.address': 'text',
});

export const CustomerModel = mongoose.model('Customer', customerSchema);
