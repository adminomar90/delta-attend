import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { CustomerEvaluationRepository } from '../../infrastructure/db/repositories/CustomerEvaluationRepository.js';
import { DailyWorkPlanRepository } from '../../infrastructure/db/repositories/DailyWorkPlanRepository.js';
import { WorkReportRepository } from '../../infrastructure/db/repositories/WorkReportRepository.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import {
  buildWhatsappEvaluationMessage,
  calculateAverageScore,
  CustomerEvaluationDepartment,
  CustomerEvaluationSourceType,
  CustomerEvaluationStatus,
  departmentLabelMap,
  generateEvaluationToken,
  pickDepartmentFromText,
  ratingLabelMap,
  sanitizeEvaluationAnswers,
  toCleanString,
} from '../../application/services/customerEvaluationService.js';

const evaluationRepository = new CustomerEvaluationRepository();
const dailyWorkPlanRepository = new DailyWorkPlanRepository();
const workReportRepository = new WorkReportRepository();

const toId = (value) => String(value?._id || value?.id || value || '').trim();
const actorLabel = (req) => req.user?.fullName || req.user?.name || 'مستخدم النظام';

const sourceNumber = (prefix, id) => `${prefix}-${String(id || '').slice(-8).toUpperCase()}`;

const buildEvaluationUrl = (req, token) => {
  const configuredOrigin = String(process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item && !item.includes('localhost'));
  const origin = configuredOrigin || `${req.protocol}://${req.get('host')}`.replace(/\/api$/, '');
  return `${origin.replace(/\/$/, '')}/customer-evaluation/${token}`;
};

const getPublicEvaluation = (evaluation) => ({
  token: evaluation.token,
  status: evaluation.status,
  customer: evaluation.customer,
  work: evaluation.work,
  source: evaluation.source,
});

const buildSnapshotFromDailyPlan = (plan, departmentOverride = '') => {
  const department = Object.values(CustomerEvaluationDepartment).includes(departmentOverride)
    ? departmentOverride
    : pickDepartmentFromText(plan.taskType, plan.title, plan.description);
  return {
    source: {
      sourceType: CustomerEvaluationSourceType.DAILY_WORK_PLAN,
      sourceId: plan._id,
      sourceNumber: sourceNumber('PLAN', plan._id),
      reportUrl: `/daily-work-plans?plan=${plan._id}`,
    },
    customer: {
      customerName: plan.customerSnapshot?.customerName || plan.customerName || plan.customer?.name || '',
      phone: plan.customerSnapshot?.phone || plan.customer?.phone || '',
      companyOrSiteName: plan.customerSnapshot?.siteName || plan.customerName || plan.project?.name || '',
      siteAddress: plan.customerSnapshot?.address || plan.location || '',
    },
    work: {
      serviceType: plan.taskType || plan.title || 'خدمة',
      executionDate: plan.archivedAt || plan.approvedAt || plan.planDate || plan.updatedAt,
      department,
      departmentName: departmentLabelMap[department] || department,
      projectOrTaskName: plan.project?.name || plan.projectNameSnapshot || plan.title || '',
    },
  };
};

const buildSnapshotFromWorkReport = (report, departmentOverride = '') => {
  const department = Object.values(CustomerEvaluationDepartment).includes(departmentOverride)
    ? departmentOverride
    : pickDepartmentFromText(report.activityType, report.title, report.details, report.projectName);
  return {
    source: {
      sourceType: CustomerEvaluationSourceType.WORK_REPORT,
      sourceId: report._id,
      sourceNumber: sourceNumber('WR', report._id),
      reportUrl: `/completed-work-reports?report=${report._id}`,
    },
    customer: {
      customerName: report.project?.name || report.projectName || report.title || '',
      phone: '',
      companyOrSiteName: report.project?.name || report.projectName || '',
      siteAddress: '',
    },
    work: {
      serviceType: report.activityType || report.title || 'تقرير عمل',
      executionDate: report.approvedAt || report.workDate || report.createdAt,
      department,
      departmentName: departmentLabelMap[department] || department,
      projectOrTaskName: report.project?.name || report.projectName || report.title || '',
    },
  };
};

const resolveSourceSnapshot = async (sourceType, sourceId, departmentOverride = '') => {
  if (sourceType === CustomerEvaluationSourceType.DAILY_WORK_PLAN) {
    const plan = await dailyWorkPlanRepository.findById(sourceId);
    if (!plan) throw new AppError('Daily work plan not found', 404);
    return buildSnapshotFromDailyPlan(plan, departmentOverride);
  }
  if (sourceType === CustomerEvaluationSourceType.WORK_REPORT) {
    const report = await workReportRepository.findById(sourceId);
    if (!report) throw new AppError('Work report not found', 404);
    return buildSnapshotFromWorkReport(report, departmentOverride);
  }
  throw new AppError('Invalid evaluation source type', 400);
};

