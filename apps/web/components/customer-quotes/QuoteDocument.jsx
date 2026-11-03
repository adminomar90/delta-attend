'use client';

import './quotes.css';
import { useState } from 'react';
import { assetUrl } from '../../lib/api';
import { companyContact } from '../../../../shared/companyContact.mjs';
import { quoteQr, quoteQrPath } from '../../../../shared/customerQuoteQr.mjs';
export const quoteMoney = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const quoteDate = (value) => value ? new Date(value).toLocaleDateString('en-GB', { timeZone: 'Asia/Baghdad' }) : '-';
export const unitLabel = (value) => ({ PIECE: 'قطعة', METER: 'متر', BOX: 'علبة', ROLL: 'لفة', SET: 'طقم', KG: 'كغم', UNIT: 'وحدة' }[value] || value);
function QuoteQrPanel() {
  return <span className="cq-template-qr">
    <img src="/brand/quote-template-qr-panel.png" alt="" />
    <svg viewBox={`0 0 ${quoteQr.width} ${quoteQr.height}`} role="img" aria-label="رمز QR للتواصل" shapeRendering="crispEdges">
      <rect {...quoteQr.cover} fill={quoteQr.background} />
      <path d={quoteQrPath} fill={quoteQr.color} />
    </svg>
  </span>;
}
export function QuoteProductImage({ url, name }) {
  const [failed, setFailed] = useState('');
  return <div className="cq-product-image">{url && failed !== url ? <img src={assetUrl(url)} alt={`صورة ${name}`} loading="lazy" decoding="async" onError={() => setFailed(url)} /> : <span>لا توجد صورة</span>}</div>;
}
export default function QuoteDocument({ quote }) {
  return <article className="customer-quote-paper" dir="rtl">
    <header className="cq-paper-header cq-letterhead-header"><img className="cq-letterhead-art" src="/brand/quote-template-header.png" alt="دلتا بلص للحلول التقنية والأمنية" /><div className="cq-letterhead-meta"><h1>عرض أسعار</h1><div dir="ltr"><strong>{quoteDate(quote.createdAt)}</strong><span>NO. {quote.quoteNo}</span></div></div></header>
    <div className="cq-paper-body">
      <div className="cq-document-meta"><div>{quote.customerName ? <><small>مقدم إلى</small><h2>{quote.customerName}</h2></> : <h2>عرض أسعار عام</h2>}{quote.address ? <p>{quote.address}</p> : null}</div><div className="cq-currency-badge"><small>صالح لغاية</small><bdi>{quoteDate(quote.validUntil)}</bdi><strong>{quote.currency}</strong></div></div>
      {quote.title && quote.title !== 'عرض أسعار' ? <h3>{quote.title}</h3> : null}
      <div className="cq-section-heading"><span>01</span><h3>تفاصيل المنتجات</h3></div>
      <div className="cq-table-scroll"><table className="cq-lines"><thead><tr><th>#</th><th>المنتج</th><th>الوحدة</th><th>الكمية</th><th>سعر البيع</th><th>الإجمالي</th></tr></thead><tbody>{quote.items.map((line, i) => <tr key={i}><td>{i + 1}</td><td><div className="cq-product"><QuoteProductImage url={line.imageUrl} name={line.name} /><div className="cq-product-details"><strong>{line.name}</strong>{line.brand ? <small>{line.brand}</small> : null}<div className="cq-product-tags">{line.code ? <span><bdi>{line.code}</bdi></span> : null}{line.model ? <span><bdi>{line.model}</bdi></span> : null}</div></div></div></td><td>{unitLabel(line.unit)}</td><td><b className="cq-quantity" dir="ltr">{quoteMoney(line.quantity)}</b></td><td dir="ltr">{quoteMoney(line.unitPrice)}</td><td dir="ltr">{quoteMoney(line.total)}</td></tr>)}</tbody></table></div>
      <dl className="cq-totals"><div><dt>مجموع المنتجات</dt><dd><bdi>{quoteMoney(quote.productsTotal)} {quote.currency}</bdi></dd></div><div><dt>أجور التركيب</dt><dd><bdi>{quoteMoney(quote.installationFee)} {quote.currency}</bdi></dd></div><div><dt>أجور البرمجة</dt><dd><bdi>{quoteMoney(quote.programmingFee)} {quote.currency}</bdi></dd></div>{Number(quote.discount || 0) > 0 ? <><div><dt>الإجمالي قبل الخصم</dt><dd><bdi>{quoteMoney(Number(quote.productsTotal) + Number(quote.installationFee || 0) + Number(quote.programmingFee || 0))} {quote.currency}</bdi></dd></div><div className="cq-discount"><dt>الخصم</dt><dd><bdi>-{quoteMoney(quote.discount)} {quote.currency}</bdi></dd></div></> : null}<div className="cq-grand-total"><dt>{Number(quote.discount || 0) > 0 ? 'الإجمالي بعد الخصم' : 'الإجمالي الكلي'}</dt><dd><bdi>{quoteMoney(quote.total)} {quote.currency}</bdi></dd></div></dl>
      {quote.notes ? <section className="cq-document-notes"><h3>ملاحظات العرض</h3><p>{quote.notes}</p></section> : null}
      {quote.terms ? <section className="cq-document-notes"><h3>الشروط والأحكام</h3><p>{quote.terms}</p></section> : null}
    </div>
    <footer className="cq-template-footer cq-company-contact"><div className="cq-template-contact"><a href={`mailto:${companyContact.email}`}>{companyContact.email}</a><a href={companyContact.websiteUrl} target="_blank" rel="noreferrer">{companyContact.website}</a><div className="cq-contact-phones">{companyContact.phones.map((phone) => <a href={`tel:${phone}`} key={phone}>{phone}</a>)}</div></div><div className="cq-template-social"><strong>التواصل الاجتماعي</strong><a href={companyContact.facebookUrl} target="_blank" rel="noreferrer">Facebook: {companyContact.socialHandle}</a><a href={companyContact.instagramUrl} target="_blank" rel="noreferrer">Instagram: {companyContact.socialHandle}</a></div><QuoteQrPanel /></footer>
  </article>;
}
