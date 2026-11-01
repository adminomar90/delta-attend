import mongoose from 'mongoose';
import { ticketTypes } from '../../../application/services/ticketPolicy.js';
const schema = new mongoose.Schema({
  _id: { type: String, default: 'tickets' },
  types: { type: [{ key: String, label: String, technical: Boolean, active: { type: Boolean, default: true } }], default: () => ticketTypes },
  autoMaintenance: { type: Boolean, default: false },
  daysBeforeDue: { type: Number, default: 3, min: 0, max: 90 },
  defaultReviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
export const TicketSettingsModel = mongoose.model('TicketSettings', schema);
