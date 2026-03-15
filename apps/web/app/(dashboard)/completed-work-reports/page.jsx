'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';
import { calculateWorkReportDistribution } from '../../../lib/workReportPoints';

const statusLabelMap = {
  APPROVED: 'معتمد',
};

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('ar-IQ');
};

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('ar-IQ');
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

const resolveReportNumber = (report) => `#${String(report?._id || '').slice(-8).toUpperCase()}`;

const formatPoints = (value) => {
  const num = Number(value || 0);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

export default function CompletedWorkReportsPage() {
  const currentUser = authStorage.getUser();
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const canAccess = useMemo(() => {
    return hasPermission(currentUser, Permission.VIEW_COMPLETED_WORK_REPORTS);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canSendWhatsApp = useMemo(() => {
    return hasPermission(currentUser, Permission.SEND_REPORTS_WHATSAPP);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const selectedReport = useMemo(() => {
    return reports.find((report) => report._id === selectedReportId) || reports[0] || null;
  }, [reports, selectedReportId]);

  const load = async () => {
    if (!canAccess) {
      setReports([]);
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');

    try {
      const response = await api.get('/work-reports/completed');
      const nextReports = response.reports || [];
      setReports(nextReports);
      setSelectedReportId((prev) => prev || nextReports[0]?._id || '');
    } catch (err) {
      setError(err.message || 'تعذر تحميل التقارير المنجزة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [canAccess]);

  const openPdf = async (report, { print = false } = {}) => {
    setError('');
    setInfo('');

    try {
      const blob = await api.get(`/work-reports/${report._id}/pdf`);
      const url = window.URL.createObjectURL(blob);
      const popup = window.open(url, '_blank', 'noopener,noreferrer');

      if (!popup) {
        window.URL.revokeObjectURL(url);
        throw new Error('تم حظر فتح نافذة PDF من المتصفح');
      }

      if (print) {
        popup.addEventListener('load', () => {
          popup.focus();
          popup.print();
        }, { once: true });

        setTimeout(() => {
          try {
            popup.focus();
            popup.print();
          } catch {
            // Ignore delayed print errors from popup blockers or browser timing.
          }
        }, 1200);
      }

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60000);
    } catch (err) {
      setError(err.message || 'تعذر فتح ملف PDF');
    }
  };

  const downloadPdf = async (report) => {
    setError('');
    setInfo('');

    try {
      const blob = await api.get(`/work-reports/${report._id}/pdf?download=1`);
      const fallbackName = `work-report-${String(report._id).slice(-6)}.pdf`;
      downloadBlob(blob, report.pdfFile?.filename || fallbackName);
      setInfo('تم تحميل ملف PDF بنجاح.');
    } catch (err) {
      setError(err.message || 'تعذر تحميل ملف PDF');
    }
  };

  const sendToWhatsApp = (report) => {
    const lines = [
      '[ تقرير عمل منجز - Delta Plus ]',
      '----------------------------------',
      `العنوان: ${report.title || 'بدون عنوان'}`,
      `الموظف: ${report.employeeName || report.user?.fullName || '-'}`,
      `المشروع: ${report.project?.name || report.projectName || '-'}`,
      `الحالة: ${statusLabelMap[report.status] || report.status}`,
      '----------------------------------',
      'يرجى مراجعة التقرير.',
      '[ صادر من نظام Delta Plus ]',
    ].join('\n');

    const url = `https://wa.me/?text=${encodeURIComponent(lines)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!canAccess) {
    return (
      <section className="card section" style={{ color: 'var(--text-soft)' }}>
        لا تملك صلاحية عرض التقارير المنجزة.
      </section>
    );
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: '#9bc8ff' }}>{info}</section> : null}

      <section className="card section" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>قائمة التقارير المنجزة</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
              تعرض فقط التقارير المعتمدة نهائيًا مع ملف الـ PDF المحفوظ وقت إنشاء التقرير.
            </p>
          </div>
          <button type="button" className="btn btn-soft" onClick={load} disabled={loading}>
            {loading ? 'جارٍ التحديث...' : 'تحديث'}
          </button>
        </div>
      </section>

      <section className="card section" style={{ marginBottom: 16 }}>
        {loading ? <p style={{ color: 'var(--text-soft)' }}>جارٍ تحميل التقارير المنجزة...</p> : null}

        {!loading ? (
          <table className="table">
            <thead>
              <tr>
                <th>رقم التقرير</th>
                <th>عنوان التقرير</th>
                <th>الموظف</th>
                <th>المشروع</th>
                <th>تاريخ الإنشاء</th>
                <th>تاريخ الاعتماد</th>
                <th>الحالة</th>
                <th>اعتمده</th>
                <th>النقاط</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {reports.length ? reports.map((report) => {
                const isSelected = selectedReport?._id === report._id;

                return (
                  <tr key={report._id} style={isSelected ? { background: 'rgba(77, 145, 255, 0.08)' } : undefined}>
                    <td>{resolveReportNumber(report)}</td>
                    <td>
                      <strong>{report.title || 'بدون عنوان'}</strong>
                    </td>
                    <td>{report.employeeName || report.user?.fullName || '-'}</td>
                    <td>{report.project?.name || report.projectName || '-'}</td>
                    <td>{formatDateTime(report.createdAt)}</td>
                    <td>{formatDateTime(report.approvedAt)}</td>
                    <td>
                      <span className="status-pill status-approved">
                        {statusLabelMap[report.status] || report.status}
                      </span>
                    </td>
                    <td>{report.approvedBy?.fullName || '-'}</td>
                    <td>{formatPoints(report.pointsAwarded)}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button type="button" className="btn btn-soft" onClick={() => setSelectedReportId(report._id)}>
                          تفاصيل
                        </button>
                        <button type="button" className="btn btn-soft" onClick={() => openPdf(report)}>
                          عرض PDF
                        </button>
                        <button type="button" className="btn btn-soft" onClick={() => downloadPdf(report)}>
                          تحميل PDF
                        </button>
                        {canSendWhatsApp ? (
                          <button type="button" className="btn btn-soft" onClick={() => sendToWhatsApp(report)}>
                            واتساب
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={10} style={{ color: 'var(--text-soft)' }}>
                    لا توجد تقارير معتمدة في الأرشيف حالياً.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : null}
      </section>

      {selectedReport ? (
        <section className="card section">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0 }}>
                {selectedReport.title || 'بدون عنوان'} <span style={{ color: 'var(--text-soft)' }}>{resolveReportNumber(selectedReport)}</span>
              </h2>
              <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
                الموظف: {selectedReport.employeeName || selectedReport.user?.fullName || '-'} | المشروع: {selectedReport.project?.name || selectedReport.projectName || '-'}
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="btn btn-soft" onClick={() => openPdf(selectedReport)}>
                عرض PDF
              </button>
              <button type="button" className="btn btn-soft" onClick={() => downloadPdf(selectedReport)}>
                تحميل PDF
              </button>
              <button type="button" className="btn btn-soft" onClick={() => openPdf(selectedReport, { print: true })}>
                طباعة PDF
              </button>
              {canSendWhatsApp ? (
                <button type="button" className="btn btn-soft" onClick={() => sendToWhatsApp(selectedReport)}>
                  إرسال عبر واتساب
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid-3" style={{ marginTop: 16 }}>
            <label>
              رقم التقرير
              <input className="input" value={resolveReportNumber(selectedReport)} disabled />
            </label>
            <label>
              تاريخ الإنشاء
              <input className="input" value={formatDateTime(selectedReport.createdAt)} disabled />
            </label>
            <label>
              تاريخ الاعتماد
              <input className="input" value={formatDateTime(selectedReport.approvedAt)} disabled />
            </label>
            <label>
              الحالة
              <input className="input" value={statusLabelMap[selectedReport.status] || selectedReport.status} disabled />
            </label>
            <label>
              اعتمده
              <input className="input" value={selectedReport.approvedBy?.fullName || '-'} disabled />
            </label>
            <label>
              ملف PDF الجاهز
              <input
                className="input"
                value={selectedReport.pdfFile?.filename || selectedReport.pdfFile?.publicUrl || 'غير متوفر'}
                disabled
              />
            </label>
          </div>

          {/* Points Section */}
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>النقاط</h3>
            <div className="grid-3">
              <label>
                إجمالي النقاط
                <input className="input" value={formatPoints(selectedReport.pointsAwarded)} disabled />
              </label>
              <label>
                نقاط كاتب التقرير
                <input className="input" value={formatPoints(selectedReport.reporterPointsAwarded)} disabled />
              </label>
              <label>
                نقاط كل مشارك
                <input className="input" value={formatPoints(selectedReport.participantPointsAwarded)} disabled />
              </label>
            </div>
          </div>

          {/* Participants Section */}
          {(selectedReport.participants || []).length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>المشاركون ({selectedReport.participants.length})</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {selectedReport.participants.map((participant, index) => (
                  <span
                    key={participant.user || index}
                    className="status-pill"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  >
                    {participant.fullName || 'مشارك'}
                    {participant.employeeCode ? ` (${participant.employeeCode})` : ''}
                  </span>
                ))}
              </div>
              {selectedReport.pointsAwarded > 0 ? (
                <p style={{ color: 'var(--text-soft)', fontSize: 13, marginTop: 8 }}>
                  توزيع النقاط: {formatPoints(selectedReport.reporterPointsAwarded)} للكاتب + {formatPoints(selectedReport.participantPointsAwarded)} لكل مشارك × {selectedReport.participants.length} = {formatPoints(selectedReport.participantsTotalAwarded || 0)} للمشاركين
                </p>
              ) : null}
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>المشاركون</h3>
              <p style={{ color: 'var(--text-soft)' }}>لا يوجد مشاركون في هذا التقرير.</p>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>تفاصيل التقرير</h3>
            <div style={{ color: 'var(--text-soft)', lineHeight: 1.8 }}>{selectedReport.details || '-'}</div>
          </div>

          {selectedReport.accomplishments ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>المنجزات</h3>
              <div style={{ color: 'var(--text-soft)', lineHeight: 1.8 }}>{selectedReport.accomplishments}</div>
            </div>
          ) : null}

          {selectedReport.challenges ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>التحديات</h3>
              <div style={{ color: 'var(--text-soft)', lineHeight: 1.8 }}>{selectedReport.challenges}</div>
            </div>
          ) : null}

          {selectedReport.nextSteps ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>الخطوات القادمة</h3>
              <div style={{ color: 'var(--text-soft)', lineHeight: 1.8 }}>{selectedReport.nextSteps}</div>
            </div>
          ) : null}

          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>الصور المرفقة</h3>
            {(selectedReport.images || []).length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {(selectedReport.images || []).map((image, index) => (
                  <a
                    key={`${selectedReport._id}-image-${index}`}
                    href={assetUrl(image.publicUrl)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      width: 110,
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <img
                      src={assetUrl(image.publicUrl)}
                      alt={`report-image-${index + 1}`}
                      style={{
                        width: '100%',
                        height: 90,
                        objectFit: 'cover',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                      }}
                    />
                    {image.comment ? (
                      <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 6 }}>
                        {image.comment}
                      </div>
                    ) : null}
                  </a>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-soft)' }}>لا توجد صور مرفقة لهذا التقرير.</p>
            )}
          </div>

          <div style={{ marginTop: 16, color: 'var(--text-soft)', fontSize: 13 }}>
            تم إنشاء ملف PDF الأصلي بتاريخ: {formatDate(selectedReport.pdfFile?.generatedAt)}
          </div>
        </section>
      ) : null}
    </>
  );
}
