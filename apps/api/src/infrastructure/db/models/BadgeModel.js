import mongoose from 'mongoose';

const badgeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    titleAr: {
      type: String,
      required: true,
    },
    descriptionAr: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      default: 'medal',
    },
    threshold: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

export const BadgeModel = mongoose.model('Badge', badgeSchema);