export const createCustomerEvaluationLink = asyncHandler(async (req, res) => {
  const sourceType = toCleanString(req.body.sourceType);
  const sourceId = toCleanString(req.body.sourceId);
  if (!sourceType || !sourceId) throw new AppError('sourceType and sourceId are required', 400);
  const snapshot = await resolveSourceSnapshot(sourceType, sourceId, req.body.department);
  const days = Math.max(1, Math.min(90, Number(req.body.expiresInDays || 30)));
  const existing = await evaluationRepository.findLatestBySource(sourceType, sourceId);
  if (existing && existing.status === CustomerEvaluationStatus.PENDING) {
    const url = buildEvaluationUrl(req, existing.token);
    res.json({ evaluation: existing, url, whatsappMessage: buildWhatsappEvaluationMessage(url) });
    return;
  }

  const evaluation = await evaluationRepository.create({
    token: generateEvaluationToken(),
    status: CustomerEvaluationStatus.PENDING,
    ...snapshot,
    sentBy: req.user.id,
    sentByName: actorLabel(req),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
  });
  const url = buildEvaluationUrl(req, evaluation.token);
  res.status(201).json({ evaluation, url, whatsappMessage: buildWhatsappEvaluationMessage(url) });
});

export const getPublicCustomerEvaluation = asyncHandler(async (req, res) => {
  const evaluation = await evaluationRepository.findByToken(req.params.token);
  if (!evaluation) throw new AppError('رابط التقييم غير صحيح', 404);
  if (evaluation.status === CustomerEvaluationStatus.SUBMITTED) throw new AppError('تم إرسال التقييم مسبقاً', 410);
  if (evaluation.expiresAt && new Date(evaluation.expiresAt).getTime() < Date.now()) {
    await evaluationRepository.updateById(evaluation._id, { status: CustomerEvaluationStatus.EXPIRED });
    throw new AppError('انتهت صلاحية رابط التقييم', 410);
  }
  res.json({ evaluation: getPublicEvaluation(evaluation) });
});

export const submitPublicCustomerEvaluation = asyncHandler(async (req, res) => {
  const evaluation = await evaluationRepository.findByToken(req.params.token);
  if (!evaluation) throw new AppError('رابط التقييم غير صحيح', 404);
  if (evaluation.status === CustomerEvaluationStatus.SUBMITTED) throw new AppError('لا يسمح بإرسال أكثر من تقييم لنفس الرابط', 409);
  if (evaluation.expiresAt && new Date(evaluation.expiresAt).getTime() < Date.now()) {
    await evaluationRepository.updateById(evaluation._id, { status: CustomerEvaluationStatus.EXPIRED });
    throw new AppError('انتهت صلاحية رابط التقييم', 410);
  }
  const answers = sanitizeEvaluationAnswers(req.body);
  if (!answers.overallRating) throw new AppError('التقييم العام مطلوب', 400);
  const updated = await evaluationRepository.updateByToken(req.params.token, {
    answers,
    averageScore: calculateAverageScore(answers),
    status: CustomerEvaluationStatus.SUBMITTED,
    submittedAt: new Date(),
  });
  res.status(201).json({
    message: 'شكراً لتقييمك، ملاحظاتك تساعدنا على تطوير جودة خدمات دلتا بلس.',
    evaluation: getPublicEvaluation(updated),
  });
});

const buildEvaluationFilter = (req) => {
  const filter = {};
  const search = toCleanString(req.query.search);
  const phone = toCleanString(req.query.phone);
  const department = toCleanString(req.query.department);
  const serviceType = toCleanString(req.query.serviceType);
  const overallRating = toCleanString(req.query.overallRating);
  const sourceType = toCleanString(req.query.sourceType);
  const sourceId = toCleanString(req.query.sourceId);
  const weakOnly = String(req.query.weakOnly || '').toLowerCase() === 'true';
  const needsFollowUp = String(req.query.needsFollowUp || '').toLowerCase() === 'true';

  if (department) filter['work.department'] = department;
  if (serviceType) filter['work.serviceType'] = new RegExp(serviceType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (overallRating) filter['answers.overallRating'] = overallRating;
  if (sourceType) filter['source.sourceType'] = sourceType;
  if (sourceId) filter['source.sourceId'] = sourceId;
  if (phone) filter['customer.phone'] = new RegExp(phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (weakOnly) filter['answers.overallRating'] = { $in: ['ACCEPTABLE', 'WEAK'] };
  if (needsFollowUp) filter['answers.issueAfterLeaving'] = 'NEEDS_FOLLOW_UP';
  if (req.query.dateFrom || req.query.dateTo) {
    filter['work.executionDate'] = {};
    if (req.query.dateFrom) filter['work.executionDate'].$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) filter['work.executionDate'].$lte = new Date(req.query.dateTo);
  }
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { 'customer.customerName': regex },
      { 'customer.phone': regex },
      { 'customer.companyOrSiteName': regex },
      { 'work.departmentName': regex },
      { 'work.serviceType': regex },
      { 'source.sourceNumber': regex },
    ];
  }
  return filter;
};

