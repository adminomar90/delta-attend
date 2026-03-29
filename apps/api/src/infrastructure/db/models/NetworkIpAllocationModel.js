import mongoose from 'mongoose';
import { IpAllocationType } from '../../../application/services/networkDocsService.js';

const networkIpAllocationSchema = new mongoose.Schema(
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
    subnet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NetworkSubnet',
      default: null,
      index: true,
    },
    device: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NetworkDevice',
      default: null,
      index: true,
    },
    ipAddress: {
      type: String,
      required: true,
      trim: true,
    },
    ipType: {
      type: String,
      enum: Object.values(IpAllocationType),
      required: true,
      index: true,
    },
    hostname: {
      type: String,
      default: '',
      trim: true,
    },
    purpose: {
      type: String,
      default: '',
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

networkIpAllocationSchema.index({ branch: 1, ipAddress: 1 }, { unique: true });

export const NetworkIpAllocationModel = mongoose.model('NetworkIpAllocation', networkIpAllocationSchema);
