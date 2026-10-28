import { AppError } from './errors.js';

export const normalizeNetworkCustomerLogo = (value) => {
  if (value === '' || value == null) return '';
  if (typeof value !== 'string' || value.length > 175000) throw new AppError('حجم شعار الزبون يتجاوز الحد المسموح', 400);
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new AppError('اختر شعاراً بصيغة PNG أو JPEG أو WebP', 400);
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 20 || bytes.length > 128 * 1024 || bytes.toString('base64') !== match[2]) throw new AppError('ملف شعار الزبون غير صالح أو حجمه كبير', 400);
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length;
  if (!valid) throw new AppError('محتوى صورة الشعار غير مطابق لصيغتها', 400);
  return value;
};
