import mongoose from 'mongoose';

const employee = new mongoose.Schema({
  fullName: { type: String, required: true },
  employeeCode: { type: String, required: true },
  jobTitle: { type: String, required: true },
  department: { type: String, default: '' },
}, { _id: false });

const template = new mongoose.Schema({
  choice: { type: String, enum: ['auto', 'technical', 'administrative', 'maintenance'], required: true },
  title: { type: String, required: true },
  footer: { type: String, required: true },
}, { _id: false });

const crop = new mongoose.Schema({
  zoom: { type: Number, required: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
}, { _id: false });

const schema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  employee: { type: employee, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  template: { type: template, required: true },
  nameEn: { type: String, required: true, maxlength: 240 },
  jobEn: { type: String, required: true, maxlength: 160 },
  issuedOn: { type: String, required: true },
  expiresOn: { type: String, required: true },
  photo: { type: String, required: true, select: false },
  crop: { type: crop, required: true },
  active: { type: Boolean, default: true },
  revision: { type: Number, default: 0 },
  verificationToken: { type: String, required: true, select: false, unique: true },
}, { timestamps: true });

schema.index({ createdAt: -1, _id: -1 });

export const EmployeeBadgeModel = mongoose.model('EmployeeBadge', schema);
