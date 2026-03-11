import bcrypt from 'bcryptjs';
import { connectDatabase } from '../src/config/db.js';
import { Roles } from '../src/shared/constants.js';
import { UserModel } from '../src/infrastructure/db/models/UserModel.js';

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/delta-plus';

const createSuperAdmin = async () => {
  try {
    await connectDatabase(mongoUri);
    console.log('✓ Connected to MongoDB');

    const superAdmin = {
      fullName: 'Super Admin',
      email: 'admin@delta.com',
      role: Roles.GENERAL_MANAGER,
      passwordHash: await bcrypt.hash('Admin@123', 10),
      pointsTotal: 0,
      level: 1,
      badges: [],
      team: 'Delta Plus',
      active: true,
    };

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email: superAdmin.email });
    if (existingUser) {
      console.log('⚠ User already exists:', superAdmin.email);
      process.exit(0);
    }

    const user = await UserModel.create(superAdmin);
    console.log('✓ Super Admin created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('   Email: admin@delta.com');
    console.log('   Password: Admin@123');
    console.log('   Role: GENERAL_MANAGER (All Permissions)');
    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

createSuperAdmin();
