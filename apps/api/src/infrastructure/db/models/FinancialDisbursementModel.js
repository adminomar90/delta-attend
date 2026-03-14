import mongoose from 'mongoose';
import {
  FinancialDisbursementStatus,
  FinancialDisbursementType,
} from '../../../application/services/financialDisbursementService.js';
import { Roles } from '../../../shared/constants.js';

const attachmentSchema = new mongoose.Schema(
  {
    url: {
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
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const workflowEntrySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorRole: {
      type: String,
      enum: Object.values(Roles),
      default: null,
    },
    beforeStatus: {
      type: String,
      enum: Object.values(FinancialDisbursementStatus),
      default: null,
    },
    afterStatus: {
      type: String,
      enum: Object.values(FinancialDisbursementStatus),
      default: null,
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
  { _id: true },
);

const pointsEventSchema = new mongoose.Schema(
  {
    eventKey: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    points: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    ledger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PointsLedger',
      default: null,
    },
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: true },
);

const financialDisbursementSchema = new mongoose.Schema(
  {
    requestNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    transactionNo: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },
    transactionDate: {
      type: Date,
      default: null,
      index: true,
    },
    transactionTotalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestType: {
      type: String,
      enum: Object.values(FinancialDisbursementType),
      default: FinancialDisbursementType.BUSINESS_EXPENSE,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'IQD',
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    approvedAmount: {
      type: Number,
      default: null,
      min: 0,
    },
    approvedAmountSetBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAmountSetAt: {
      type: Date,
      default: null,
    },
    employeeRole: {
      type: String,
      enum: [...Object.values(Roles), null],
      default: null,
    },
    projectManagerStepSkipped: {
      type: Boolean,
      default: false,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(FinancialDisbursementStatus),
      default: FinancialDisbursementStatus.DRAFT,
      index: true,
    },
    currentReviewerRole: {
      type: String,
      enum: [...Object.values(Roles), 'EMPLOYEE'],
      default: null,
      index: true,
    },
    projectManagerReviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    financialManagerReviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    generalManagerReviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    requiresGeneralManagerApproval: {
      type: Boolean,
      default: false,
    },
    generalManagerRequestReason: {
      type: String,
      default: '',
      trim: true,
    },
    projectManagerApprovedAt: {
      type: Date,
      default: null,
    },
    financiallyApprovedAt: {
      type: Date,
      default: null,
    },
    generalManagerApprovedAt: {
      type: Date,
      default: null,
    },
    disbursedAt: {
      type: Date,
      default: null,
    },
    receivedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    pointsEvents: {
      type: [pointsEventSchema],
      default: [],
    },
    workflowTrail: {
      type: [workflowEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export const FinancialDisbursementModel = mongoose.model(
  'FinancialDisbursement',
  financialDisbursementSchema,
);
