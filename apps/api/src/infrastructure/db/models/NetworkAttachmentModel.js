import mongoose from 'mongoose';
import { AttachmentCategory } from '../../../application/services/networkDocsService.js';

const networkAttachmentSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },
    entityType: {
      type: String,
      default: 'CUSTOMER',
      trim: true,
      index: true,
    },
    entityId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    category: {
      type: String,
      enum: Object.values(AttachmentCategory),
      default: AttachmentCategory.OTHER,
      index: true,
    },
    storageScope: {
      type: String,
      enum: ['PUBLIC', 'PRIVATE'],
      default: 'PUBLIC',
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      default: '',
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    checksum: {
      type: String,
      default: '',
      trim: true,
    },
    publicUrl: {
      type: String,
      default: '',
      trim: true,
    },
    storagePath: {
      type: String,
      required: true,
      trim: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export const NetworkAttachmentModel = mongoose.model('NetworkAttachment', networkAttachmentSchema);
