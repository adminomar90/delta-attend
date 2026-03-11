import 'dotenv/config';
import { connectDatabase } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { UserModel } from '../src/infrastructure/db/models/UserModel.js';
import { ProjectModel } from '../src/infrastructure/db/models/ProjectModel.js';
import { TaskModel } from '../src/infrastructure/db/models/TaskModel.js';
import { GoalModel } from '../src/infrastructure/db/models/GoalModel.js';
import { BadgeModel } from '../src/infrastructure/db/models/BadgeModel.js';
import { PointsLedgerModel } from '../src/infrastructure/db/models/PointsLedgerModel.js';
import { NotificationModel } from '../src/infrastructure/db/models/NotificationModel.js';
import { AuditLogModel } from '../src/infrastructure/db/models/AuditLogModel.js';
import { EmployeeFileModel } from '../src/infrastructure/db/models/EmployeeFileModel.js';
import { AttendanceModel } from '../src/infrastructure/db/models/AttendanceModel.js';
import { CounterModel } from '../src/infrastructure/db/models/CounterModel.js';
import { MaterialModel } from '../src/infrastructure/db/models/MaterialModel.js';
import { WarehouseModel } from '../src/infrastructure/db/models/WarehouseModel.js';
import { StockBalanceModel } from '../src/infrastructure/db/models/StockBalanceModel.js';
import { StockTransactionModel } from '../src/infrastructure/db/models/StockTransactionModel.js';
import { MaterialRequestModel } from '../src/infrastructure/db/models/MaterialRequestModel.js';
import { MaterialDispatchModel } from '../src/infrastructure/db/models/MaterialDispatchModel.js';
import { MaterialCustodyModel } from '../src/infrastructure/db/models/MaterialCustodyModel.js';
import { MaterialReconciliationModel } from '../src/infrastructure/db/models/MaterialReconciliationModel.js';
import { MaterialReturnReceiptModel } from '../src/infrastructure/db/models/MaterialReturnReceiptModel.js';

const clearCollections = async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    ProjectModel.deleteMany({}),
    TaskModel.deleteMany({}),
    GoalModel.deleteMany({}),
    BadgeModel.deleteMany({}),
    PointsLedgerModel.deleteMany({}),
    NotificationModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    EmployeeFileModel.deleteMany({}),
    AttendanceModel.deleteMany({}),
    CounterModel.deleteMany({}),
    MaterialModel.deleteMany({}),
    WarehouseModel.deleteMany({}),
    StockBalanceModel.deleteMany({}),
    StockTransactionModel.deleteMany({}),
    MaterialRequestModel.deleteMany({}),
    MaterialDispatchModel.deleteMany({}),
    MaterialCustodyModel.deleteMany({}),
    MaterialReconciliationModel.deleteMany({}),
    MaterialReturnReceiptModel.deleteMany({}),
  ]);
};

const run = async () => {
  await connectDatabase(env.mongoUri);
  await clearCollections();

  console.log('Database cleared successfully.');
  console.log('No demo users or sample records were inserted.');
  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

