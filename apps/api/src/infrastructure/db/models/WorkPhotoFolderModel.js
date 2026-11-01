import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  normalizedName: { type: String, required: true, index: true },
  deleted: { type: Boolean, default: false },
  custom: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export const WorkPhotoFolderModel = mongoose.model('WorkPhotoFolder', schema);
