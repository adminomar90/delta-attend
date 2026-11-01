import { AppError } from '../../shared/errors.js';

export const ticketTypes = [
  { key: 'ADMIN', label: 'مهمة إدارية', technical: false },
  { key: 'FINANCE', label: 'مهمة مالية', technical: false },
  { key: 'PURCHASE', label: 'مشتريات ومتابعة مواد', technical: false },
  { key: 'CUSTOMER', label: 'متابعة زبون', technical: false },
  { key: 'REPAIR', label: 'تذكرة عطل وصيانة', technical: true },
  { key: 'PERIODIC', label: 'متابعة صيانة دورية مستحقة', technical: true },
  { key: 'GENERAL', label: 'مهمة عامة', technical: false },
];
export const terminalStatuses = ['APPROVED', 'CANCELLED'];
export const ticketStatusLabels = { DRAFT: 'مسودة', TODO: 'جديد', ASSIGNED: 'مسند', IN_PROGRESS: 'قيد التنفيذ', WAITING: 'بانتظار معلومات أو إجراء خارجي', SUBMITTED: 'بانتظار المراجعة', REJECTED: 'معاد للتعديل', APPROVED: 'مكتمل', CANCELLED: 'ملغى' };
export const idOf = (value) => String(value?._id || value?.id || value || '');
export const overdue = (task, now = new Date()) => !['DRAFT', ...terminalStatuses].includes(task.status) && !!task.dueDate && new Date(task.dueDate) < now;
export function executionMinutes(task) {
  if (Number(task.execution?.workMinutes) > 0) return Number(task.execution.workMinutes);
  let start = null, total = 0;
  for (const event of task.history || []) {
    const status = event.after?.status;
    if (!status) continue;
    if (status === 'IN_PROGRESS' && !start) start = new Date(event.at);
    else if (status !== 'IN_PROGRESS' && start) { total += Math.max(0, new Date(event.at) - start) / 60000; start = null; }
  }
  return total;
}
export function baghdadDate(value) {
  if (!value) return undefined;
  const text = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text) ? `${text}+03:00` : /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00+03:00` : text);
  if (!Number.isFinite(date.getTime())) throw new AppError('التاريخ غير صالح', 400);
  return date;
}
export function assertSubmission(task, type) {
  if (task.isGroupParent) throw new AppError('يُعتمد إنجاز كل مهمة فرعية بصورة مستقلة', 400);
  const outputs = (task.attachments || []).filter((a) => ['OUTPUT', 'AFTER'].includes(a.purpose));
  if (task.requireOutput && !outputs.length) throw new AppError('أرفق الناتج المطلوب قبل التسليم', 400);
  const expected = { EXCEL: /\.(xlsx|xls|csv)$/i, PDF: /\.pdf$/i, PHOTOS: /\.(png|jpe?g)$/i }[task.outputType];
  if (task.requireOutput && expected && !outputs.some((file) => expected.test(file.originalName || ''))) throw new AppError('نوع ملف الناتج لا يطابق المطلوب', 400);
  if (type?.technical || task.technicalRequired) {
    for (const key of ['diagnosis', 'actionTaken', 'testResult']) if (!task.execution?.[key]?.trim()) throw new AppError('التشخيص والإجراء المنفذ ونتيجة اختبار التشغيل مطلوبة', 400);
    if (!task.execution?.customerSignature && !task.execution?.signatureUnavailableReason?.trim()) throw new AppError('أدخل توقيع الزبون أو سبب تعذر الحصول عليه', 400);
  }
}
export function assertTransition(task, next, body = {}) {
  const allowed = { DRAFT: ['ASSIGNED', 'CANCELLED'], TODO: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'], ASSIGNED: ['IN_PROGRESS', 'WAITING', 'CANCELLED'], IN_PROGRESS: ['WAITING', 'SUBMITTED', 'CANCELLED'], WAITING: ['IN_PROGRESS', 'CANCELLED'], SUBMITTED: ['REJECTED', 'APPROVED', 'CANCELLED'], REJECTED: ['IN_PROGRESS', 'SUBMITTED', 'CANCELLED'], APPROVED: ['IN_PROGRESS'], CANCELLED: ['IN_PROGRESS'] };
  if (!allowed[task.status]?.includes(next)) throw new AppError('انتقال الحالة غير مسموح', 400);
  if (next === 'WAITING' && (!body.reason?.trim() || !body.waitingParty?.trim())) throw new AppError('سبب الانتظار والجهة المطلوبة إلزاميان', 400);
  if (['REJECTED', 'CANCELLED'].includes(next) && !String(body.reason || body.rejectionReason || '').trim()) throw new AppError('السبب إلزامي', 400);
  if (terminalStatuses.includes(task.status) && !body.reason?.trim()) throw new AppError('سبب إعادة الفتح إلزامي', 400);
}
export function nextOccurrence(date, recurrence) {
  const next = new Date(date), frequency = recurrence?.frequency;
  if (!frequency || frequency === 'NONE') return null;
  if (frequency === 'MONTHLY') {
    const day = next.getUTCDate(); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate(); next.setUTCDate(Math.min(day, lastDay));
  } else next.setUTCDate(next.getUTCDate() + (frequency === 'DAILY' ? 1 : frequency === 'WEEKLY' ? 7 : Number(recurrence.intervalDays || 1)));
  return recurrence.until && next > new Date(recurrence.until) ? null : next;
}
