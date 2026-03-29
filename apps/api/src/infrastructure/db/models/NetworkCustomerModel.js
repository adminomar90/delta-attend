import mongoose from 'mongoose';
import { ContractStatus } from '../../../application/services/networkDocsService.js';

const contactPointSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: '',
      trim: true,
    },
    title: {
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
  },
  { _id: false },
);

const networkCustomerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    companyAddress: {
      type: String,
      default: '',
      trim: true,
    },
    contactInfo: {
      phones: {
        type: [String],
        default: [],
      },
      emails: {
        type: [String],
        default: [],
      },
      website: {
        type: String,
        default: '',
        trim: true,
      },
    },
    responsiblePerson: {
      type: contactPointSchema,
      default: () => ({}),
    },
    contractStatus: {
      type: String,
      enum: Object.values(ContractStatus),
      default: ContractStatus.ACTIVE,
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    lastReviewedAt: {
      type: Date,
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const NetworkCustomerModel = mongoose.model('NetworkCustomer', networkCustomerSchema);
