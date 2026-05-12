import mongoose from 'mongoose';
import { FieldInspectionStatus } from '../../../application/services/fieldInspectionService.js';

const attachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0, min: 0 },
    storagePath: { type: String, default: '' },
    publicUrl: { type: String, default: '' },
    kind: { type: String, enum: ['photo', 'attachment', 'report'], default: 'attachment' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedByName: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const technicianSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fullName: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  { _id: false },
);

const customerSnapshotSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: '' },
    customerType: { type: String, default: '' },
    phone: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    email: { type: String, default: '' },
    province: { type: String, default: '' },
    address: { type: String, default: '' },
    mapUrl: { type: String, default: '' },
    siteId: { type: mongoose.Schema.Types.ObjectId, default: null },
    siteName: { type: String, default: '' },
    siteManagerName: { type: String, default: '' },
    siteManagerPhone: { type: String, default: '' },
  },
  { _id: false },
);

const inspectionFormSchema = new mongoose.Schema(
  {
    serviceType: { type: String, default: '' },
    requestType: { type: String, default: '' },
    customRequestType: { type: String, default: '' },
    siteStatus: { type: String, default: '' },
    customSiteStatus: { type: String, default: '' },
    urgency: { type: String, default: '' },
    serviceFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    materials: { type: [String], default: [] },
    customMaterials: { type: [String], default: [] },
    inspectionResult: { type: String, default: '' },
    technicianRecommendation: { type: String, default: '' },
    siteCondition: { type: String, default: '' },
    customerRequirements: { type: String, default: '' },
    requiredWorkType: { type: String, default: '' },
    existingSystems: { type: String, default: '' },
    proposedWorks: { type: String, default: '' },
    requiredMaterials: { type: String, default: '' },
    technicalMeasurements: { type: String, default: '' },
    finalRecommendations: { type: String, default: '' },
    generalNotes: { type: String, default: '' },
    requiredMaterialItems: {
      type: [{
        materialName: { type: String, default: '' },
        quantity: { type: String, default: '' },
        unit: { type: String, default: '' },
        notes: { type: String, default: '' },
      }],
      default: [],
    },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    completedByName: { type: String, default: '' },
    measurements: {
      type: [{
        location: { type: String, default: '' },
        measurementType: { type: String, default: '' },
        value: { type: String, default: '' },
        unit: { type: String, default: '' },
        note: { type: String, default: '' },
        linkedPhoto: { type: String, default: '' },
      }],
      default: [],
    },
    measurementEmptyReason: { type: String, default: '' },
    customerSignature: {
      customerName: { type: String, default: '' },
      phone: { type: String, default: '' },
      signedAt: { type: Date, default: null },
      technicianName: { type: String, default: '' },
      technicianSignature: { type: String, default: '' },
      imageDataUrl: { type: String, default: '' },
      emptyReason: { type: String, default: '' },
    },
  },
  { _id: false },
);

const timelineSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    message: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const fieldInspectionTicketSchema = new mongoose.Schema(
  {
    ticketNo: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: Object.values(FieldInspectionStatus),
      default: FieldInspectionStatus.AWAITING_SCHEDULE,
      index: true,
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    customerSnapshot: { type: customerSnapshotSchema, default: () => ({}) },
    serviceType: { type: String, default: '', trim: true },
    requestDescription: { type: String, default: '', trim: true },
    appointmentAt: { type: Date, default: null, index: true },
    appointmentSentAt: { type: Date, default: null },
    technicians: { type: [technicianSchema], default: [] },
    notes: { type: String, default: '', trim: true },
    inspectionStartedAt: { type: Date, default: null },
    inspectionEndedAt: { type: Date, default: null },
    inspectionForm: { type: inspectionFormSchema, default: () => ({}) },
    attachments: { type: [attachmentSchema], default: [] },
    report: {
      fileName: { type: String, default: '' },
      publicUrl: { type: String, default: '' },
      generatedAt: { type: Date, default: null },
      sentToCustomerAt: { type: Date, default: null },
    },
    linkedDailyWorkPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyWorkPlan', default: null, index: true },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedByName: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, default: '' },
    timeline: { type: [timelineSchema], default: [] },
  },
  { timestamps: true },
);

fieldInspectionTicketSchema.index({ createdAt: -1 });
fieldInspectionTicketSchema.index({ 'technicians.user': 1, appointmentAt: -1 });

export const FieldInspectionTicketModel = mongoose.model('FieldInspectionTicket', fieldInspectionTicketSchema);
