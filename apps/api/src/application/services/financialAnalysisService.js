import { FinancialDisbursementStatus, FinancialDisbursementType, getFinancialStatusLabel } from './financialDisbursementService.js';
import { AppError } from '../../shared/errors.js';

const paidStatuses = new Set(['DISBURSED', 'PENDING_RECEIPT_CONFIRMATION', 'RECEIVED', 'CLOSED']);
const approvedStatuses = new Set([...paidStatuses, 'FINANCIALLY_APPROVED', 'GENERAL_MANAGER_APPROVED', 'READY_FOR_DISBURSEMENT']);
const typeLabels = { TRANSPORT_EXPENSE: 'نقل', FOOD_EXPENSE: 'طعام', MATERIALS_EXPENSE: 'مواد', WORK_ADVANCE: 'سلفة عمل', SALARY_ADVANCE: 'سلفة من راتب', BUSINESS_EXPENSE: 'مصروف تشغيلي', EXCEPTIONAL_EXPENSE: 'مصروف استثنائي', TRAVEL_EXPENSE: 'سفر', PURCHASE_REIMBURSEMENT: 'استرداد شراء', OTHER: 'أخرى' };
const id = (value) => String(value?._id || value?.id || value || '');
const normalize = (value) => String(value || '').normalize('NFKC').replace(/[\u064B-\u065Fـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase();
const dateKey = (value) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' }) : '';
const cents = (value) => Math.round((Number(value) || 0) * 100);
const round = (value) => Math.round(value * 100) / 100;
const dateInput = (value, field) => {
  if (!value) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AppError(`Invalid ${field}`, 400);
  return value;
};

export function parseFinancialAnalysisFilters(query = {}) {
  const pick = (key, choices, fallback) => {
    const value = String(query[key] || fallback);
    if (!choices.includes(value)) throw new AppError(`Invalid ${key}`, 400);
    return value;
  };
  const amount = (key) => {
    if (query[key] == null || query[key] === '') return null;
    const value = Number(query[key]);
    if (!Number.isFinite(value) || value < 0 || value > 1e12) throw new AppError(`Invalid ${key}`, 400);
    return value;
  };
  const filters = {
    currency: String(query.currency || 'IQD').toUpperCase(),
    from: dateInput(String(query.from || ''), 'from'), to: dateInput(String(query.to || ''), 'to'),
    basis: pick('basis', ['paid', 'approved', 'requested'], 'paid'),
    archive: pick('archive', ['all', 'active', 'archived'], 'all'),
    invoice: pick('invoice', ['all', 'with', 'without'], 'all'),
    period: pick('period', ['day', 'month'], 'month'),
    sort: pick('sort', ['date-desc', 'amount-desc', 'amount-asc'], 'date-desc'),
    status: String(query.status || ''), type: String(query.type || ''),
    project: String(query.project || ''), employee: String(query.employee || ''),
    search: String(query.search || '').trim().slice(0, 200), min: amount('min'), max: amount('max'),
    page: Math.max(1, Math.floor(Number(query.page) || 1)),
  };
  if (!/^[A-Z]{3}$/.test(filters.currency)) throw new AppError('Invalid currency', 400);
  if (filters.from && filters.to && filters.from > filters.to) throw new AppError('تاريخ البداية يجب أن يسبق تاريخ النهاية', 400);
  if (filters.min != null && filters.max != null && filters.min > filters.max) throw new AppError('الحد الأدنى يجب ألا يتجاوز الحد الأعلى', 400);
  if (filters.status && !Object.values(FinancialDisbursementStatus).includes(filters.status)) throw new AppError('Invalid status', 400);
  if (filters.type && !Object.values(FinancialDisbursementType).includes(filters.type)) throw new AppError('Invalid type', 400);
  return filters;
}

export function buildFinancialAnalysis(records, filters) {
  const rows = records.map((record) => {
    const requested = cents(record.amount);
    const approved = approvedStatuses.has(record.status) ? cents(record.approvedAmount ?? record.amount) : 0;
    const paid = paidStatuses.has(record.status) ? cents(record.approvedAmount ?? record.amount) : 0;
    return {
      id: id(record), requestNo: record.requestNo || '', transactionNo: record.transactionNo || record.requestNo || id(record),
      date: dateKey(record.transactionDate || record.createdAt), currency: record.currency || 'IQD',
      type: record.requestType, typeLabel: typeLabels[record.requestType] || record.requestType,
      status: record.status, statusLabel: getFinancialStatusLabel(record.status),
      project: id(record.project) || 'none', projectName: record.project?.name || 'بدون مشروع',
      employee: id(record.employee) || 'none', employeeName: record.employee?.fullName || 'موظف محذوف',
      description: record.description || '', notes: record.notes || '', archived: !!record.archived,
      requested, approved, paid, value: { paid, approved, requested }[filters.basis],
      pending: !approvedStatuses.has(record.status) && !record.status?.startsWith('REJECTED') && record.status !== 'DRAFT' ? requested : 0,
      attachments: (record.attachments || []).map((file) => ({ name: file.originalName || 'مرفق', url: file.url })),
    };
  });
  // Multi-line transactions may repeat the same invoice attachment on every line.
  const transactionFiles = new Map();
  for (const row of rows) {
    const key = `${row.currency}:${row.transactionNo}`;
    if (!transactionFiles.has(key)) transactionFiles.set(key, new Map());
    for (const file of row.attachments) transactionFiles.get(key).set(file.url, file);
  }
  for (const row of rows) row.attachments = [...transactionFiles.get(`${row.currency}:${row.transactionNo}`).values()];
  const optionsFor = (key, labelKey) => [...new Map(rows.map((row) => [row[key], { value: row[key], label: row[labelKey] }])).values()].sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  const options = {
    currencies: [...new Set(['IQD', 'USD', ...rows.map((row) => row.currency)])].sort(),
    projects: optionsFor('project', 'projectName'), employees: optionsFor('employee', 'employeeName'),
    types: Object.entries(typeLabels).map(([value, label]) => ({ value, label })),
    statuses: Object.values(FinancialDisbursementStatus).map((value) => ({ value, label: getFinancialStatusLabel(value) })),
  };
  const searchWords = normalize(filters.search).split(/\s+/).filter(Boolean);
  const base = rows.filter((row) => row.currency === filters.currency
    && (!filters.type || row.type === filters.type) && (!filters.status || row.status === filters.status)
    && (!filters.project || row.project === filters.project) && (!filters.employee || row.employee === filters.employee)
    && (filters.archive === 'all' || row.archived === (filters.archive === 'archived'))
    && (filters.invoice === 'all' || (row.attachments.length > 0) === (filters.invoice === 'with'))
    && (filters.min == null || row.value >= cents(filters.min)) && (filters.max == null || row.value <= cents(filters.max))
    && searchWords.every((word) => normalize(`${row.requestNo} ${row.transactionNo} ${row.projectName} ${row.employeeName} ${row.description} ${row.notes} ${row.attachments.map((file) => file.name).join(' ')}`).includes(word)));
  const selected = base.filter((row) => (!filters.from || row.date >= filters.from) && (!filters.to || (row.date && row.date <= filters.to)));
  const sum = (key) => selected.reduce((total, row) => total + row[key], 0) / 100;
  const transactions = new Set(selected.map((row) => row.transactionNo));
  const withInvoices = new Set(selected.filter((row) => row.attachments.length).map((row) => row.transactionNo));
  const fileKeys = new Set(selected.flatMap((row) => row.attachments.map((file) => `${row.transactionNo}:${file.url}`)));
  const group = (key, labelKey) => {
    const map = new Map();
    for (const row of selected) {
      if (!map.has(row[key])) map.set(row[key], { key: row[key], label: row[labelKey], cents: 0, count: 0 });
      const entry = map.get(row[key]); entry.cents += row.value; entry.count++;
    }
    const total = selected.reduce((amount, row) => amount + row.value, 0);
    return [...map.values()].map(({ cents: amount, ...entry }) => ({ ...entry, amount: amount / 100, share: total ? round(amount / total * 100) : 0 })).sort((a, b) => b.amount - a.amount || b.count - a.count || a.label.localeCompare(b.label, 'ar'));
  };
  const series = new Map();
  for (const row of selected) {
    if (!row.date) continue;
    const key = filters.period === 'day' ? row.date : row.date.slice(0, 7);
    series.set(key, (series.get(key) || 0) + row.value);
  }
  let comparison = null;
  if (filters.from && filters.to) {
    const start = new Date(`${filters.from}T00:00:00Z`).getTime(), end = new Date(`${filters.to}T00:00:00Z`).getTime();
    const previousFrom = new Date(start - (end - start + 86400000)).toISOString().slice(0, 10);
    const previousTo = new Date(start - 86400000).toISOString().slice(0, 10);
    const previous = base.filter((row) => row.date >= previousFrom && row.date <= previousTo).reduce((amount, row) => amount + row.value, 0) / 100;
    comparison = { from: previousFrom, to: previousTo, amount: previous, change: previous ? round((sum('value') - previous) / previous * 100) : null };
  }
  const sorted = [...selected].sort((a, b) => filters.sort === 'amount-desc' ? b.value - a.value : filters.sort === 'amount-asc' ? a.value - b.value : b.date.localeCompare(a.date) || b.requestNo.localeCompare(a.requestNo));
  const pageSize = 20, pages = Math.max(1, Math.ceil(sorted.length / pageSize)), page = Math.min(filters.page, pages);
  return {
    filters, options,
    summary: { amount: sum('value'), requested: sum('requested'), approved: sum('approved'), paid: sum('paid'), pending: sum('pending'),
      transactions: transactions.size, lines: selected.length, average: transactions.size ? round(sum('value') / transactions.size) : 0,
      withInvoices: withInvoices.size, withoutInvoices: transactions.size - withInvoices.size, attachments: fileKeys.size,
      invoiceCoverage: transactions.size ? round(withInvoices.size / transactions.size * 100) : 0, comparison },
    rankings: { types: group('type', 'typeLabel'), projects: group('project', 'projectName'), employees: group('employee', 'employeeName'), statuses: group('status', 'statusLabel') },
    trend: [...series.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount: amount / 100 })),
    rows: sorted.slice((page - 1) * pageSize, page * pageSize).map(({ requested, approved, paid, value, pending, notes, ...row }) => ({ ...row, requested: requested / 100, approved: approved / 100, paid: paid / 100, value: value / 100 })),
    pagination: { page, pages, pageSize, total: sorted.length },
  };
}
