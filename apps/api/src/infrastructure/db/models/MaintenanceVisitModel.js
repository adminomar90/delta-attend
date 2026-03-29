import mongoose from 'mongoose';

const maintenanceVisitImageSchema = new mongoose.Schema(
  {
    publicUrl: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      default: '',
      trim: true,
    },
    mimeType: {
      type: String,
      default: '',
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    comment: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const maintenanceVisitSchema = new mongoose.Schema(
  {
    maintenancePlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaintenancePlan',
      required: true,
      index: true,
    },
    scheduledVisitId: {
      type: String,
      default: '',
      trim: true,
    },
    visitDate: {
      type: Date,
      required: true,
      index: true,
    },
    technician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    technicianName: {
      type: String,
      default: '',
      trim: true,
    },
    visitType: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FOLLOW_UP_REQUIRED', 'PAID_REPAIR_REQUIRED', 'PARTIAL'],
      default: 'SUCCESS',
      index: true,
    },
    workDone: {
      type: String,
      default: '',
      trim: true,
    },
    deviceStatus: {
      type: String,
      default: '',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    recommendations: {
      type: String,
      default: '',
      trim: true,
    },
    images: {
      type: [maintenanceVisitImageSchema],
      default: [],
    },
    followUpRequired: {
      type: Boolean,
      default: false,
    },
    paidRepairRequired: {
      type: Boolean,
      default: false,
    },
    completionRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
    },
    visitCompletedSuccessfully: {
      type: Boolean,
      default: true,
    },
    signedBy: {
      type: String,
      default: '',
      trim: true,
    },
    approvalText: {
      type: String,
      default: '',
      trim: true,
    },
    customerSignature: {
      type: String,
      default: '',
      trim: true,
    },
    technicianSignature: {
      type: String,
      default: '',
      trim: true,
    },
    projectManagerSignature: {
      type: String,
      default: '',
      trim: true,
    },
    technicianEvaluationGrade: {
      type: String,
      enum: ['', 'GOOD', 'ACCEPTABLE', 'EXCELLENT'],
      default: '',
      trim: true,
    },
    technicianEvaluationPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const MaintenanceVisitModel = mongoose.model('MaintenanceVisit', maintenanceVisitSchema);
