import mongoose from 'mongoose';
import {
  defaultMaintenanceRequestPoints,
  DeviceCondition,
  IssueSeverity,
  MaintenanceReportStatus,
  MaintenanceType,
  ProjectType,
} from '../../../application/services/maintenanceReportService.js';

const reportImageSchema = new mongoose.Schema(
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

const pdfFileSchema = new mongoose.Schema(
  {
    publicUrl: {
      type: String,
      default: '',
      trim: true,
    },
    filename: {
      type: String,
      default: '',
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    generatedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const visitInfoSchema = new mongoose.Schema(
  {
    siteName: {
      type: String,
      default: '',
      trim: true,
    },
    siteAddress: {
      type: String,
      default: '',
      trim: true,
    },
    visitDate: {
      type: Date,
      default: null,
    },
    arrivalTime: {
      type: String,
      default: '',
      trim: true,
    },
    departureTime: {
      type: String,
      default: '',
      trim: true,
    },
    technicianName: {
      type: String,
      default: '',
      trim: true,
    },
    department: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const inspectedDeviceSchema = new mongoose.Schema(
  {
    device: {
      type: String,
      default: '',
      trim: true,
    },
    model: {
      type: String,
      default: '',
      trim: true,
    },
    condition: {
      type: String,
      enum: Object.values(DeviceCondition),
      default: DeviceCondition.GOOD,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const detectedIssueSchema = new mongoose.Schema(
  {
    sequenceNo: {
      type: Number,
      required: true,
      min: 1,
    },
    issue: {
      type: String,
      default: '',
      trim: true,
    },
    severity: {
      type: String,
      enum: Object.values(IssueSeverity),
      default: IssueSeverity.MEDIUM,
    },
    proposedSolution: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const usedMaterialSchema = new mongoose.Schema(
  {
    material: {
      type: String,
      default: '',
      trim: true,
    },
    quantity: {
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
  { _id: false },
);

const customerFeedbackSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    customerName: {
      type: String,
      default: '',
      trim: true,
    },
    projectType: {
      type: String,
      enum: ['', ...Object.values(ProjectType)],
      default: '',
    },
    companyRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    employeeRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    suggestions: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const managerReviewSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['', 'APPROVE', 'REJECT', 'RETURN_FOR_EDIT'],
      default: '',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const workflowTrailSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actorName: {
      type: String,
      default: '',
      trim: true,
    },
    beforeStatus: {
      type: String,
      default: '',
      trim: true,
    },
    afterStatus: {
      type: String,
      default: '',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const maintenanceReportSchema = new mongoose.Schema(
  {
    requestNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    siteLocation: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    projectNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    points: {
      type: Number,
      default: defaultMaintenanceRequestPoints,
      min: 0,
      max: 1000,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(MaintenanceReportStatus),
      default: MaintenanceReportStatus.AWAITING_ACCEPTANCE,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    assignedEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedEmployeeName: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    assignedEmployeeRole: {
      type: String,
      default: '',
      trim: true,
    },
    assignedEmployeeCode: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    managerReviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    managerReviewerName: {
      type: String,
      default: '',
      trim: true,
    },
    visitInfo: {
      type: visitInfoSchema,
      default: () => ({}),
    },
    maintenanceTypes: {
      type: [{
        type: String,
        enum: Object.values(MaintenanceType),
      }],
      default: [],
    },
    inspectedDevices: {
      type: [inspectedDeviceSchema],
      default: [],
    },
    performedActions: {
      type: [String],
      default: [],
    },
    detectedIssues: {
      type: [detectedIssueSchema],
      default: [],
    },
    usedMaterials: {
      type: [usedMaterialSchema],
      default: [],
    },
    recommendations: {
      type: [String],
      default: [],
    },
    images: {
      type: [reportImageSchema],
      default: [],
    },
    pdfFile: {
      type: pdfFileSchema,
      default: () => ({
        publicUrl: '',
        filename: '',
        size: 0,
        generatedAt: null,
      }),
    },
    customerFeedback: {
      type: customerFeedbackSchema,
      default: () => ({}),
    },
    managerReview: {
      type: managerReviewSchema,
      default: () => ({}),
    },
    pointsLedger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PointsLedger',
      default: null,
      index: true,
    },
    pointsGrantedAt: {
      type: Date,
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    feedbackSentAt: {
      type: Date,
      default: null,
    },
    submittedForApprovalAt: {
      type: Date,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    workflowTrail: {
      type: [workflowTrailSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export const MaintenanceReportModel = mongoose.model('MaintenanceReport', maintenanceReportSchema);
