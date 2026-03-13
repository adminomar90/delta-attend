'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, assetUrl } from '../../../../../lib/api';
import { authStorage } from '../../../../../lib/auth';
import { Permission, hasPermission } from '../../../../../lib/permissions';
import {
  approvalOperationTypeLabelMap,
  approvalStatusLabelMap,
  formatDate,
  formatDateTime,
  formatPoints,
  permissionLabelMap,
  roleLabelMap,
} from '../../../../../lib/approvalHistory';

const resolveStatusLabel = (value) => approvalStatusLabelMap[value] || value || '-';
const resolveRoleLabel = (value) => roleLabelMap[value] || value || '-';
const resolvePermissionLabel = (value) => permissionLabelMap[value] || value || '-';

export default function ApprovalHistoryDetailPage() {
  const params = useParams();
  const currentUser = authStorage.getUser();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canAccess = useMemo(
    () => hasPermission(currentUser, Permission.VIEW_APPROVAL_HISTORY),
    [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions],
  );

  const load = async () => {
    if (!canAccess) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.get(`/approval-history/${params.operationType}/${params.recordId}`);
      setRecord(response.record || null);
    } catch (err) {
      setError(err.message || 'تعذر تحميل تفاصيل سجل الاعتماد');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [canAccess, params.operationType, params.recordId]);

  if (!canAccess) {
    return (
      <section className="card section" style={{ color: 'var(--text-soft)' }}>
        لا تملك صلاحية الوصول إلى تفاصيل سجل الاعتماد.
      </section>
    );
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}

      <section className="card section" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <h2 style={{ margin: 0 }}>تفاصيل سجل الاعتماد</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
              عرض كامل للبيانات، مسار الاعتماد، والمرفقات المرتبطة بالعملية.
            </p>
          </div>
          <div className="action-row">
            <Link href="/approval-history" className="btn btn-soft">العودة إلى السجل</Link>
            <button type="button" className="btn btn-soft" onClick={load} disabled={loading}>
              {loading ? 'جارٍ التحديث...' : 'تحديث'}
            </button>
          </div>
        </div>
      </section>

      {loading && !record ? (
        <section className="card section" style={{ color: 'var(--text-soft)' }}>
          جارٍ تحميل تفاصيل الاعتماد...
        </section>
      ) : null}

      {record ? (
        <>
          <section className="card section" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>{record.operationNumber}</div>
                <h2 style={{ margin: '6px 0 0' }}>{record.title}</h2>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span className="status-pill status-approved">{resolveStatusLabel(record.approvalStatus)}</span>
                <span className="badge">{approvalOperationTypeLabelMap[record.operationType] || record.operationTypeLabel}</span>
              </div>
            </div>

            <div className="grid-3" style={{ marginTop: 16 }}>
              <label>
                رقم العملية
                <input className="input" value={record.operationNumber || '-'} disabled />
              </label>
              <label>
                الحالة الحالية
                <input className="input" value={resolveStatusLabel(record.rawStatus)} disabled />
              </label>
              <label>
                النقاط
                <input className="input" value={formatPoints(record.points)} disabled />
              </label>
              <label>
                أنشأ العملية
                <input className="input" value={record.createdByName || '-'} disabled />
              </label>
              <label>
                الموظف
                <input className="input" value={record.employeeName || '-'} disabled />
              </label>
              <label>
                المشروع / القسم
                <input className="input" value={record.relatedProjectOrDepartment || '-'} disabled />
              </label>
              <label>
                المعتمد النهائي
                <input className="input" value={record.approverName || '-'} disabled />
              </label>
              <label>
                دور المعتمد
                <input className="input" value={resolveRoleLabel(record.approverRole)} disabled />
              </label>
              <label>
                صلاحية الاعتماد
                <input className="input" value={resolvePermissionLabel(record.approverPermission)} disabled />
              </label>
              <label>
                تاريخ الإنشاء
                <input className="input" value={formatDateTime(record.createdAt)} disabled />
              </label>
              <label>
                تاريخ الاعتماد
                <input className="input" value={formatDateTime(record.approvedAt)} disabled />
              </label>
              <label>
                تاريخ الاعتماد المختصر
                <input className="input" value={formatDate(record.approvedAt)} disabled />
              </label>
            </div>

            {record.notes ? (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ marginBottom: 8 }}>ملاحظات</h3>
                <div style={{ color: 'var(--text-soft)', lineHeight: 1.8 }}>{record.notes}</div>
              </div>
            ) : null}
          </section>

          <section className="card section" style={{ marginBottom: 16 }}>
            <h2>تسلسل الاعتماد</h2>
            {(record.approvalSteps || []).length ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                {record.approvalSteps.map((step) => (
                  <article
                    key={`${step.sequence}-${step.approverId || step.approvedAt || step.approverName}`}
                    className="card"
                    style={{ padding: 14, background: 'rgba(19, 35, 63, 0.72)' }}
                  >
                    <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>المرحلة {step.sequence}</div>
                    <h3 style={{ margin: '6px 0 0' }}>{step.approverName || '-'}</h3>
                    <div style={{ color: 'var(--text-soft)', fontSize: 13, marginTop: 8, lineHeight: 1.8 }}>
                      <div>الدور: {resolveRoleLabel(step.approverRole)}</div>
                      <div>الصلاحية: {resolvePermissionLabel(step.approverPermission)}</div>
                      <div>الحالة: {resolveStatusLabel(step.status)}</div>
                      <div>الوقت: {formatDateTime(step.approvedAt)}</div>
                    </div>
                    {step.note ? (
                      <div style={{ marginTop: 10, color: 'var(--text-soft)', lineHeight: 1.7 }}>
                        <strong style={{ color: 'var(--text)' }}>ملاحظة:</strong> {step.note}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-soft)', margin: 0 }}>لا توجد خطوات اعتماد مسجلة.</p>
            )}
          </section>

          <section className="card section" style={{ marginBottom: 16 }}>
            <h2>تفاصيل العملية</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 14,
              }}
            >
              {(record.detailSections || []).map((section) => (
                <article key={section.title} className="card" style={{ padding: 14, background: 'rgba(19, 35, 63, 0.72)' }}>
                  <h3 style={{ marginTop: 0 }}>{section.title}</h3>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {section.items.map((item) => (
                      <div key={`${section.title}-${item.label}`}>
                        <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>{item.label}</div>
                        <div style={{ lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          {(record.attachments || []).length ? (
            <section className="card section">
              <h2>المرفقات</h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 14,
                }}
              >
                {(record.attachments || []).map((attachment, index) => {
                  const url = assetUrl(attachment.url);
                  const isImage = attachment.type === 'image';
                  return (
                    <article
                      key={`${attachment.type}-${attachment.url}-${index}`}
                      className="card"
                      style={{ padding: 14, background: 'rgba(19, 35, 63, 0.72)' }}
                    >
                      {isImage ? (
                        <img
                          src={url}
                          alt={attachment.label || `attachment-${index + 1}`}
                          style={{
                            width: '100%',
                            height: 150,
                            objectFit: 'cover',
                            borderRadius: 12,
                            border: '1px solid var(--border)',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            display: 'grid',
                            placeItems: 'center',
                            height: 150,
                            borderRadius: 12,
                            border: '1px solid var(--border)',
                            background: 'rgba(13, 24, 46, 0.85)',
                            fontWeight: 700,
                          }}
                        >
                          PDF
                        </div>
                      )}
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 700 }}>{attachment.label || 'مرفق'}</div>
                        <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>{attachment.downloadName || '-'}</div>
                      </div>
                      <div className="form-actions" style={{ marginTop: 12 }}>
                        <a className="btn btn-soft" href={url} target="_blank" rel="noreferrer">
                          عرض
                        </a>
                        <a className="btn btn-soft" href={url} download={attachment.downloadName || undefined}>
                          تحميل
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
