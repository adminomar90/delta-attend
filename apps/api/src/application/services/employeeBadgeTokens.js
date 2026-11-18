import { createHmac, timingSafeEqual } from 'node:crypto';

const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const isBadgeDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value && value >= '0001-01-01';
};

export const badgeToday = (date = new Date()) => {
  const parts = Object.fromEntries(dateParts.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const packDate = (value) => Number(value.replaceAll('-', ''));
const unpackDate = (value) => String(value).padStart(8, '0').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
const signature = (payload, secret) => createHmac('sha256', secret)
  .update('delta-employee-badge:v1:').update(payload).digest().subarray(0, 16);

export const createBadgeToken = ({ employeeId, issuedOn, expiresOn }, secret) => {
  const payload = Buffer.alloc(20);
  Buffer.from(employeeId, 'hex').copy(payload);
  payload.writeUInt32BE(packDate(issuedOn), 12);
  payload.writeUInt32BE(packDate(expiresOn), 16);
  return Buffer.concat([payload, signature(payload, secret)]).toString('base64url');
};

export const readBadgeToken = (token, secret) => {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{48}$/.test(token)) return null;
  const bytes = Buffer.from(token, 'base64url');
  const payload = bytes.subarray(0, 20);
  if (!timingSafeEqual(bytes.subarray(20), signature(payload, secret))) return null;
  return {
    employeeId: payload.subarray(0, 12).toString('hex'),
    issuedOn: unpackDate(payload.readUInt32BE(12)),
    expiresOn: unpackDate(payload.readUInt32BE(16)),
  };
};
