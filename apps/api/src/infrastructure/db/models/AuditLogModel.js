import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actorType: { type: String, enum: ['USER', 'SUPPLIER'], default: 'USER' },
    externalActor: {
      supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
      name: { type: String, default: '' },
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: function () { return this.actorType !== 'SUPPLIER'; },
      index: true,
    },
    action: {
      type: String,
      required: true,
    },
    entityType: {
      type: String,
      required: true,
    },
    entityId: {
      type: String,
      required: true,
    },
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

export const AuditLogModel = mongoose.model('AuditLog', auditLogSchema);
