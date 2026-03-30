import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Remove auditLog: null so the sparse unique index stops blocking duplicates
  const result = await db.collection('pointsledgers').updateMany(
    { auditLog: null },
    { $unset: { auditLog: '' } },
  );
  console.log('Cleared auditLog:null on', result.modifiedCount, 'documents');

  await mongoose.disconnect();
  console.log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
