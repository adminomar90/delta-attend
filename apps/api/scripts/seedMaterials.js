import 'dotenv/config';
import { connectDatabase } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { MaterialModel } from '../src/infrastructure/db/models/MaterialModel.js';

const materials = [
  // ===== ELECTRICAL =====
  { code: 'EL-001', name: 'كيبل كهربائي 2.5 مم', category: 'ELECTRICAL', unit: 'METER', estimatedUnitCost: 5 },
  { code: 'EL-002', name: 'كيبل كهربائي 4 مم', category: 'ELECTRICAL', unit: 'METER', estimatedUnitCost: 8 },
  { code: 'EL-003', name: 'كيبل كهربائي 6 مم', category: 'ELECTRICAL', unit: 'METER', estimatedUnitCost: 12 },
  { code: 'EL-004', name: 'لوحة كهربائية 12 خط', category: 'ELECTRICAL', unit: 'PIECE', estimatedUnitCost: 150 },
  { code: 'EL-005', name: 'قاطع كهربائي 16A', category: 'ELECTRICAL', unit: 'PIECE', estimatedUnitCost: 20 },
  { code: 'EL-006', name: 'قاطع كهربائي 25A', category: 'ELECTRICAL', unit: 'PIECE', estimatedUnitCost: 30 },
  { code: 'EL-007', name: 'مفتاح إضاءة', category: 'ELECTRICAL', unit: 'PIECE', estimatedUnitCost: 10 },
  { code: 'EL-008', name: 'بريزة كهربائية', category: 'ELECTRICAL', unit: 'PIECE', estimatedUnitCost: 12 },
  { code: 'EL-009', name: 'دوبل بريزة', category: 'ELECTRICAL', unit: 'PIECE', estimatedUnitCost: 18 },
  { code: 'EL-010', name: 'إنارة LED 18W', category: 'ELECTRICAL', unit: 'PIECE', estimatedUnitCost: 35 },
  { code: 'EL-011', name: 'أنبوب PVC كهربائي 16مم', category: 'ELECTRICAL', unit: 'METER', estimatedUnitCost: 3 },
  { code: 'EL-012', name: 'أنبوب PVC كهربائي 20مم', category: 'ELECTRICAL', unit: 'METER', estimatedUnitCost: 4 },
  { code: 'EL-013', name: 'علبة توزيع كهربائية', category: 'ELECTRICAL', unit: 'PIECE', estimatedUnitCost: 8 },

  // ===== PLUMBING =====
  { code: 'PL-001', name: 'أنبوب PPR 20مم', category: 'PLUMBING', unit: 'METER', estimatedUnitCost: 6 },
  { code: 'PL-002', name: 'أنبوب PPR 25مم', category: 'PLUMBING', unit: 'METER', estimatedUnitCost: 9 },
  { code: 'PL-003', name: 'أنبوب PPR 32مم', category: 'PLUMBING', unit: 'METER', estimatedUnitCost: 14 },
  { code: 'PL-004', name: 'وصلة PPR 20مم', category: 'PLUMBING', unit: 'PIECE', estimatedUnitCost: 2 },
  { code: 'PL-005', name: 'كوع PPR 20مم 90°', category: 'PLUMBING', unit: 'PIECE', estimatedUnitCost: 3 },
  { code: 'PL-006', name: 'صمام كروي 1/2 بوصة', category: 'PLUMBING', unit: 'PIECE', estimatedUnitCost: 25 },
  { code: 'PL-007', name: 'صمام كروي 3/4 بوصة', category: 'PLUMBING', unit: 'PIECE', estimatedUnitCost: 35 },
  { code: 'PL-008', name: 'عداد مياه 1/2 بوصة', category: 'PLUMBING', unit: 'PIECE', estimatedUnitCost: 80 },
  { code: 'PL-009', name: 'طفاية صرف صحي 4 بوصة', category: 'PLUMBING', unit: 'PIECE', estimatedUnitCost: 15 },
  { code: 'PL-010', name: 'سيفون أرضي', category: 'PLUMBING', unit: 'PIECE', estimatedUnitCost: 20 },

  // ===== CIVIL =====
  { code: 'CV-001', name: 'أسمنت 50 كجم', category: 'CIVIL', unit: 'BAG', estimatedUnitCost: 25 },
  { code: 'CV-002', name: 'رمل', category: 'CIVIL', unit: 'TON', estimatedUnitCost: 60 },
  { code: 'CV-003', name: 'حصى 10مم', category: 'CIVIL', unit: 'TON', estimatedUnitCost: 70 },
  { code: 'CV-004', name: 'حديد تسليح 10مم', category: 'CIVIL', unit: 'TON', estimatedUnitCost: 2500 },
  { code: 'CV-005', name: 'حديد تسليح 12مم', category: 'CIVIL', unit: 'TON', estimatedUnitCost: 2600 },
  { code: 'CV-006', name: 'حديد تسليح 16مم', category: 'CIVIL', unit: 'TON', estimatedUnitCost: 2700 },
  { code: 'CV-007', name: 'طوب أحمر', category: 'CIVIL', unit: 'PIECE', estimatedUnitCost: 0.5 },
  { code: 'CV-008', name: 'بلاط سيراميك 60×60', category: 'CIVIL', unit: 'SQM', estimatedUnitCost: 45 },
  { code: 'CV-009', name: 'لاصق بلاط', category: 'CIVIL', unit: 'BAG', estimatedUnitCost: 18 },
  { code: 'CV-010', name: 'جبس بناء', category: 'CIVIL', unit: 'BAG', estimatedUnitCost: 15 },
  { code: 'CV-011', name: 'دهان داخلي أبيض', category: 'CIVIL', unit: 'LITER', estimatedUnitCost: 12 },
  { code: 'CV-012', name: 'دهان خارجي', category: 'CIVIL', unit: 'LITER', estimatedUnitCost: 18 },
  { code: 'CV-013', name: 'عازل مائي', category: 'CIVIL', unit: 'LITER', estimatedUnitCost: 22 },

  // ===== TOOLS =====
  { code: 'TL-001', name: 'مثقاب كهربائي', category: 'TOOLS', unit: 'PIECE', estimatedUnitCost: 200 },
  { code: 'TL-002', name: 'زاوية قياس', category: 'TOOLS', unit: 'PIECE', estimatedUnitCost: 30 },
  { code: 'TL-003', name: 'شريط قياس 5م', category: 'TOOLS', unit: 'PIECE', estimatedUnitCost: 25 },
  { code: 'TL-004', name: 'مشبك ربط', category: 'TOOLS', unit: 'PIECE', estimatedUnitCost: 5 },
  { code: 'TL-005', name: 'مفك مجموعة', category: 'TOOLS', unit: 'SET', estimatedUnitCost: 80 },
  { code: 'TL-006', name: 'مفتاح ربط قابل للضبط', category: 'TOOLS', unit: 'PIECE', estimatedUnitCost: 45 },
  { code: 'TL-007', name: 'مطرقة 500 جم', category: 'TOOLS', unit: 'PIECE', estimatedUnitCost: 35 },

  // ===== SAFETY =====
  { code: 'SF-001', name: 'خوذة حماية', category: 'SAFETY', unit: 'PIECE', estimatedUnitCost: 40 },
  { code: 'SF-002', name: 'حزام أمان', category: 'SAFETY', unit: 'PIECE', estimatedUnitCost: 150 },
  { code: 'SF-003', name: 'نظارة واقية', category: 'SAFETY', unit: 'PIECE', estimatedUnitCost: 20 },
  { code: 'SF-004', name: 'قفاز عمل', category: 'SAFETY', unit: 'PAIR', estimatedUnitCost: 15 },
  { code: 'SF-005', name: 'حذاء سلامة', category: 'SAFETY', unit: 'PAIR', estimatedUnitCost: 120 },
  { code: 'SF-006', name: 'سترة عاكسة', category: 'SAFETY', unit: 'PIECE', estimatedUnitCost: 30 },
  { code: 'SF-007', name: 'كمامة فلترة FFP2', category: 'SAFETY', unit: 'PIECE', estimatedUnitCost: 8 },

  // ===== GENERAL =====
  { code: 'GN-001', name: 'شريط لاصق', category: 'GENERAL', unit: 'ROLL', estimatedUnitCost: 5 },
  { code: 'GN-002', name: 'سلوك نايلون', category: 'GENERAL', unit: 'METER', estimatedUnitCost: 2 },
  { code: 'GN-003', name: 'مسمار 3 بوصة', category: 'GENERAL', unit: 'KG', estimatedUnitCost: 12 },
  { code: 'GN-004', name: 'براغي ومسامير متفرقة', category: 'GENERAL', unit: 'SET', estimatedUnitCost: 20 },
  { code: 'GN-005', name: 'سلك رباط', category: 'GENERAL', unit: 'KG', estimatedUnitCost: 10 },
];

const run = async () => {
  await connectDatabase(env.mongoUri);
  console.log('Connected to database');

  let added = 0;
  let skipped = 0;

  for (const mat of materials) {
    try {
      await MaterialModel.create({ ...mat, active: true });
      console.log(`  ✓ ${mat.code} - ${mat.name}`);
      added++;
    } catch (err) {
      if (err.code === 11000) {
        console.log(`  ~ ${mat.code} already exists, skipping`);
        skipped++;
      } else {
        console.error(`  ✗ ${mat.code} error:`, err.message);
      }
    }
  }

  console.log(`\nDone: ${added} added, ${skipped} skipped.`);
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
