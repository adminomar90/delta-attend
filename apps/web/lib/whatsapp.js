'use client';

export const normalizeWhatsappPhone = (value) => {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^\d+]/g, '');

  if (!cleaned) {
    return '';
  }

  const withoutZeroPrefix = cleaned.startsWith('00') ? cleaned.slice(2) : cleaned;
  return withoutZeroPrefix.replace(/\+/g, '');
};

export const buildWhatsAppSendUrl = ({ phone, message }) => {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) {
    return '';
  }

  return `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(message || '')}`;
};
