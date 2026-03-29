import mongoose from 'mongoose';
import {
  BranchSiteType,
  DocumentationStatus,
} from '../../../application/services/networkDocsService.js';

const branchImageSchema = new mongoose.Schema(
  {
    publicUrl: {
      type: String,
      default: '',
      trim: true,
    },
    originalName: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const networkBranchSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NetworkCustomer',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    siteType: {
      type: String,
      enum: Object.values(BranchSiteType),
      default: BranchSiteType.BRANCH,
    },
    geo: {
      lat: {
        type: Number,
        default: null,
      },
      lng: {
        type: Number,
        default: null,
      },
    },
    images: {
      type: [branchImageSchema],
      default: [],
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    documentationStatus: {
      type: String,
      enum: Object.values(DocumentationStatus),
      default: DocumentationStatus.NOT_STARTED,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastApprovedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

networkBranchSchema.index({ customer: 1, name: 1 }, { unique: true });

export const NetworkBranchModel = mongoose.model('NetworkBranch', networkBranchSchema);
