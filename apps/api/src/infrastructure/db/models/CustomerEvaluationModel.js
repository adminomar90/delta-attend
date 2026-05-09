import mongoose from 'mongoose';
import {
  CustomerEvaluationDepartment,
  CustomerEvaluationSourceType,
  CustomerEvaluationStatus,
  issueStatusOptions,
  ratingOptions,
  recommendationOptions,
  yesNoPartialOptions,
} from '../../../application/services/customerEvaluationService.js';

const sourceSnapshotSchema = new mongoose.Schema(
  {
    sourceType: { type: String, enum: Object.values(CustomerEvaluationSourceType), required: true, index: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    sourceNumber: { type: String, default: '', trim: true, index: true },
    reportUrl: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const customerSnapshotSchema = new mongoose.Schema(
  {
    customerName: { type: String, default: '', trim: true, index: true },
    phone: { type: String, default: '', trim: true, index: true },
    companyOrSiteName: { type: String, default: '', trim: true },
    siteAddress: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const workSnapshotSchema = new mongoose.Schema(
  {
    serviceType: { type: String, default: '', trim: true, index: true },
    executionDate: { type: Date, default: null, index: true },
    department: {
      type: String,
      enum: Object.values(CustomerEvaluationDepartment),
      default: CustomerEvaluationDepartment.PROJECTS,
      index: true,
    },
    departmentName: { type: String, default: '', trim: true },
    projectOrTaskName: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const answerSchema = new mongoose.Schema(
  {
    arrivalCommitment: { type: String, enum: [...ratingOptions, ''], default: '' },
    respectfulTreatment: { type: String, enum: [...ratingOptions, ''], default: '' },
    appearanceAndOrganization: { type: String, enum: [...ratingOptions, ''], default: '' },
    requestUnderstanding: { type: String, enum: [...ratingOptions, ''], default: '' },
    executionQuality: { type: String, enum: [...ratingOptions, ''], default: '' },
    completionSpeed: { type: String, enum: [...ratingOptions, ''], default: '' },
    cleanupAfterWork: { type: String, enum: [...ratingOptions, ''], default: '' },
    serviceExplanation: { type: String, enum: [...ratingOptions, ''], default: '' },
    problemResolution: { type: String, enum: [...ratingOptions, ''], default: '' },
    overallRating: { type: String, enum: [...ratingOptions, ''], default: '', index: true },
    completedAsRequested: { type: String, enum: [...yesNoPartialOptions, ''], default: '' },
    issueAfterLeaving: { type: String, enum: [...issueStatusOptions, ''], default: '', index: true },
    recommendAgain: { type: String, enum: [...recommendationOptions, ''], default: '' },
    customerNotes: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const customerEvaluationSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: Object.values(CustomerEvaluationStatus),
      default: CustomerEvaluationStatus.PENDING,
      index: true,
    },
    source: { type: sourceSnapshotSchema, required: true },
    customer: { type: customerSnapshotSchema, default: () => ({}) },
    work: { type: workSnapshotSchema, default: () => ({}) },
    answers: { type: answerSchema, default: () => ({}) },
    averageScore: { type: Number, default: 0, min: 0, max: 5, index: true },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentByName: { type: String, default: '', trim: true },
    sentAt: { type: Date, default: Date.now, index: true },
    submittedAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, default: null, index: true },
    reactivatedAt: { type: Date, default: null },
    reactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

customerEvaluationSchema.index({ 'source.sourceType': 1, 'source.sourceId': 1 });
customerEvaluationSchema.index({ 'work.department': 1, submittedAt: -1 });

export const CustomerEvaluationModel = mongoose.model('CustomerEvaluation', customerEvaluationSchema);
