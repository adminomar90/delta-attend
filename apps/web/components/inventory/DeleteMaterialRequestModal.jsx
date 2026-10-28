'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function DeleteMaterialRequestModal({ request, onClose, onDelete }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [busy, onClose]);
  const submit = async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await onDelete(request); onClose(); }
    catch (err) { setError(err.message || 'تعذر حذف الطلب'); }
    finally { setBusy(false); }
  };
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="modal-backdrop" dir="rtl" onClick={() => { if (!busy) onClose(); }}>
    <form className="modal-panel" style={{ width: 'min(560px, calc(100vw - 24px))', maxHeight: '90dvh', overflow: 'auto' }} role="dialog" aria-modal="true" aria-labelledby="delete-material-request-title" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h3 id="delete-material-request-title">حذف طلب المواد <bdi>{request.requestNo}</bdi></h3><button type="button" className="modal-close" aria-label="إغلاق" disabled={busy} onClick={onClose}>&times;</button></div>
      <p>هل تريد حذف هذا الطلب من قوائم طلبات المواد؟</p>
      <p>تلغى الكميات غير المستلمة ويُفك حجزها. الذمم والمواد المصروفة وحركات المخزون المثبتة تبقى محفوظة وقابلة للتصفية.</p>
      {error ? <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <div className="form-actions" style={{ gap: 8 }}><button type="button" className="btn btn-soft" autoFocus disabled={busy} onClick={onClose}>إلغاء</button><button className="btn btn-danger" disabled={busy}>{busy ? 'جار الحذف...' : 'تأكيد حذف الطلب'}</button></div>
    </form>
  </div>, document.body);
}
