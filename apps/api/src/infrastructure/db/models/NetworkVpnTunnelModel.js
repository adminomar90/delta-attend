import mongoose from 'mongoose';
import { VpnType } from '../../../application/services/networkDocsService.js';

const networkVpnTunnelSchema = new mongoose.Schema(
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
      required: true,
      trim: true,
    },
    vpnType: {
      type: String,
      enum: Object.values(VpnType),
      default: VpnType.SITE_TO_SITE_IPSEC,
    },
    localSubnets: {
      type: [String],
      default: [],
    },
    remoteSubnets: {
      type: [String],
      default: [],
    },
    peerIp: {
      type: String,
      default: '',
      trim: true,
    },
    secret: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NetworkSecret',
      default: null,
    },
    routes: {
      type: [String],
      default: [],
    },
    firewallRules: {
      type: [String],
      default: [],
    },
    natRules: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      default: 'DOWN',
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

export const NetworkVpnTunnelModel = mongoose.model('NetworkVpnTunnel', networkVpnTunnelSchema);
