'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';
import {
  approvalOperationTypeLabelMap,
  approvalOperationTypeOptions,
  approvalStatusLabelMap,
  buildApprovalHistoryQuery,
  downloadBlob,
  formatDateTime,
  formatPoints,
  permissionLabelMap,
  roleLabelMap,
} from '../../../lib/approvalHistory';

const initialFilters = {
  query: '',
  operationType: '',
  employeeName: '',
  approverName: '',
  projectOrDepartment: '',
  status: '',
  createdFrom: '',
  createdTo: '',
  approvedFrom: '',
  approvedTo: '',
  timeFrom: '',
  timeTo: '',
  minPoints: '',
  maxPoints: '',
};

const resolveStatusLabel = (value) => approvalStatusLabelMap[value] || value || '-';
const resolveRoleLabel = (value) => roleLabelMap[value] || value || '-';
const resolvePermissionLabel = (value) => permissionLabelMap[value] || value || '-';

export default function ApprovalHistoryPage() {
  const currentUser = authStorage.getUser();
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const canAccess = useMemo(
    () => hasPermission(currentUser, Permission.VIEW_APPROVAL_HISTORY),
    [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions],
  );
  const canExport = useMemo(
    () => hasPermission(currentUser, Permission.EXPORT_APPROVAL_HISTORY),
    [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions],
  );

  const load = async (nextFilters = appliedFilters) => {
    if (!canAccess) {
      setRecords([]);
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');

    try {
      const response = await api.get(`/approval-history${buildApprovalHistoryQuery(nextFilters)}`);
      setRecords(response.records || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل سجل الاعتمادات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(initialFilters);
  }, [canAccess]);

  const totals = useMemo(() => {
    const totalPoints = records.reduce((sum, record) => sum + Number(record.points || 0), 0);
    const byType = records.reduce((acc, record) => {
      acc[record.operationType] = (acc[record.operationType] || 0) + 1;
      return acc;
    }, {});

    return {
      totalRecords: records.length,
      totalPoints,
      operationTypes: Object.keys(byType).length,
    };
  }, [records]);

  const statusOptions = useMemo(() => {
    const seen = new Set(['APPROVED']);
    records.forEach((record) => {
      if (record.rawStatus) {
        seen.add(record.rawStatus);
      }
    });

    return ['', ...Array.from(seen)];
  }, [records]);

  const submitFilters = async (event) => {
    event.preventDefault();
    setAppliedFilters(filters);
    await load(filters);
  };

  const resetFilters = async () => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    await load(initialFilters);
  };

  const exportHistory = async (kind) => {
    setError('');
    setInfo('');
    setExporting(kind);

    try {
      const blob = await api.get(`/approval-history/export/${kind}${buildApprovalHistoryQuery(appliedFilters)}`);
      const extension = kind === 'excel' ? 'xlsx' : 'pdf';
      downloadBlob(blob, `approval-history-${Date.now()}.${extension}`);
      setInfo(kind === 'excel' ? 'تم تصدير ملف Excel.' : 'تم تصدير ملف PDF.');
    } catch (err) {
      setError(err.message || 'تعذر تصدير سجل الاعتمادات');
    } finally {
      setExporting('');
    }
  };

  if (!canAccess) {
    return (
      <section className="card section" style={{ color: 'var(--text-soft)' }}>
        لا تملك صلاحية الوصول إلى سجل الاعتمادات.
      </section>
    );
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: '#9bc8ff' }}>{info}</section> : null}

      <section className="grid-3" style={{ marginBottom: 16 }}>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>إجمالي السجلات</p>
          <h2>{totals.totalRecords}</h2>
        </article>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>إجمالي النقاط</p>
          <h2>{formatPoints(totals.totalPoints)}</h2>
        </article>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>أنواع العمليات</p>
          <h2>{totals.operationTypes}</h2>
        </article>
      </section>

      <section className="card section" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <h2 style={{ margin: 0 }}>أرشيف الاعتمادات</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
              يعرض العمليات المعتمدة بالكامل فقط مع تفاصيل المسار والموافقات النهائية.
            </p>
          </div>
          <div className="action-row">
            <button type="button" className="btn btn-soft" onClick={() => load(appliedFilters)} disabled={loading}>
              {loading ? 'جارٍ التحديث...' : 'تحديث'}
            </button>
            {canExport ? (
              <>
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => exportHistory('excel')}
                  disabled={exporting !== ''}
                >
                  {exporting === 'excel' ? 'جارٍ التصدير...' : 'تصدير Excel'}
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => exportHistory('pdf')}
                  disabled={exporting !== ''}
                >
                  {exporting === 'pdf' ? 'جارٍ التصدير...' : 'تصدير PDF'}
                </button>
              </>
            ) : null}
          </div>
        </div>

        <form onSubmit={submitFilters}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <label>
              بحث
              <input
                className="input"
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="رقم، عنوان، تفاصيل..."
              />
            </label>
            <label>
              نوع العملية
              <select
                className="select"
                value={filters.operationType}
                onChange={(event) => setFilters((current) => ({ ...current, operationType: event.target.value }))}
              >
                {approvalOperationTypeOptions.map((option) => (
                  <option key={option.value || 'all-types'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              اسم الموظف
              <input
                className="input"
                value={filters.employeeName}
                onChange={(event) => setFilters((current) => ({ ...current, employeeName: event.target.value }))}
                placeholder="اسم الموظف"
              />
            </label>
            <label>
              اسم المعتمد
              <input
                className="input"
                value={filters.approverName}
                onChange={(event) => setFilters((current) => ({ ...current, approverName: event.target.value }))}
                placeholder="اسم المعتمد"
              />
            </label>
            <label>
              المشروع أو القسم
              <input
                className="input"
                value={filters.projectOrDepartment}
                onChange={(event) => setFilters((current) => ({ ...current, projectOrDepartment: event.target.value }))}
                placeholder="اسم المشروع أو القسم"
              />
            </label>
            <label>
              الحالة
              <select
                className="select"
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              >
                {statusOptions.map((option) => (
                  <option key={option || 'all-statuses'} value={option}>
                    {option ? resolveStatusLabel(option) : 'كل الحالات'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              من تاريخ الإنشاء
              <input
                className="input"
                type="date"
                value={filters.createdFrom}
                onChange={(event) => setFilters((current) => ({ ...current, createdFrom: event.target.value }))}
              />
            </label>
            <label>
              إلى تاريخ الإنشاء
              <input
                className="input"
                type="date"
                value={filters.createdTo}
                onChange={(event) => setFilters((current) => ({ ...current, createdTo: event.target.value }))}
              />
            </label>
            <label>
              من تاريخ الاعتماد
              <input
                className="input"
                type="date"
                value={filters.approvedFrom}
                onChange={(event) => setFilters((current) => ({ ...current, approvedFrom: event.target.value }))}
              />
            </label>
            <label>
              إلى تاريخ الاعتماد
              <input
                className="input"
                type="date"
                value={filters.approvedTo}
                onChange={(event) => setFilters((current) => ({ ...current, approvedTo: event.target.value }))}
              />
            </label>
            <label>
              من وقت الاعتماد
              <input
                className="input"
                type="time"
                value={filters.timeFrom}
                onChange={(event) => setFilters((current) => ({ ...current, timeFrom: event.target.value }))}
              />
            </label>
            <label>
              إلى وقت الاعتماد
              <input
                className="input"
                type="time"
                value={filters.timeTo}
                onChange={(event) => setFilters((current) => ({ ...current, timeTo: event.target.value }))}
              />
            </label>
            <label>
              أقل نقاط
              <input
                className="input"
                type="number"
                min={0}
                value={filters.minPoints}
                onChange={(event) => setFilters((current) => ({ ...current, minPoints: event.target.value }))}
              />
            </label>
            <label>
              أعلى نقاط
              <input
                className="input"
                type="number"
                min={0}
                value={filters.maxPoints}
                onChange={(event) => setFilters((current) => ({ ...current, maxPoints: event.target.value }))}
              />
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: 14 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>تطبيق الفلاتر</button>
            <button type="button" className="btn btn-soft" onClick={resetFilters} disabled={loading}>إعادة تعيين</button>
          </div>
        </form>
      </section>

      <section className="card section">
        {loading ? <p style={{ color: 'var(--text-soft)' }}>جارٍ تحميل السجلات المعتمدة...</p> : null}

        {!loading && !records.length ? (
          <p style={{ color: 'var(--text-soft)', margin: 0 }}>لا توجد سجلات مطابقة للفلاتر الحالية.</p>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {records.map((record) => (
            <article key={`${record.operationType}-${record.recordId}`} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>{record.operationNumber}</div>
                  <h3 style={{ margin: '6px 0 0' }}>{record.title}</h3>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                  <span className="status-pill status-approved">{resolveStatusLabel(record.approvalStatus)}</span>
                  <span className="badge">{approvalOperationTypeLabelMap[record.operationType] || record.operationTypeLabel}</span>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>أنشأ العملية</div>
                  <strong>{record.createdByName || '-'}</strong>
                </div>
                <div>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>الموظف</div>
                  <strong>{record.employeeName || '-'}</strong>
                </div>
                <div>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>المشروع / القسم</div>
                  <strong>{record.relatedProjectOrDepartment || '-'}</strong>
                </div>
                <div>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>النقاط</div>
                  <strong>{formatPoints(record.points)}</strong>
                </div>
              </div>

              <div style={{ marginTop: 14, color: 'var(--text-soft)', fontSize: 13, lineHeight: 1.8 }}>
                <div>المعتمد: {record.approverName || '-'} ({resolveRoleLabel(record.approverRole)})</div>
                <div>صلاحية الاعتماد: {resolvePermissionLabel(record.approverPermission)}</div>
                <div>تاريخ الإنشاء: {formatDateTime(record.createdAt)}</div>
                <div>تاريخ الاعتماد: {formatDateTime(record.approvedAt)}</div>
                <div>الحالة الحالية: {resolveStatusLabel(record.rawStatus)}</div>
              </div>

              {record.notes ? (
                <p style={{ margin: '14px 0 0', color: 'var(--text-soft)', lineHeight: 1.7 }}>
                  <strong style={{ color: 'var(--text)' }}>ملاحظات:</strong> {record.notes}
                </p>
              ) : null}

              <div className="form-actions" style={{ marginTop: 14 }}>
                <Link href={`/approval-history/${record.operationType}/${record.recordId}`} className="btn btn-primary">
                  عرض التفاصيل
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
