'use client';

export const normalizeWhatsappPhone = (value) => {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^\d+]/g, '');

  if (!cleaned) {
    return '';
  }

  const withoutPlus = cleaned.replace(/\+/g, '');
  const withoutZeroPrefix = withoutPlus.startsWith('00') ? withoutPlus.slice(2) : withoutPlus;
  if (withoutZeroPrefix.startsWith('964')) return withoutZeroPrefix;
  if (withoutZeroPrefix.startsWith('0')) return `964${withoutZeroPrefix.slice(1)}`;
  if (withoutZeroPrefix.length === 10 && withoutZeroPrefix.startsWith('7')) return `964${withoutZeroPrefix}`;
  return withoutZeroPrefix;
};

export const buildWhatsAppSendUrl = ({ phone, message }) => {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  const text = encodeURIComponent(message || '');
  if (!normalizedPhone) {
    return `https://api.whatsapp.com/send?text=${text}`;
  }

  return `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${text}`;
};
