'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildTelHref, buildWhatsappHref } from '../lib/customers';

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const icons = {
  phone: (
    <svg {...iconProps}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.89.66 2.78a2 2 0 0 1-.45 2.11L8.05 9.88a16 16 0 0 0 6.07 6.07l1.27-1.27a2 2 0 0 1 2.11-.45c.89.31 1.82.53 2.78.66A2 2 0 0 1 22 16.92z" /></svg>
  ),
  whatsapp: (
    <svg {...iconProps}><path d="M20.5 11.8a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.4-5A8.4 8.4 0 1 1 20.5 11.8z" /><path d="M8.8 8.4c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.4.5c-.1.1-.2.3-.1.5.4.8 1.2 1.7 2.1 2.1.2.1.4 0 .5-.1l.5-.4c.2-.2.4-.2.7-.1l1.7.7c.3.1.4.3.4.5v.5c0 .3 0 .5-.4.7-.5.3-1.2.5-1.9.4-2.7-.3-5.8-3.3-6.1-6.1-.1-.7.1-1.4.4-1.9z" /></svg>
  ),
  map: (
    <svg {...iconProps}><path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3z" /><path d="M9 3v15" /><path d="M15 6v15" /></svg>
  ),
  copy: (
    <svg {...iconProps}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
  ),
};

const copyToClipboard = async (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  return copied;
};

export default function ContactActionBar({
  phone = '',
  whatsapp = '',
  mapUrl = '',
  address = '',
  whatsappMessage = 'السلام عليكم، معكم شركة دلتا بلس بخصوص طلبكم.',
  compact = false,
  className = '',
}) {
  const [toast, setToast] = useState('');
  const telHref = useMemo(() => buildTelHref(phone), [phone]);
  const whatsappHref = useMemo(() => buildWhatsappHref(whatsapp || phone, whatsappMessage), [phone, whatsapp, whatsappMessage]);
  const mapCopyUrl = useMemo(() => {
    if (mapUrl) return mapUrl;
    const cleanAddress = String(address || '').trim();
    return cleanAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddress)}` : '';
  }, [address, mapUrl]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleCopy = async (value, message) => {
    const copied = await copyToClipboard(value).catch(() => false);
    setToast(copied ? message : 'تعذر النسخ');
  };

  const actionClass = `contact-action-bar ${compact ? 'contact-action-bar-compact' : ''} ${className}`.trim();

  return (
    <div className={actionClass}>
      {toast ? <div className="contact-copy-toast" role="status">{toast}</div> : null}
      {telHref ? (
        <a className="contact-action contact-action-phone" href={telHref} title="اتصال موبايل" aria-label="اتصال موبايل">
          <span className="contact-action-icon">{icons.phone}</span>
          <span>اتصال</span>
        </a>
      ) : null}
      {whatsappHref ? (
        <a className="contact-action contact-action-whatsapp" href={whatsappHref} target="_blank" rel="noreferrer" title="فتح واتساب" aria-label="فتح واتساب">
          <span className="contact-action-icon">{icons.whatsapp}</span>
          <span>واتساب</span>
        </a>
      ) : null}
      {mapUrl ? (
        <a className="contact-action contact-action-map" href={mapUrl} target="_blank" rel="noreferrer" title="فتح الموقع على الخريطة" aria-label="فتح الموقع على الخريطة">
          <span className="contact-action-icon">{icons.map}</span>
          <span>الخريطة</span>
        </a>
      ) : null}
      {phone ? (
        <button className="contact-action contact-action-copy" type="button" title="نسخ رقم الهاتف" aria-label="نسخ رقم الهاتف" onClick={() => handleCopy(phone, 'تم نسخ الرقم')}>
          <span className="contact-action-icon">{icons.copy}</span>
          <span>نسخ الرقم</span>
        </button>
      ) : null}
      {address ? (
        <button className="contact-action contact-action-copy" type="button" title="نسخ العنوان" aria-label="نسخ العنوان" onClick={() => handleCopy(address, 'تم نسخ العنوان')}>
          <span className="contact-action-icon">{icons.copy}</span>
          <span>نسخ العنوان</span>
        </button>
      ) : null}
      {mapCopyUrl ? (
        <button className="contact-action contact-action-copy" type="button" title="نسخ رابط الموقع على الخريطة" aria-label="نسخ رابط الموقع على الخريطة" onClick={() => handleCopy(mapCopyUrl, 'تم نسخ رابط الخريطة')}>
          <span className="contact-action-icon">{icons.copy}</span>
          <span>نسخ الخريطة</span>
        </button>
      ) : null}
    </div>
  );
}
