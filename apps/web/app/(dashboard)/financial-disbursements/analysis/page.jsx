'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, assetUrl } from '../../../../lib/api';
import './analysis.css';

const money = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value || 0);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
const defaults = () => ({ currency: 'IQD', from: `${today().slice(0, 4)}-01-01`, to: today(), basis: 'paid', archive: 'all', invoice: 'all', period: 'month', sort: 'date-desc', status: '', type: '', project: '', employee: '', search: '', min: '', max: '', page: 1 });
const basisLabels = { paid: 'المصروف فعليًا', approved: 'المعتمد للصرف', requested: 'المطلوب' };
const dimensions = { types: ['أنواع المصروف', 'type'], projects: ['المشاريع', 'project'], employees: ['الموظفون', 'employee'], statuses: ['الحالات', 'status'] };
const colors = ['#66c7f4', '#c4d743', '#9b9aef', '#53d6b3', '#eeae6c', '#e48fbb'];

function Ranking({ entries, mode, onSelect }) {
  const shown = entries.filter((entry) => entry.amount > 0).slice(0, 8);
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  if (!shown.length) return <p className="fa-empty">لا توجد مبالغ لهذا الاختيار.</p>;
  let offset = 0;
  const slices = shown.map((entry, index) => {
    const start = offset; offset += entry.amount / total * 100;
    return `${colors[index % colors.length]} ${start}% ${offset}%`;
  });
  if (offset < 99.99) slices.push(`#33455d ${offset}% 100%`);
  return <div className={`fa-ranking fa-ranking-${mode}`}>
    {mode === 'donut' ? <div className="fa-donut" role="img" aria-label={`توزيع الصرف: ${shown.map((entry) => `${entry.label} ${entry.share}%`).join('، ')}`} style={{ background: `conic-gradient(${slices.join(',')})` }}><div><small>إجمالي التوزيع</small><strong>{money(total)}</strong></div></div> : null}
    <div className="fa-rank-list">{shown.map((entry, index) => <button key={entry.key} className="fa-rank-item" onClick={() => onSelect(entry.key)} title={`فلترة حسب ${entry.label}`}>
      <span className="fa-rank-heading"><span><i style={{ background: colors[index % colors.length] }} />{entry.label}</span><bdi>{money(entry.amount)}</bdi></span>
      {mode === 'bars' ? <span className="fa-bar-track"><span style={{ width: `${entry.amount / shown[0].amount * 100}%`, background: colors[index % colors.length] }} /></span> : null}
      <span className="fa-rank-caption"><span>{entry.count} بند</span><bdi>{entry.share}%</bdi></span>
    </button>)}</div>
    {entries.length > shown.length ? <small className="fa-muted">أعلى {shown.length} من أصل {entries.length}؛ بقية النتائج متاحة في التفاصيل.</small> : null}
  </div>;
}

function Trend({ entries, mode, currency }) {
  if (!entries.length) return <p className="fa-empty">لا توجد حركة خلال الفترة المحددة.</p>;
  const max = Math.max(...entries.map((entry) => entry.amount), 1), width = Math.max(620, entries.length * 56), h = 240;
  const x = (index) => 54 + index * (width - 80) / Math.max(entries.length - 1, 1);
  const y = (amount) => 192 - amount / max * 148;
  return <div className="fa-trend-scroll"><svg className="fa-trend" viewBox={`0 0 ${width} ${h}`} style={{ minWidth: width }} role="img" aria-label={`اتجاه الصرف بعملة ${currency}`}>
    {[0, .5, 1].map((fraction) => <g key={fraction}><line x1="50" x2={width - 16} y1={y(max * fraction)} y2={y(max * fraction)} stroke="currentColor" opacity=".13" /><text x="44" y={y(max * fraction) + 4} textAnchor="end">{money(max * fraction)}</text></g>)}
    {mode === 'line' && entries.length > 1 ? <polyline fill="none" stroke="#66c7f4" strokeWidth="3" points={entries.map((entry, index) => `${x(index)},${y(entry.amount)}`).join(' ')} /> : null}
    {entries.map((entry, index) => <g key={entry.date}><title>{entry.date}: {money(entry.amount)} {currency}</title>{mode === 'line' ? <circle cx={x(index)} cy={y(entry.amount)} r="5" fill="#c4d743" /> : <rect x={x(index) - 10} y={y(entry.amount)} width="20" height={192 - y(entry.amount)} rx="4" fill="#66c7f4" />}<text x={x(index)} y="216" textAnchor="middle">{entry.date}</text></g>)}
  </svg></div>;
}

