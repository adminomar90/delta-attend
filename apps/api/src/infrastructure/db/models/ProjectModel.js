import mongoose from 'mongoose';

const dailyLaborerSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    jobTitle: { type: String, default: '', trim: true },
    dailyWage: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'IQD', trim: true, uppercase: true },
    startDate: { type: Date, default: null },
    notes: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const projectDepartmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    notes: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const projectDocumentSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: ['PHOTO', 'PLAN', 'CONTRACT', 'REQUIREMENT', 'OTHER'],
      default: 'OTHER',
      index: true,
    },
    title: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    fileName: { type: String, default: '', trim: true },
    originalName: { type: String, default: '', trim: true },
    mimeType: { type: String, default: '', trim: true },
    size: { type: Number, default: 0, min: 0 },
    publicUrl: { type: String, default: '', trim: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const projectSupervisorSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['PROJECT_MANAGER', 'SUPERVISOR'],
      default: 'SUPERVISOR',
      index: true,
    },
    title: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    clientName: { type: String, default: '', trim: true },
    clientPhone: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    workCategories: { type: [String], default: [] },
    expectedEndDate: { type: Date, default: null },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teamMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    dailyLaborers: {
      type: [dailyLaborerSchema],
      default: [],
    },
    projectDepartments: {
      type: [projectDepartmentSchema],
      default: [],
    },
    documents: {
      type: [projectDocumentSchema],
      default: [],
    },
    projectSupervisors: {
      type: [projectSupervisorSchema],
      default: [],
    },
    projectManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['PENDING_APPROVAL', 'ACTIVE', 'ON_HOLD', 'DONE', 'REJECTED'],
      default: 'ACTIVE',
    },
    requiredApprovalRoles: {
      type: [String],
      default: [],
    },
    approvalTrail: [
      {
        approver: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        role: {
          type: String,
          required: true,
        },
        comment: {
          type: String,
          default: '',
        },
        approvedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    approvalPointsAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    startDate: Date,
    endDate: Date,
    budget: {
      type: Number,
      min: 0,
      default: 0,
    },
    archived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
  },
);

export const ProjectModel = mongoose.model('Project', projectSchema);
