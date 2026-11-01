import mongoose from 'mongoose';

// Library organization is independent of original report evidence and approved PDFs.
const schema = new mongoose.Schema({
  photoId: { type: String, required: true, unique: true },
  folderKey: { type: String, default: '' },
  folderName: { type: String, default: '' },
  deleted: { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export const WorkPhotoPlacementModel = mongoose.model('WorkPhotoPlacement', schema);
