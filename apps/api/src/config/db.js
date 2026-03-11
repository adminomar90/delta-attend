import mongoose from 'mongoose';

export const connectDatabase = async (mongoUri) => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });
};
