import mongoose from 'mongoose';
import { SecretType } from '../../../application/services/networkDocsService.js';

const networkSecretSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    ownerId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    secretType: {
      type: String,
      enum: Object.values(SecretType),
      default: SecretType.OTHER,
      index: true,
    },
    ciphertext: {
      type: String,
      required: true,
    },
    iv: {
      type: String,
      required: true,
    },
    authTag: {
      type: String,
      required: true,
    },
    keyVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    maskedPreview: {
      type: String,
      default: '',
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rotatedAt: {
      type: Date,
      default: null,
    },
    lastViewedAt: {
      type: Date,
      default: null,
    },
    lastViewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

networkSecretSchema.index({ ownerType: 1, ownerId: 1, secretType: 1 });

export const NetworkSecretModel = mongoose.model('NetworkSecret', networkSecretSchema);
