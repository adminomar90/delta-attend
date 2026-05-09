import crypto from 'crypto';

export const CustomerEvaluationSourceType = {
  WORK_REPORT: 'WORK_REPORT',
  DAILY_WORK_PLAN: 'DAILY_WORK_PLAN',
};

export const CustomerEvaluationStatus = {
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  EXPIRED: 'EXPIRED',
};

export const CustomerEvaluationDepartment = {
  PROJECTS: 'PROJECTS',
  MAINTENANCE: 'MAINTENANCE',
  TECHNICAL_SUPPORT: 'TECHNICAL_SUPPORT',
  SALES: 'SALES',
  FOLLOW_UP_CONTROL: 'FOLLOW_UP_CONTROL',
};

export const departmentLabelMap = {
  [CustomerEvaluationDepartment.PROJECTS]: 'قسم المشاريع',
  [CustomerEvaluationDepartment.MAINTENANCE]: 'قسم الصيانة',
  [CustomerEvaluationDepartment.TECHNICAL_SUPPORT]: 'قسم الدعم الفني',
  [CustomerEvaluationDepartment.SALES]: 'قسم المبيعات',
  [CustomerEvaluationDepartment.FOLLOW_UP_CONTROL]: 'قسم المتابعة والسيطرة',
};

export const ratingOptions = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE', 'WEAK'];

export const ratingScoreMap = {
  EXCELLENT: 5,
  VERY_GOOD: 4,
  GOOD: 3,
  ACCEPTABLE: 2,
  WEAK: 1,
};

export const ratingLabelMap = {
  EXCELLENT: 'ممتاز',
  VERY_GOOD: 'جيد جداً',
  GOOD: 'جيد',
  ACCEPTABLE: 'مقبول',
  WEAK: 'ضعيف',
};

export const yesNoPartialOptions = ['YES', 'NO', 'PARTIAL'];
export const issueStatusOptions = ['NONE', 'MINOR', 'NEEDS_FOLLOW_UP'];
export const recommendationOptions = ['YES', 'NO', 'MAYBE'];

export const generateEvaluationToken = () => crypto.randomBytes(32).toString('hex');

export const toCleanString = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

export const pickDepartmentFromText = (...values) => {
  const text = values.map(toCleanString).join(' ').toLowerCase();
  if (/(صيانة|maintenance)/i.test(text)) return CustomerEvaluationDepartment.MAINTENANCE;
  if (/(دعم|support|technical)/i.test(text)) return CustomerEvaluationDepartment.TECHNICAL_SUPPORT;
  if (/(مبيعات|sales)/i.test(text)) return CustomerEvaluationDepartment.SALES;
  if (/(متابعة|سيطرة|control|follow)/i.test(text)) return CustomerEvaluationDepartment.FOLLOW_UP_CONTROL;
  return CustomerEvaluationDepartment.PROJECTS;
};

export const buildWhatsappEvaluationMessage = (url) => [
  'عميلنا العزيز،',
  'نشكركم لاختياركم شركة دلتا بلس.',
  '',
  'نرجو منكم تقييم الخدمة التي تم تنفيذها من خلال الرابط التالي:',
  url,
  '',
  'ملاحظاتكم تساعدنا على تحسين جودة خدماتنا.',
].join('\n');

export const sanitizeEvaluationAnswers = (body = {}) => {
  const ratingKeys = [
    'arrivalCommitment',
    'respectfulTreatment',
    'appearanceAndOrganization',
    'requestUnderstanding',
    'executionQuality',
    'completionSpeed',
    'cleanupAfterWork',
    'serviceExplanation',
    'problemResolution',
    'overallRating',
  ];

  const answers = {};
  ratingKeys.forEach((key) => {
    answers[key] = ratingOptions.includes(body[key]) ? body[key] : '';
  });
  answers.completedAsRequested = yesNoPartialOptions.includes(body.completedAsRequested) ? body.completedAsRequested : '';
  answers.issueAfterLeaving = issueStatusOptions.includes(body.issueAfterLeaving) ? body.issueAfterLeaving : '';
  answers.recommendAgain = recommendationOptions.includes(body.recommendAgain) ? body.recommendAgain : '';
  answers.customerNotes = toCleanString(body.customerNotes);
  return answers;
};

export const calculateAverageScore = (answers = {}) => {
  const keys = Object.keys(answers).filter((key) => ratingScoreMap[answers[key]]);
  if (!keys.length) return 0;
  const total = keys.reduce((sum, key) => sum + ratingScoreMap[answers[key]], 0);
  return Number((total / keys.length).toFixed(2));
};
