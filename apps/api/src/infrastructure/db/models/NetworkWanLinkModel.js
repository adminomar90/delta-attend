import mongoose from 'mongoose';
import { WanConnectionType } from '../../../application/services/networkDocsService.js';

const technicalSupportSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: '',
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const networkWanLinkSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NetworkCustomer',
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NetworkBranch',
      required: true,
      index: true,
    },
    ispName: {
      type: String,
      required: true,
      trim: true,
    },
    connectionType: {
      type: String,
      enum: Object.values(WanConnectionType),
      default: WanConnectionType.FIBER,
    },
    speed: {
      downloadMbps: {
        type: Number,
        default: 0,
        min: 0,
      },
      uploadMbps: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    publicIps: {
      type: [String],
      default: [],
    },
    subscriptionInfo: {
      accountNumber: {
        type: String,
        default: '',
        trim: true,
      },
      planName: {
        type: String,
        default: '',
        trim: true,
      },
      contractEndDate: {
        type: Date,
        default: null,
      },
      secret: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'NetworkSecret',
        default: null,
      },
    },
    backupLine: {
      type: String,
      default: '',
      trim: true,
    },
    technicalSupport: {
      type: [technicalSupportSchema],
      default: [],
    },
    status: {
      type: String,
      default: 'ACTIVE',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
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

export const NetworkWanLinkModel = mongoose.model('NetworkWanLink', networkWanLinkSchema);
