import mongoose from 'mongoose';

const custodyItemSchema = new mongoose.Schema(
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
    assignedTechnician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    unit: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    receivedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    consumedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    returnedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    damagedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    lostQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    lineStatus: {
      type: String,
      enum: ['OPEN', 'PARTIAL', 'RECONCILED', 'CLOSED', 'CANCELLED'],
      default: 'OPEN',
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancellationReason: { type: String, default: '', trim: true },
  },
  { _id: true },
);

const materialCustodySchema = new mongoose.Schema(
  {
    custodyNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialRequest',
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    manualProjectName: {
      type: String,
      default: '',
      trim: true,
    },
    holder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    custodyType: { type: String, enum: ['TECHNICIAN', 'PROJECT', 'BOTH'], default: 'BOTH', index: true },
    recipientDepartment: { type: String, default: '', trim: true },
    receiptConfirmedAt: { type: Date, default: null },
    attachments: { type: [mongoose.Schema.Types.Mixed], default: [] },
    revisions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    openedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    dueDate: {
      type: Date,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: [
        'OPEN',
        'PENDING_RECONCILIATION',
        'PARTIALLY_RECONCILED',
        'FULLY_RECONCILED',
        'OVERDUE',
        'CLOSED',
      ],
      default: 'OPEN',
      index: true,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    isOverdue: {
      type: Boolean,
      default: false,
      index: true,
    },
    dispatchNotes: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'MaterialDispatch',
      default: [],
    },
    items: {
      type: [custodyItemSchema],
      default: [],
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

export const MaterialCustodyModel = mongoose.model('MaterialCustody', materialCustodySchema);
