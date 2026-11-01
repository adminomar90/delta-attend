import { AppError } from '../../shared/errors.js';

export const quoteText = (value, max = 500) => String(value ?? '').trim().slice(0, max);
export const quoteNumber = (value, { min = 0, max = 100000000 } = {}) => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') throw new AppError('أدخل كمية أو سعرًا صحيحًا', 400);
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new AppError('الكمية أو السعر خارج الحدود المسموحة', 400);
  return number;
};
export const cents = (amount) => Math.round(amount * 100);
export const quoteTotals = (items, installationFee = 0, programmingFee = 0, discount = 0) => {
  const lineCents = items.map((item) => Math.round(item.quantity * cents(item.unitPrice)));
  const products = lineCents.reduce((sum, value) => sum + value, 0);
  const subtotal = products + cents(installationFee) + cents(programmingFee);
  if (!Number.isSafeInteger(subtotal) || subtotal > 100000000000000) throw new AppError('إجمالي العرض أكبر من الحد المسموح', 400);
  if (!Number.isFinite(discount) || discount < 0 || cents(discount) > subtotal) throw new AppError('الخصم يجب أن يكون بين صفر وإجمالي العرض قبل الخصم', 400);
  const total = subtotal - cents(discount);
  return { lineTotals: lineCents.map((value) => value / 100), productsTotal: products / 100, total: total / 100 };
};
export const quoteExpiry = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new AppError('تاريخ صلاحية العرض مطلوب', 400);
  const date = new Date(`${value}T23:59:59.999+03:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError('تاريخ صلاحية غير صالح', 400);
  return date;
};
