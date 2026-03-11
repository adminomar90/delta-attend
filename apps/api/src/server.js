import bcrypt from 'bcryptjs';
import { app } from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { UserModel } from './infrastructure/db/models/UserModel.js';
import { Roles } from './shared/constants.js';

const ensureSuperAdmin = async () => {
  try {
    const email = 'admin@delta.com';
    const exists = await UserModel.findOne({ email });
    if (exists) return;

    await UserModel.create({
      fullName: 'Super Admin',
      email,
      role: Roles.GENERAL_MANAGER,
      passwordHash: await bcrypt.hash('Admin@123', 10),
      pointsTotal: 0,
      level: 1,
      badges: [],
      team: 'Delta Plus',
      active: true,
    });
    console.log('\u2713 Default super admin created (admin@delta.com / Admin@123)');
  } catch (err) {
    console.warn('\u26a0 Could not seed super admin:', err.message);
  }
};

const start = async () => {
  try {
    try {
      await connectDatabase(env.mongoUri);
      console.log('\u2713 Connected to MongoDB');
      await ensureSuperAdmin();
    } catch (dbError) {
      console.warn('\u26a0 MongoDB connection failed. Running in development mode without database.');
      console.warn('  Install MongoDB or set MONGO_URI environment variable.');
    }

    app.listen(env.port, () => {
      console.log(`\u2713 API running on port ${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start API', error);
    process.exit(1);
  }
};

start();
