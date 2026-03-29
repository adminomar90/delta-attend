import mongoose from 'mongoose';

const dhcpRangeSchema = new mongoose.Schema(
  {
    startIp: {
      type: String,
      required: true,
      trim: true,
    },
    endIp: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const networkSubnetSchema = new mongoose.Schema(
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
    name: {
      type: String,
      default: '',
      trim: true,
    },
    cidr: {
      type: String,
      required: true,
      trim: true,
    },
    gateway: {
      type: String,
      default: '',
      trim: true,
    },
    dnsServers: {
      type: [String],
      default: [],
    },
    dhcpRanges: {
      type: [dhcpRangeSchema],
      default: [],
    },
    purpose: {
      type: String,
      default: '',
      trim: true,
    },
    vlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NetworkVlan',
      default: null,
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

networkSubnetSchema.index({ branch: 1, cidr: 1 }, { unique: true });

export const NetworkSubnetModel = mongoose.model('NetworkSubnet', networkSubnetSchema);
