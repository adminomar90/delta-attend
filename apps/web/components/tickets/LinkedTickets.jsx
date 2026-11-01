'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { statuses, date } from './common';
export default function LinkedTickets({ customer, day, team = false }) {
  const [rows, setRows] = useState([]), [error, setError] = useState('');
  useEffect(() => {
    const query = new URLSearchParams({ ...(customer ? { customer } : { view: team ? 'team' : 'mine', ...(day ? { from: day, to: `${day}T23:59:59` } : {}) }), limit: '100' });
    api.get(`/tasks?${query}`).then((r) => setRows(r.tasks)).catch((e) => setError(e.message));
  }, [customer, day, team]);
  return <section className="card section" style={{ marginTop: 16 }}><h3>{customer ? 'سجل التذاكر حسب الزبون والفرع' : 'التكليفات وزيارات التذاكر المرتبطة باليوم'}</h3>{error && <p role="alert">{error}</p>}{!rows.length && !error && <p>لا توجد تذاكر ضمن نطاق العرض.</p>}<div style={{ display: 'grid', gap: 10 }}>{rows.map((t) => <a className="btn btn-soft" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }} key={t._id} href={`/tasks?ticket=${t._id}`}><b>{t.ticketNumber || 'مهمة سابقة'} — {t.title}</b><span>{t.branch} · {statuses[t.status]} · {t.assignee?.fullName} · {date(t.dueDate)}</span></a>)}</div><p style={{ color: 'var(--text-soft)', fontSize: 12 }}>هذه نفس سجلات التذاكر؛ التحديث والتسليم من صفحة التذكرة المرتبطة.</p></section>;
}
