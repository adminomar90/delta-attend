import { app } from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';

const start = async () => {
  try {
    // Try to connect to MongoDB
    try {
      await connectDatabase(env.mongoUri);
      console.log('✓ Connected to MongoDB');
    } catch (dbError) {
      console.warn('⚠ MongoDB connection failed. Running in development mode without database.');
      console.warn('  Install MongoDB or set MONGO_URI environment variable.');
    }

    app.listen(env.port, () => {
      console.log(`✓ API running on port ${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start API', error);
    process.exit(1);
  }
};

start();