const buildSummary = (evaluations) => {
  const byDepartment = {};
  evaluations.forEach((item) => {
    const department = item.work?.department || 'UNKNOWN';
    if (!byDepartment[department]) byDepartment[department] = { department, departmentName: item.work?.departmentName || department, count: 0, total: 0, excellent: 0, weak: 0, followUp: 0 };
    byDepartment[department].count += 1;
    byDepartment[department].total += Number(item.averageScore || 0);
    if (item.answers?.overallRating === 'EXCELLENT') byDepartment[department].excellent += 1;
    if (['ACCEPTABLE', 'WEAK'].includes(item.answers?.overallRating)) byDepartment[department].weak += 1;
    if (item.answers?.issueAfterLeaving === 'NEEDS_FOLLOW_UP') byDepartment[department].followUp += 1;
  });
  return Object.values(byDepartment).map((item) => ({
    ...item,
    average: item.count ? Number((item.total / item.count).toFixed(2)) : 0,
  }));
};

export const listCustomerEvaluations = asyncHandler(async (req, res) => {
  const evaluations = await evaluationRepository.list(buildEvaluationFilter(req), { limit: 1000 });
  res.json({ evaluations, summary: buildSummary(evaluations) });
});

export const reactivateCustomerEvaluation = asyncHandler(async (req, res) => {
  const evaluation = await evaluationRepository.findById(req.params.id);
  if (!evaluation) throw new AppError('Evaluation not found', 404);
  const updated = await evaluationRepository.updateById(req.params.id, {
    status: CustomerEvaluationStatus.PENDING,
    submittedAt: null,
    answers: {},
    averageScore: 0,
    reactivatedAt: new Date(),
    reactivatedBy: req.user.id,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  const url = buildEvaluationUrl(req, updated.token);
  res.json({ evaluation: updated, url, whatsappMessage: buildWhatsappEvaluationMessage(url) });
});

const rowForExport = (item) => ({
  customerName: item.customer?.customerName || '',
  phone: item.customer?.phone || '',
  site: item.customer?.companyOrSiteName || '',
  address: item.customer?.siteAddress || '',
  serviceType: item.work?.serviceType || '',
  executionDate: item.work?.executionDate ? new Date(item.work.executionDate).toLocaleDateString('ar-IQ') : '',
  sourceNumber: item.source?.sourceNumber || '',
  departmentName: item.work?.departmentName || '',
  projectOrTaskName: item.work?.projectOrTaskName || '',
  overallRating: ratingLabelMap[item.answers?.overallRating] || '',
  issueAfterLeaving: item.answers?.issueAfterLeaving || '',
  customerNotes: item.answers?.customerNotes || '',
  status: item.status,
  sentAt: item.sentAt ? new Date(item.sentAt).toLocaleString('ar-IQ') : '',
  submittedAt: item.submittedAt ? new Date(item.submittedAt).toLocaleString('ar-IQ') : '',
});

export const exportCustomerEvaluationsExcel = asyncHandler(async (req, res) => {
  const evaluations = await evaluationRepository.list(buildEvaluationFilter(req), { limit: 5000 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Customer Evaluations');
  sheet.columns = [
    { header: 'اسم الزبون', key: 'customerName', width: 24 },
    { header: 'الهاتف', key: 'phone', width: 18 },
    { header: 'الموقع', key: 'site', width: 24 },
    { header: 'العنوان', key: 'address', width: 30 },
    { header: 'نوع الخدمة', key: 'serviceType', width: 20 },
    { header: 'تاريخ التنفيذ', key: 'executionDate', width: 16 },
    { header: 'رقم التقرير/البلان', key: 'sourceNumber', width: 20 },
    { header: 'القسم', key: 'departmentName', width: 22 },
    { header: 'المشروع/المهمة', key: 'projectOrTaskName', width: 28 },
    { header: 'التقييم العام', key: 'overallRating', width: 16 },
    { header: 'حالة المشكلة', key: 'issueAfterLeaving', width: 20 },
    { header: 'ملاحظات الزبون', key: 'customerNotes', width: 36 },
    { header: 'الحالة', key: 'status', width: 16 },
    { header: 'تاريخ الإرسال', key: 'sentAt', width: 22 },
    { header: 'تاريخ التقييم', key: 'submittedAt', width: 22 },
  ];
  evaluations.map(rowForExport).forEach((row) => sheet.addRow(row));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="customer-evaluations.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

export const exportCustomerEvaluationsPdf = asyncHandler(async (req, res) => {
  const evaluations = await evaluationRepository.list(buildEvaluationFilter(req), { limit: 500 });
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="customer-evaluations.pdf"');
  doc.pipe(res);
  doc.fontSize(16).text('Customer Evaluations - Delta Plus', { align: 'center' });
  doc.moveDown();
  evaluations.map(rowForExport).forEach((row, index) => {
    doc.fontSize(10).text(`${index + 1}. ${row.customerName || '-'} | ${row.departmentName || '-'} | ${row.overallRating || '-'} | ${row.sourceNumber || '-'}`);
    if (row.customerNotes) doc.fontSize(9).text(`Notes: ${row.customerNotes}`);
    doc.moveDown(0.5);
  });
  doc.end();
});
