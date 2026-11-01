'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
import QuoteDocument from '../../../components/customer-quotes/QuoteDocument';

export default function PublicCustomerQuote() {
  const { token } = useParams();
  const [quote, setQuote] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; api.get(`/customer-quotes/public/${encodeURIComponent(token)}`).then((data) => { if (alive) setQuote(data.quote); }).catch((err) => { if (alive) setError(err.message); }); return () => { alive = false; }; }, [token]);
  const pdf = async (download = true) => {
    const popup = download ? null : window.open('', '_blank');
    if (popup) { popup.document.title = 'طباعة عرض السعر'; popup.document.body.textContent = 'جارٍ تجهيز ملف الطباعة…'; }
    setBusy(true);
    try {
      const blob = await api.get(`/customer-quotes/public/${encodeURIComponent(token)}/pdf${download ? '?download=1' : ''}`);
      const url = URL.createObjectURL(blob);
      if (download) { const link = document.createElement('a'); link.href = url; link.download = `${quote.quoteNo}.pdf`; document.body.appendChild(link); link.click(); link.remove(); }
      else if (popup) { popup.addEventListener('load', () => { try { popup.focus(); popup.print(); } catch { /* The PDF viewer retains its own print button. */ } }, { once: true }); popup.location.replace(url); }
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { popup?.close(); setError(err.message); } finally { setBusy(false); }
  };
  return <main className="cq-public"><div className="cq-public-actions cq-toolbar"><img src="/brand/delta-wordmark-transparent.png" alt="Delta Plus" width="140" />{quote ? <div className="cq-actions"><button className="btn btn-primary" disabled={busy} onClick={() => pdf(true)}>{busy ? 'جارٍ التجهيز…' : 'تحميل PDF'}</button><button className="btn btn-soft" disabled={busy} onClick={() => pdf(false)}>طباعة</button></div> : null}</div>{error ? <div className="card cq-error" role="alert">{error}</div> : null}{quote ? <QuoteDocument quote={quote} /> : !error ? <div className="card" role="status">جارٍ تحميل عرض السعر…</div> : null}</main>;
}
