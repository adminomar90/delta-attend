import ExcelJS from 'exceljs';
import {
  createDoc,
  drawDataTable,
  drawHeader,
  drawKpiCards,
  drawSectionTitle,
  finalize,
  fmtDate,
  safe,
} from '../../infrastructure/reports/pdfTemplate.js';
import { SupplierStatus } from '../../infrastructure/db/models/SupplierModel.js';

export const supplierTypeOptions = [
  'كاميرات مراقبة',
  'شبكات',
  'أجهزة تقنية معلومات',
  'كهرباء',
  'تبريد',
  'منظومات حريق',
  'طاقة شمسية',
  'برامج وأنظمة',
  'مقاولات',
  'مواد بناء',
  'نقل ولوجستيات',
  'خدمات عامة',
  'أخرى',
];

export const supplierStatusLabelMap = {
  [SupplierStatus.NEW]: 'مورد جديد',
  [SupplierStatus.UNDER_REVIEW]: 'قيد المراجعة',
  [SupplierStatus.APPROVED]: 'معتمد',
  [SupplierStatus.SUSPENDED]: 'موقوف',
  [SupplierStatus.REJECTED]: 'مرفوض',
  [SupplierStatus.ARCHIVED]: 'مؤرشف',
};

export const cleanString = (value = '') => String(value || '').trim();
export const normalizePhone = (value = '') => cleanString(value).replace(/[^\d+]/g, '');
export const normalizeCompanyName = (value = '') => cleanString(value).replace(/\s+/g, ' ').toLowerCase();
export const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
export const toBool = (value) => value === true || value === 'true' || value === '1' || value === 'on' || value === 'yes';
export const toStringArray = (value) => {
  if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
  return cleanString(value)
    .split(/[,،\n]/)
    .map(cleanString)
    .filter(Boolean);
};

export const calculateEvaluationScore = (evaluation = {}) => {
  const keys = ['materialQuality', 'supplySpeed', 'timeCommitment', 'prices', 'afterSales', 'support', 'warrantyCommitment'];
  const scores = keys.map((key) => Math.max(0, Math.min(5, toNumber(evaluation[key], 0)))).filter((score) => score > 0);
  if (!scores.length) return 0;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
};

export const calculateSupplierAverage = (evaluations = []) => {
  const scores = evaluations.map((item) => toNumber(item.score, 0)).filter((score) => score > 0);
  if (!scores.length) return 0;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
};

export const buildSupplierExcelBuffer = async (suppliers = []) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Suppliers');

  worksheet.columns = [
    { header: 'اسم المورد', key: 'supplierName', width: 24 },
    { header: 'اسم الشركة', key: 'companyName', width: 28 },
    { header: 'نوع المورد', key: 'supplierType', width: 22 },
    { header: 'الهاتف', key: 'mainPhone', width: 18 },
    { header: 'المحافظة', key: 'governorate', width: 16 },
    { header: 'المدينة', key: 'city', width: 16 },
    { header: 'الحالة', key: 'status', width: 16 },
    { header: 'التصنيف', key: 'classification', width: 16 },
    { header: 'آخر تعامل', key: 'lastInteractionAt', width: 18 },
    { header: 'التقييم', key: 'ratingAverage', width: 12 },
    { header: 'الرصيد المالي', key: 'financialBalance', width: 16 },
  ];

  suppliers.forEach((supplier) => {
    worksheet.addRow({
      supplierName: supplier.supplierName,
      companyName: supplier.companyName,
      supplierType: supplier.supplierType,
      mainPhone: supplier.mainPhone,
      governorate: supplier.governorate,
      city: supplier.city,
      status: supplierStatusLabelMap[supplier.status] || supplier.status,
      classification: supplier.classification,
      lastInteractionAt: supplier.lastInteractionAt ? new Date(supplier.lastInteractionAt).toLocaleDateString('ar-IQ') : '',
      ratingAverage: supplier.ratingAverage || 0,
      financialBalance: supplier.financialBalance || 0,
    });
  });

  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ rightToLeft: true }];
  return workbook.xlsx.writeBuffer();
};

export const buildSupplierPdfBuffer = async (suppliers = []) => {
  const ctx = createDoc({ title: 'تقرير الموردين' });
  drawHeader(ctx, { title: 'تقرير الموردين', date: new Date() });
  drawKpiCards(ctx, [
    { label: 'إجمالي الموردين', value: String(suppliers.length) },
    { label: 'المعتمدون', value: String(suppliers.filter((item) => item.status === SupplierStatus.APPROVED).length) },
    { label: 'لديهم ديون', value: String(suppliers.filter((item) => item.hasOldDebt || Number(item.oldDebtAmount || 0) > 0).length) },
  ]);
  drawSectionTitle(ctx, 'قائمة الموردين');
  drawDataTable(ctx, {
    headers: ['#', 'المورد', 'الشركة', 'النوع', 'الهاتف', 'المدينة', 'الحالة', 'التقييم'],
    colWidths: [0.05, 0.17, 0.18, 0.15, 0.13, 0.12, 0.11, 0.09],
    rows: suppliers.map((supplier, index) => [
      String(index + 1),
      safe(supplier.supplierName),
      safe(supplier.companyName),
      safe(supplier.supplierType),
      safe(supplier.mainPhone),
      safe(supplier.city || supplier.governorate),
      safe(supplierStatusLabelMap[supplier.status] || supplier.status),
      safe(supplier.ratingAverage ? `${supplier.ratingAverage}/5` : '-'),
    ]),
  });
  return finalize(ctx, { footerLabel: `تقرير الموردين - ${fmtDate(new Date())}` });
};
