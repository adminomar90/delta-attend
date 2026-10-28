'use client';

import { useEffect, useRef, useState } from 'react';
import NetworkCustomerLogo from './NetworkCustomerLogo';

export default function NetworkCustomerLogoPicker({ value, onChange, disabled, onBusyChange }) {
  const [error, setError] = useState('');
  const version = useRef(0), input = useRef(null);
  useEffect(() => () => { version.current++; }, []);
  const select = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('اختر صورة PNG أو JPEG أو WebP.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('اختر صورة لا يتجاوز حجمها 5 MB.'); return; }
    const current = ++version.current; onBusyChange(true);
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/webp', 0.85);
      if (data.length > 175000) throw new Error('الصورة كبيرة بعد التصغير؛ اختر شعاراً أبسط.');
      if (current === version.current) onChange(data);
    } catch (err) { if (current === version.current) setError(err.message?.includes('الصورة كبيرة') ? err.message : 'تعذر قراءة الصورة؛ اختر ملف صورة صالحاً.'); }
    finally { bitmap?.close?.(); if (current === version.current) onBusyChange(false); }
  };
  return <div className="customer-logo-picker"><span className="logo-label">شعار الزبون <small>اختياري</small></span><div className="logo-controls"><div className="logo-preview"><NetworkCustomerLogo src={value} name="الزبون" /></div><div><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="اختيار شعار الزبون" hidden disabled={disabled} onChange={select} /><div className="logo-buttons"><button type="button" className="btn btn-soft" disabled={disabled} onClick={() => input.current?.click()}>{value ? 'تغيير الشعار' : 'رفع شعار'}</button>{value ? <button type="button" className="btn btn-soft" disabled={disabled} onClick={() => { setError(''); onChange(''); }}>إزالة الشعار</button> : null}</div><p>PNG أو JPEG أو WebP — حتى 5 MB. يظهر على يمين اسم الزبون في البطاقة.</p></div></div>{error ? <p className="logo-error" role="alert">{error}</p> : null}<style jsx>{`.customer-logo-picker{display:grid;gap:10px}.logo-label{font-size:13px}.logo-label small{color:var(--text-soft);margin-inline-start:6px}.logo-controls{display:flex;gap:14px;align-items:center}.logo-preview{width:72px;height:72px;flex-shrink:0;border:1px solid var(--border);border-radius:14px;display:grid;place-items:center;overflow:hidden;background:var(--surface-soft);color:var(--accent);font-size:28px;font-weight:700}.logo-buttons{display:flex;gap:8px;flex-wrap:wrap}.logo-controls p{font-size:11px;color:var(--text-soft);line-height:1.8;margin:8px 0 0}.logo-error{font-size:12px;color:var(--danger);margin:0}`}</style></div>;
}
