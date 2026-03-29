import mongoose from 'mongoose';
import { WifiSecurityType } from '../../../application/services/networkDocsService.js';

const networkWifiProfileSchema = new mongoose.Schema(
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
    ssid: {
      type: String,
      required: true,
      trim: true,
    },
    securityType: {
      type: String,
      enum: Object.values(WifiSecurityType),
      default: WifiSecurityType.WPA2_PSK,
    },
    vlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NetworkVlan',
      default: null,
    },
    accessPoints: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'NetworkDevice',
      }],
      default: [],
    },
    secret: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NetworkSecret',
      default: null,
    },
    coverageNotes: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      default: 'ACTIVE',
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

networkWifiProfileSchema.index({ branch: 1, ssid: 1 }, { unique: true });

export const NetworkWifiProfileModel = mongoose.model('NetworkWifiProfile', networkWifiProfileSchema);
