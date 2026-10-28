import mongoose from 'mongoose';
import {
  DeviceStatus,
  DeviceType,
} from '../../../application/services/networkDocsService.js';

const networkDeviceSchema = new mongoose.Schema(
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
    deviceType: {
      type: String,
      enum: Object.values(DeviceType),
      required: true,
      index: true,
    },
    vendor: {
      type: String,
      default: '',
      trim: true,
    },
    model: {
      type: String,
      default: '',
      trim: true,
    },
    serialNumber: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    macAddress: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    managementIp: {
      type: String,
      default: '',
      trim: true,
    },
    username: { type: String, default: '', trim: true },
    extensionNumber: { type: String, default: '', trim: true },
    cameraNumber: { type: String, default: '', trim: true },
    switchNumber: { type: String, default: '', trim: true },
    switchPort: { type: String, default: '', trim: true },
    portNumber: { type: String, default: '', trim: true },
    patchPanelPort: { type: String, default: '', trim: true },
    patchPanelNumber: { type: String, default: '', trim: true },
    connectedDeviceType: { type: String, default: '', trim: true },
    vlanNumber: { type: String, default: '', trim: true },
    portCount: { type: Number, default: null, min: 1, validate: { validator: (value) => value == null || Number.isSafeInteger(value), message: 'عدد المنافذ يجب أن يكون عدداً صحيحاً موجباً' } },
    secret: { type: mongoose.Schema.Types.ObjectId, ref: 'NetworkSecret', default: null },
    physicalLocation: {
      type: String,
      default: '',
      trim: true,
    },
    rackName: {
      type: String,
      default: '',
      trim: true,
    },
    rackPosition: {
      type: String,
      default: '',
      trim: true,
    },
    firmwareVersion: {
      type: String,
      default: '',
      trim: true,
    },
    installedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(DeviceStatus),
      default: DeviceStatus.ACTIVE,
      index: true,
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

networkDeviceSchema.index(
  { branch: 1, managementIp: 1 },
  {
    unique: true,
    partialFilterExpression: {
      managementIp: { $type: 'string', $gt: '' },
    },
  },
);

networkDeviceSchema.index(
  { branch: 1, serialNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      serialNumber: { $type: 'string', $gt: '' },
    },
  },
);

export const NetworkDeviceModel = mongoose.model('NetworkDevice', networkDeviceSchema);
