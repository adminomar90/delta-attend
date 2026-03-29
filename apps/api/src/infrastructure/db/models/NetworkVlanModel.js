import mongoose from 'mongoose';
import { VlanPortMode } from '../../../application/services/networkDocsService.js';

const vlanPortSchema = new mongoose.Schema(
  {
    device: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NetworkDevice',
      default: null,
    },
    portName: {
      type: String,
      default: '',
      trim: true,
    },
    linkMode: {
      type: String,
      enum: Object.values(VlanPortMode),
      default: VlanPortMode.ACCESS,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const networkVlanSchema = new mongoose.Schema(
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
    vlanId: {
      type: Number,
      required: true,
      min: 1,
      max: 4094,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    purpose: {
      type: String,
      default: '',
      trim: true,
    },
    subnet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NetworkSubnet',
      default: null,
    },
    ports: {
      type: [vlanPortSchema],
      default: [],
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

networkVlanSchema.index({ branch: 1, vlanId: 1 }, { unique: true });

export const NetworkVlanModel = mongoose.model('NetworkVlan', networkVlanSchema);
