import mongoose from 'mongoose';

const requestItemSchema = new mongoose.Schema(
  {
    material: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material',
      required: true,
      index: true,
    },
    materialName: {
      type: String,
      default: '',
      trim: true,
    },
    categorySnapshot: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    unitSnapshot: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    requestedQty: {
      type: Number,
      required: true,
      min: 0.0001,
    },
    availableQtyAtRequest: {
      type: Number,
      default: 0,
      min: 0,
    },
    approvedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    preparedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveredQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    lineStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'PARTIAL', 'REJECTED', 'DELIVERED', 'CLOSED'],
      default: 'PENDING',
      index: true,
    },
    lineNotes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: true },
);

const approvalTrailSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['APPROVE_FULL', 'APPROVE_PARTIAL', 'REJECT', 'MODIFY'],
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedAt: {
      type: Date,
      default: Date.now,
    },
    comment: {
      type: String,
      default: '',
      trim: true,
    },
    beforeSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    afterSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: true },
);

const preparationLineSchema = new mongoose.Schema(
  {
    material: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material',
      required: true,
    },
    preparedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    unavailableQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    batchNo: {
      type: String,
      default: '',
      trim: true,
    },
    serials: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: true },
);

const preparationRecordSchema = new mongoose.Schema(
  {
    preparedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    preparedAt: {
      type: Date,
      default: Date.now,
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      default: null,
    },
    mode: {
      type: String,
      enum: ['FULL', 'PARTIAL'],
      default: 'PARTIAL',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    items: {
      type: [preparationLineSchema],
      default: [],
    },
  },
  { _id: true },
);

const materialRequestSchema = new mongoose.Schema(
  {
    requestNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    projectName: {
      type: String,
      default: '',
      trim: true,
    },
    clientName: {
      type: String,
      default: '',
      trim: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestedFor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedPreparer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    requestDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    priority: {
      type: String,
      enum: ['URGENT', 'NORMAL', 'LOW'],
      default: 'NORMAL',
      index: true,
    },
    generalNotes: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: [
        'NEW',
        'UNDER_REVIEW',
        'APPROVED',
        'REJECTED',
        'PREPARING',
        'PREPARED',
        'DELIVERED',
        'PENDING_RECONCILIATION',
        'RECONCILED',
        'CLOSED',
      ],
      default: 'NEW',
      index: true,
    },
    approvalSummary: {
      approvalType: {
        type: String,
        enum: ['NONE', 'FULL', 'PARTIAL', 'REJECTED'],
        default: 'NONE',
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      approvedAt: {
        type: Date,
        default: null,
      },
      notes: {
        type: String,
        default: '',
        trim: true,
      },
    },
    approvals: {
      type: [approvalTrailSchema],
      default: [],
    },
    items: {
      type: [requestItemSchema],
      default: [],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: 'Material request must include at least one item',
      },
    },
    preparations: {
      type: [preparationRecordSchema],
      default: [],
    },
    dispatchRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialDispatch',
      default: null,
      index: true,
    },
    custodyRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialCustody',
      default: null,
      index: true,
    },
    reconciliationRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialReconciliation',
      default: null,
      index: true,
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const MaterialRequestModel = mongoose.model('MaterialRequest', materialRequestSchema);