export default function FinancialAnalysisPage() {
  const initial = useRef(null); if (!initial.current) initial.current = defaults();
  const [draft, setDraft] = useState(initial.current), [filters, setFilters] = useState(initial.current);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const [dimension, setDimension] = useState('types'), [chart, setChart] = useState('bars'), [trend, setTrend] = useState('line'), [view, setView] = useState('table'), [detail, setDetail] = useState(null);
  useEffect(() => {
    let alive = true; setLoading(true); setError(''); setDetail(null);
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
    api.get(`/financial-disbursements/analysis?${params}`).then((result) => { if (alive) setData(result); }).catch((err) => { if (alive) { setError(err.message); setData(null); } }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filters, reload]);
  const set = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const apply = (changes = {}) => { const next = { ...filters, ...changes, page: changes.page || 1 }; setDraft(next); setFilters(next); };
  const options = data?.options || {};
  const select = (label, key, items, all = true) => <label>{label}<select value={draft[key]} onChange={(event) => set(key, event.target.value)}>{all ? <option value="">الكل</option> : null}{items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
  const summary = data?.summary;
  const entries = data?.rankings[dimension] || [];
  const top = entries.find((entry) => entry.amount > 0);
  return <div className="financial-analysis" dir="rtl">
    <section className="card fa-header"><div><span className="fa-eyebrow">الصرف المالي / التحليلات</span><h2>التحليل المالي</h2><p className="fa-muted">مؤشرات الإنفاق وتحليل المعاملات ومرفقات الفواتير، بحسب البيانات المسجلة.</p></div><div className="fa-actions"><Link className="btn btn-soft" href="/financial-disbursements">رجوع للصرف المالي</Link><button className="btn btn-primary" disabled={loading} onClick={() => setReload((value) => value + 1)}>تحديث التحليل</button></div></section>
    <form className="card fa-filters" onSubmit={(event) => { event.preventDefault(); setFilters({ ...draft, page: 1 }); }}>
      <div className="fa-section-head"><h3>فلاتر التحليل</h3><span className="fa-muted">تُطبّق على المؤشرات والرسوم والتفاصيل معًا</span></div>
      <div className="fa-filter-grid">
        <label>من تاريخ<input type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => set('from', event.target.value)} /></label>
        <label>إلى تاريخ<input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => set('to', event.target.value)} /></label>
        {select('العملة', 'currency', (options.currencies || ['IQD', 'USD']).map((value) => ({ value, label: value === 'IQD' ? 'دينار عراقي — IQD' : value === 'USD' ? 'دولار أمريكي — USD' : value })), false)}
        {select('أساس التحليل', 'basis', Object.entries(basisLabels).map(([value, label]) => ({ value, label })), false)}
        {select('المشروع', 'project', options.projects || [])}{select('الموظف صاحب الطلب', 'employee', options.employees || [])}
        {select('نوع المصروف', 'type', options.types || [])}{select('حالة المعاملة', 'status', options.statuses || [])}
        {select('الأرشيف', 'archive', [{ value: 'all', label: 'الحالي والمؤرشف' }, { value: 'active', label: 'الحالي فقط' }, { value: 'archived', label: 'المؤرشف فقط' }], false)}
        {select('مرفقات الفواتير', 'invoice', [{ value: 'all', label: 'جميع المعاملات' }, { value: 'with', label: 'بمرفقات' }, { value: 'without', label: 'بدون مرفقات' }], false)}
        <label>أقل مبلغ<input type="number" min="0" step="0.01" value={draft.min} onChange={(event) => set('min', event.target.value)} placeholder="0" /></label>
        <label>أعلى مبلغ<input type="number" min={draft.min || '0'} step="0.01" value={draft.max} onChange={(event) => set('max', event.target.value)} placeholder="بدون حد" /></label>
        <label className="fa-search">بحث في المعاملات والفواتير<input value={draft.search} maxLength={200} onChange={(event) => set('search', event.target.value)} placeholder="رقم المعاملة، المشروع، الموظف، الوصف أو اسم المرفق" /></label>
      </div>
      <div className="fa-actions"><button className="btn btn-primary" disabled={loading}>تطبيق الفلاتر</button><button type="button" className="btn btn-soft" disabled={loading} onClick={() => { const next = defaults(); setDraft(next); setFilters(next); }}>إعادة ضبط</button><button type="button" className="btn btn-soft" disabled={loading} onClick={() => { const next = { ...draft, from: '', to: '', page: 1 }; setDraft(next); setFilters(next); }}>كل الفترات</button></div>
    </form>
    {error ? <section className="card fa-error" role="alert">{error}<button className="btn btn-soft" onClick={() => setReload((value) => value + 1)}>إعادة المحاولة</button></section> : null}
    {loading ? <section className="card" role="status">جارٍ تحليل البيانات…</section> : null}
    {!loading && data ? <>
      <p className="fa-context">{data.scope === 'all' ? 'النطاق: جميع معاملات الصرف' : 'النطاق: معاملاتك والمعاملات المسندة إليك فقط'} · <bdi>{filters.currency}</bdi> · {basisLabels[filters.basis]} · الفترة: <bdi>{filters.from || 'البداية'} — {filters.to || 'اليوم'}</bdi></p>
      <section className="fa-kpis" aria-label="المؤشرات المالية">{[
        [basisLabels[filters.basis], summary.amount, filters.currency, 'main'], ['المصروف فعليًا', summary.paid, filters.currency], ['المبالغ المطلوبة', summary.requested, filters.currency], ['المعتمد للصرف', summary.approved, filters.currency], ['بانتظار الاعتماد', summary.pending, filters.currency], ['عدد المعاملات', summary.transactions, `${summary.lines} بند`], ['متوسط المعاملة', summary.average, filters.currency], ['تغطية المرفقات', summary.invoiceCoverage, '%'],
      ].map(([label, value, unit, accent], index) => <article className={`card fa-kpi ${accent || ''}`} key={index}><span>{label}</span><strong><bdi>{money(value)}</bdi><small>{unit}</small></strong></article>)}</section>
      <section className="fa-insights"><article className="card"><h3>الأكثر صرفًا: {dimensions[dimension][0]}</h3><strong>{top?.label || 'لا توجد مبالغ'}</strong><p className="fa-muted">{top ? `${money(top.amount)} ${filters.currency} · ${top.share}% من الإجمالي` : 'جرّب فترة أو أساس تحليل مختلفًا.'}</p></article><article className="card"><h3>اكتمال مرفقات الفواتير</h3><strong>{summary.withInvoices} بمرفقات / {summary.withoutInvoices} بدون مرفقات</strong><p className="fa-muted">{summary.attachments} مرفق فريد. وجود مرفق لا يعني تدقيق محتوى الفاتورة تلقائيًا.</p></article><article className="card"><h3>مقارنة بالفترة السابقة</h3><strong>{summary.comparison ? summary.comparison.change == null ? 'لا يوجد أساس للمقارنة' : `${summary.comparison.change > 0 ? '+' : ''}${summary.comparison.change}%` : 'حدد تاريخ البداية والنهاية'}</strong><p className="fa-muted">{summary.comparison ? `${summary.comparison.from} — ${summary.comparison.to} · ${money(summary.comparison.amount)} ${filters.currency}` : 'تُقارن بفترة سابقة مساوية في المدة وبالفلاتر نفسها.'}</p></article></section>
      <section className="card"><div className="fa-section-head"><div><h3>توزيع الإنفاق</h3><p className="fa-muted">اضغط على أي نتيجة لتصفية التحليل حسبها.</p></div><div className="fa-actions"><select aria-label="تجميع التحليل" value={dimension} onChange={(event) => setDimension(event.target.value)}>{Object.entries(dimensions).map(([value, [label]]) => <option value={value} key={value}>{label}</option>)}</select><div className="fa-switch" aria-label="نمط رسم التوزيع">{[['bars', 'أشرطة'], ['donut', 'دائري']].map(([value, label]) => <button key={value} className="btn btn-soft" aria-pressed={chart === value} onClick={() => setChart(value)}>{label}</button>)}</div></div></div><Ranking entries={entries} mode={chart} onSelect={(key) => apply({ [dimensions[dimension][1]]: key })} /></section>
      <section className="card"><div className="fa-section-head"><div><h3>اتجاه الصرف عبر الزمن</h3><p className="fa-muted">حسب تاريخ المعاملة بتوقيت بغداد · {basisLabels[filters.basis]}</p></div><div className="fa-actions"><select aria-label="فترة الرسم" value={filters.period} onChange={(event) => apply({ period: event.target.value })}><option value="month">شهري</option><option value="day">يومي</option></select><div className="fa-switch">{[['line', 'خطي'], ['bars', 'أعمدة']].map(([value, label]) => <button key={value} className="btn btn-soft" aria-pressed={trend === value} onClick={() => setTrend(value)}>{label}</button>)}</div></div></div><Trend entries={data.trend} mode={trend} currency={filters.currency} /></section>
      <section className="card"><div className="fa-section-head"><div><h3>تفاصيل الصرف والفواتير</h3><p className="fa-muted">{data.pagination.total} بند مطابق · تُحسب المجاميع من كل النتائج، وليس الصفحة الحالية.</p></div><div className="fa-actions"><select aria-label="ترتيب النتائج" value={filters.sort} onChange={(event) => apply({ sort: event.target.value })}><option value="date-desc">الأحدث أولًا</option><option value="amount-desc">الأعلى مبلغًا</option><option value="amount-asc">الأقل مبلغًا</option></select><div className="fa-switch">{[['table', 'جدول'], ['cards', 'بطاقات']].map(([value, label]) => <button key={value} className="btn btn-soft" aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</div></div></div>
        {!data.rows.length ? <div className="fa-empty">لا توجد معاملات مطابقة للفلاتر الحالية.</div> : view === 'table' ? <div className="fa-table-scroll"><table><thead><tr>{['المعاملة / التاريخ', 'الموظف / المشروع', 'المصروف', 'الحالة', `المبلغ (${filters.currency})`, 'الفواتير'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.id}><td><bdi>{row.transactionNo}</bdi><small><bdi>{row.date}</bdi></small></td><td>{row.employeeName}<small>{row.projectName}</small></td><td>{row.typeLabel}<small>{row.description}</small></td><td>{row.statusLabel}{row.archived ? <small>مؤرشف</small> : null}</td><td><bdi>{money(row.value)}</bdi></td><td><button className="btn btn-soft" onClick={() => setDetail(row)}>تفاصيل ({row.attachments.length})</button></td></tr>)}</tbody></table></div> : <div className="fa-detail-cards">{data.rows.map((row) => <article key={row.id}><div className="fa-section-head"><bdi>{row.transactionNo}</bdi><small>{row.date}</small></div><h4>{row.employeeName}</h4><p>{row.projectName} · {row.typeLabel}</p><p className="fa-muted">{row.description}</p><strong><bdi>{money(row.value)} {filters.currency}</bdi></strong><small>{row.statusLabel}</small><button className="btn btn-soft" onClick={() => setDetail(row)}>تفاصيل الفواتير ({row.attachments.length})</button></article>)}</div>}
        <div className="fa-pagination"><button className="btn btn-soft" disabled={data.pagination.page <= 1} onClick={() => apply({ page: data.pagination.page - 1 })}>السابق</button><span>صفحة {data.pagination.page} من {data.pagination.pages}</span><button className="btn btn-soft" disabled={data.pagination.page >= data.pagination.pages} onClick={() => apply({ page: data.pagination.page + 1 })}>التالي</button></div>
      </section>
      <p className="fa-muted">المبالغ محسوبة لكل بند مرة واحدة. الصرف الفعلي يشمل حالات التسليم والاستلام والإغلاق؛ لا تُجمع العملات معًا. المرفقات قد تكون فواتير أو مستندات مساندة.</p>
    </> : null}
    {detail ? <InvoiceDialog row={detail} currency={filters.currency} onClose={() => setDetail(null)} /> : null}
  </div>;
}

function InvoiceDialog({ row, currency, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} className="fa-dialog" aria-labelledby="fa-invoice-title" onCancel={(event) => { event.preventDefault(); onClose(); }}><div className="fa-section-head"><h3 id="fa-invoice-title">تفاصيل المعاملة والفواتير</h3><button autoFocus className="btn btn-soft" onClick={onClose}>إغلاق</button></div><bdi>{row.transactionNo} / {row.requestNo}</bdi><p>{row.employeeName} · {row.projectName}</p><p>{row.description}</p><dl>{[['المطلوب', row.requested], ['المعتمد', row.approved], ['المصروف فعليًا', row.paid]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd><bdi>{money(value)} {currency}</bdi></dd></div>)}</dl><h4>مرفقات المعاملة ({row.attachments.length})</h4><div className="fa-attachment-list">{row.attachments.map((file) => <a key={file.url} href={assetUrl(file.url)} target="_blank" rel="noopener noreferrer" className="btn btn-soft">{file.name}</a>)}</div>{!row.attachments.length ? <p className="fa-muted">لا توجد مرفقات مسجلة لهذه المعاملة.</p> : null}</dialog>;
}
