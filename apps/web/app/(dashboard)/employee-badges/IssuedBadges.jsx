'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { formatBadgeDate } from '../../../lib/employeeBadgeCard.mjs';

const labels = {
  active: 'سارية',
  stopped: 'موقوفة',
  employeeInactive: 'حساب الموظف غير مفعّل',
  pending: 'لم تبدأ صلاحيتها',
  expired: 'منتهية',
};

export default function IssuedBadges({ onEdit }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let live = true;
    api.get(`/employee-badges?page=${page}`).then((response) => {
      if (live) setData(response);
    }).catch((err) => {
      if (live) setError(err.message);
    });
    return () => { live = false; };
  }, [page]);

  function changePage(next) {
    setError('');
    setData(null);
    setPage(next);
  }

  async function act(record, action) {
    if (pending) return;
    if (action === 'delete' && !window.confirm(`حذف هوية ${record.employee.fullName}؟ سيتوقف رمز التحقق عن العمل.`)) return;
    setPending(true);
    setError('');
    setSuccess('');
    const path = `/employee-badges/${record.id}`;
    try {
      if (action === 'edit') {
        const { badge } = await api.get(path);
        if (mounted.current) onEdit(badge);
        return;
      }
      if (action === 'delete') {
        await api.delete(path, { revision: record.revision });
        setSuccess('تم حذف الهوية.');
      } else {
        await api.patch(`${path}/status`, { active: !record.active, revision: record.revision });
        setSuccess(record.active ? 'تم إيقاف تفعيل الهوية.' : 'تمت إعادة تفعيل الهوية.');
      }
      const refreshed = await api.get(`/employee-badges?page=${page}`);
      if (!refreshed.badges.length && page > 1) {
        setData(null);
        setPage(page - 1);
      }
      else setData(refreshed);
    } catch (err) {
      setError(err.message);
      // A concurrent change may have updated or removed this row.
      if (action !== 'edit') {
        await api.get(`/employee-badges?page=${page}`).then(setData).catch(() => {});
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card badge-history" aria-labelledby="badge-history-title">
      <h2 id="badge-history-title">الهويات الصادرة</h2>
      {error && <p className="badge-error" role="alert">{error}</p>}
      {success && <p className="badge-success" role="status">{success}</p>}
      {!data && !error && <p role="status">جارٍ تحميل الهويات…</p>}
      {data?.badges.length === 0 && <p>لا توجد هويات صادرة.</p>}
      {data?.badges.length > 0 && (
        <div className="badge-history-table">
          <table>
            <thead><tr>
              <th scope="col">الموظف</th><th scope="col">القالب</th><th scope="col">الإصدار</th>
              <th scope="col">الانتهاء</th><th scope="col">الحالة</th><th scope="col">الإجراءات</th>
            </tr></thead>
            <tbody>
              {data.badges.map((badge) => (
                <tr key={badge.id}>
                  <th scope="row">{badge.employee.fullName}<small><bdi>{badge.employee.employeeCode}</bdi></small></th>
                  <td>{badge.template.title}</td>
                  <td><bdi>{formatBadgeDate(badge.issuedOn)}</bdi></td>
                  <td><bdi>{formatBadgeDate(badge.expiresOn)}</bdi></td>
                  <td><span className={`badge-record-status ${badge.status}`}>{labels[badge.status]}</span></td>
                  <td>
                    <div className="badge-actions">
                      <button className="btn btn-soft btn-sm" type="button" disabled={pending} onClick={() => act(badge, 'edit')}>تعديل</button>
                      <button className="btn btn-soft btn-sm" type="button" disabled={pending} onClick={() => act(badge, 'status')}>
                        {badge.active ? 'إيقاف التفعيل' : 'إعادة التفعيل'}
                      </button>
                      <button className="btn btn-danger btn-sm" type="button" disabled={pending} onClick={() => act(badge, 'delete')}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(page > 1 || data?.hasMore) && <nav className="badge-actions badge-page-controls" aria-label="صفحات الهويات الصادرة">
        <button className="btn btn-soft btn-sm" type="button" disabled={pending || page === 1} onClick={() => changePage(page - 1)}>السابق</button>
        <span>صفحة {page}</span>
        <button className="btn btn-soft btn-sm" type="button" disabled={pending || !data?.hasMore} onClick={() => changePage(page + 1)}>التالي</button>
      </nav>}
    </section>
  );
}
