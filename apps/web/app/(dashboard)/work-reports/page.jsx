'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';

const statusLabelMap = {
  SUBMITTED: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};

const statusClassMap = {
  SUBMITTED: 'status-submitted',
  APPROVED: 'status-approved',
  REJECTED: 'status-rejected',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const defaultForm = {
  projectId: '',
  activityType: '',
  title: '',
  details: '',
  progressPercent: 0,
  hoursSpent: 0,
  workDate: todayIso(),
  accomplishments: '',
  challenges: '',
  nextSteps: '',
};

const resolveUploadUrl = (value) => {
  return assetUrl(String(value || '').trim());
};

const formatDate = (value) => {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleDateString('ar-IQ');
};

const makeAttachmentId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

export default function WorkReportsPage() {
  const currentUser = authStorage.getUser();
  const [projects, setProjects] = useState([]);
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [attachments, setAttachments] = useState([]);
  const [approvalForm, setApprovalForm] = useState({
    reportId: '',
    points: '',
    managerComment: '',
  });
  const [rejectionForm, setRejectionForm] = useState({
    reportId: '',
    reason: '',
    managerComment: '',
  });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const attachmentsRef = useRef([]);

  const canApprove = useMemo(() => {
    return hasPermission(currentUser, Permission.APPROVE_TASKS);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const projectOptions = useMemo(() => {
    return (projects || []).filter((project) => project.status !== 'REJECTED');
  }, [projects]);

  const clearAttachments = () => {
    attachmentsRef.current.forEach((item) => {
      if (item.previewUrl) {
        window.URL.revokeObjectURL(item.previewUrl);
      }
    });
    attachmentsRef.current = [];
    setAttachments([]);
  };

  const resetForm = () => {
    setForm({
      ...defaultForm,
      workDate: todayIso(),
    });
    clearAttachments();
  };

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const [projectsRes, reportsRes] = await Promise.all([
        api.get('/projects'),
        api.get('/work-reports'),
      ]);
      setProjects(projectsRes.projects || []);
      setReports(reportsRes.reports || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل تقارير العمل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    load();
    return () => {
      attachmentsRef.current.forEach((item) => {
        if (item.previewUrl) {
          window.URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

  const addAttachments = (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      return;
    }

    setAttachments((prev) => {
      const remaining = Math.max(0, 10 - prev.length);
      const selected = files.slice(0, remaining).map((file) => ({
        id: makeAttachmentId(),
        file,
        comment: '',
        previewUrl: window.URL.createObjectURL(file),
      }));
      return [...prev, ...selected];
    });
  };

  const updateAttachmentComment = (id, comment) => {
    setAttachments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, comment } : item)),
    );
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        window.URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const submitReport = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setInfo('');

    try {
      const payload = new FormData();
      payload.append('projectId', form.projectId);
      payload.append('activityType', form.activityType);
      payload.append('title', form.title);
      payload.append('details', form.details);
      payload.append('progressPercent', String(form.progressPercent));
      payload.append('hoursSpent', String(form.hoursSpent));
      payload.append('workDate', form.workDate);
      payload.append('accomplishments', form.accomplishments);
      payload.append('challenges', form.challenges);
      payload.append('nextSteps', form.nextSteps);

      attachments.forEach((item) => {
        payload.append('images', item.file);
      });
      payload.append('imageComments', JSON.stringify(attachments.map((item) => item.comment || '')));

      await api.post('/work-reports', payload);
      setInfo('تم إنشاء تقرير العمل بنجاح وإرساله للاعتماد.');
      resetForm();
      await load();
    } catch (err) {
      setError(err.message || 'فشل إنشاء تقرير العمل');
    } finally {
      setSaving(false);
    }
  };

  const startApproval = (report) => {
    setApprovalForm({
      reportId: report._id,
      points: '',
      managerComment: '',
    });
    setRejectionForm({
      reportId: '',
      reason: '',
      managerComment: '',
    });
  };

  const submitApproval = async (event) => {
    event.preventDefault();
    setApproving(true);
    setError('');
    setInfo('');

    try {
      await api.patch(`/work-reports/${approvalForm.reportId}/approve`, {
        points: Number(approvalForm.points),
        managerComment: approvalForm.managerComment,
      });

      setInfo('تم اعتماد التقرير وإضافة النقاط بنجاح.');
      setApprovalForm({
        reportId: '',
        points: '',
        managerComment: '',
      });
      await load();
    } catch (err) {
      setError(err.message || 'فشل اعتماد تقرير العمل');
    } finally {
      setApproving(false);
    }
  };

  const startRejection = (report) => {
    setRejectionForm({
      reportId: report._id,
      reason: '',
      managerComment: '',
    });
    setApprovalForm({
      reportId: '',
      points: '',
      managerComment: '',
    });
  };

  const submitRejection = async (event) => {
    event.preventDefault();
    setRejecting(true);
    setError('');
    setInfo('');

    try {
      await api.patch(`/work-reports/${rejectionForm.reportId}/reject`, {
        reason: rejectionForm.reason,
        managerComment: rejectionForm.managerComment,
      });

      setInfo('تم رفض التقرير وإرسال الملاحظة للموظف.');
      setRejectionForm({
        reportId: '',
        reason: '',
        managerComment: '',
      });
      await load();
    } catch (err) {
      setError(err.message || 'فشل رفض التقرير');
    } finally {
      setRejecting(false);
    }
  };

  const openReportPdf = async (report) => {
    setError('');
    try {
      const blob = await api.get(`/work-reports/${report._id}/pdf`);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 30000);
    } catch (err) {
      setError(err.message || 'تعذر فتح PDF للتقرير');
    }
  };

  const downloadReportPdf = async (report) => {
    setError('');
    try {
      const blob = await api.get(`/work-reports/${report._id}/pdf`);
      const label = (report.employeeCode || report.user?.employeeCode || 'employee').replace(/[^\w-]/g, '');
      const fileName = `work-report-${label}-${String(report._id).slice(-6)}.pdf`;
      downloadBlob(blob, fileName);
      setInfo('تم حفظ ملف PDF للتقرير.');
    } catch (err) {
      setError(err.message || 'تعذر حفظ PDF للتقرير');
    }
  };

  const sendReportPdfToWhatsApp = async (report) => {
    setError('');
    setInfo('');

    try {
      const response = await api.post(`/work-reports/${report._id}/whatsapp-link`, {});
      const whatsappUrl = response?.whatsapp?.url || '';
      if (!whatsappUrl) {
        setError('تعذر تجهيز رابط واتساب للتقرير');
        return;
      }

      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      setInfo('تم فتح واتساب بنفس نمط بصمة الدخول/الخروج لإرسال تقرير PDF من الحساب المفتوح على الجهاز.');
    } catch (err) {
      setError(err.message || 'تعذر إرسال التقرير PDF عبر واتساب');
    }
  };

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: '#9bc8ff' }}>{info}</section> : null}

      <section className="card section" style={{ marginBottom: 16 }}>
        <h2>إنشاء تقرير عمل</h2>
        <form className="grid-3" onSubmit={submitReport}>
          <label>
            اسم الموظف
            <input className="input" value={currentUser?.fullName || '-'} disabled />
          </label>
          <label>
            رقم الموظف
            <input className="input" value={currentUser?.employeeCode || 'غير محدد'} disabled />
          </label>
          <label>
            المشروع (نوع العمل)
            <select
              className="select"
              value={form.projectId}
              onChange={(e) => setForm((prev) => ({ ...prev, projectId: e.target.value }))}
              required
            >
              <option value="">اختر المشروع</option>
              {projectOptions.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name} - {project.code}
                </option>
              ))}
            </select>
          </label>

          <label>
            نوع النشاط
            <input
              className="input"
              value={form.activityType}
              onChange={(e) => setForm((prev) => ({ ...prev, activityType: e.target.value }))}
              placeholder="مثال: تركيب، فحص، صيانة"
            />
          </label>
          <label>
            عنوان التقرير
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="ملخص قصير للعمل المنجز"
            />
          </label>
          <label>
            تاريخ العمل
            <input
              className="input"
              type="date"
              value={form.workDate}
              onChange={(e) => setForm((prev) => ({ ...prev, workDate: e.target.value }))}
            />
          </label>

          <label>
            نسبة الإنجاز (%)
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={form.progressPercent}
              onChange={(e) => setForm((prev) => ({ ...prev, progressPercent: e.target.value }))}
              required
            />
          </label>
          <label>
            عدد ساعات العمل
            <input
              className="input"
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={form.hoursSpent}
              onChange={(e) => setForm((prev) => ({ ...prev, hoursSpent: e.target.value }))}
            />
          </label>
          <div style={{ alignSelf: 'end' }}>
            <button className="btn btn-soft" type="button" onClick={resetForm}>
              إعادة تعيين
            </button>
          </div>

          <label style={{ gridColumn: 'span 3' }}>
            تفاصيل العمل
            <textarea
              className="textarea"
              rows={3}
              value={form.details}
              onChange={(e) => setForm((prev) => ({ ...prev, details: e.target.value }))}
              required
            />
          </label>
          <label style={{ gridColumn: 'span 3' }}>
            ما تم إنجازه
            <textarea
              className="textarea"
              rows={2}
              value={form.accomplishments}
              onChange={(e) => setForm((prev) => ({ ...prev, accomplishments: e.target.value }))}
            />
          </label>
          <label style={{ gridColumn: 'span 3' }}>
            التحديات والمشاكل
            <textarea
              className="textarea"
              rows={2}
              value={form.challenges}
              onChange={(e) => setForm((prev) => ({ ...prev, challenges: e.target.value }))}
            />
          </label>
          <label style={{ gridColumn: 'span 3' }}>
            الخطوات القادمة
            <textarea
              className="textarea"
              rows={2}
              value={form.nextSteps}
              onChange={(e) => setForm((prev) => ({ ...prev, nextSteps: e.target.value }))}
            />
          </label>

          <div style={{ gridColumn: 'span 3' }}>
            <h3 style={{ margin: '0 0 8px' }}>صور الأعمال (حتى 10 صور)</h3>
            <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>
              يمكنك فتح كاميرا الموبايل مباشرة أو اختيار صور موجودة في الجهاز.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <label className="btn btn-soft" style={{ cursor: 'pointer' }}>
                فتح الكاميرا مباشرة
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    addAttachments(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <label className="btn btn-soft" style={{ cursor: 'pointer' }}>
                رفع من ملفات الجهاز
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    addAttachments(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {attachments.length ? (
              <div className="grid-3" style={{ gap: 10 }}>
                {attachments.map((item) => (
                  <article
                    key={item.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 10,
                      background: '#0e1a34',
                    }}
                  >
                    <img
                      src={item.previewUrl}
                      alt="attachment preview"
                      style={{
                        width: '100%',
                        height: 140,
                        objectFit: 'cover',
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    />
                    <input
                      className="input"
                      placeholder="تعليق على الصورة"
                      value={item.comment}
                      onChange={(e) => updateAttachmentComment(item.id, e.target.value)}
                    />
                    <button
                      className="btn btn-soft"
                      type="button"
                      style={{ marginTop: 8 }}
                      onClick={() => removeAttachment(item.id)}
                    >
                      حذف الصورة
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-soft)' }}>لم يتم إضافة صور بعد.</p>
            )}
          </div>

          <div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'جارٍ إرسال التقرير...' : 'إرسال التقرير للاعتماد'}
            </button>
          </div>
        </form>
      </section>

      {approvalForm.reportId ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>اعتماد تقرير العمل</h2>
          <form className="grid-3" onSubmit={submitApproval}>
            <label>
              النقاط الممنوحة (إلزامي)
              <input
                className="input"
                type="number"
                min={1}
                max={1000}
                value={approvalForm.points}
                onChange={(e) => setApprovalForm((prev) => ({ ...prev, points: e.target.value }))}
                required
              />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              تعليق المدير
              <input
                className="input"
                value={approvalForm.managerComment}
                onChange={(e) => setApprovalForm((prev) => ({ ...prev, managerComment: e.target.value }))}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, alignSelf: 'end' }}>
              <button className="btn btn-primary" type="submit" disabled={approving}>
                {approving ? 'جارٍ الاعتماد...' : 'تأكيد الاعتماد'}
              </button>
              <button
                className="btn btn-soft"
                type="button"
                onClick={() => setApprovalForm({ reportId: '', points: '', managerComment: '' })}
                disabled={approving}
              >
                إلغاء
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {rejectionForm.reportId ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>رفض تقرير العمل</h2>
          <form className="grid-3" onSubmit={submitRejection}>
            <label>
              سبب الرفض (إلزامي)
              <input
                className="input"
                value={rejectionForm.reason}
                onChange={(e) => setRejectionForm((prev) => ({ ...prev, reason: e.target.value }))}
                required
              />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              تعليق إضافي
              <input
                className="input"
                value={rejectionForm.managerComment}
                onChange={(e) => setRejectionForm((prev) => ({ ...prev, managerComment: e.target.value }))}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, alignSelf: 'end' }}>
              <button className="btn btn-primary" type="submit" disabled={rejecting}>
                {rejecting ? 'جارٍ الرفض...' : 'تأكيد الرفض'}
              </button>
              <button
                className="btn btn-soft"
                type="button"
                onClick={() => setRejectionForm({ reportId: '', reason: '', managerComment: '' })}
                disabled={rejecting}
              >
                إلغاء
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card section">
        <h2>سجل تقارير العمل</h2>
        {loading ? <p style={{ color: 'var(--text-soft)' }}>جارٍ تحميل التقارير...</p> : null}

        {!loading ? (
          <table className="table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>المشروع</th>
                <th>التاريخ</th>
                <th>الإنجاز</th>
                <th>الحالة</th>
                <th>النقاط</th>
                <th>التفاصيل/الصور</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {reports.length ? reports.map((report) => {
                const userId = String(report.user?._id || report.user?.id || '');
                const isOwnReport = userId === String(currentUser?.id || '');
                const canModerate = canApprove && !isOwnReport && report.status === 'SUBMITTED';

                return (
                  <tr key={report._id}>
                    <td>
                      <strong>{report.employeeName || report.user?.fullName || '-'}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                        الرمز: {report.employeeCode || report.user?.employeeCode || '-'}
                      </div>
                    </td>
                    <td>{report.project?.name || report.projectName || '-'}</td>
                    <td>{formatDate(report.workDate || report.createdAt)}</td>
                    <td>{report.progressPercent || 0}%</td>
                    <td>
                      <span className={`status-pill ${statusClassMap[report.status] || 'status-todo'}`}>
                        {statusLabelMap[report.status] || report.status}
                      </span>
                      {report.rejectionReason ? (
                        <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>
                          سبب الرفض: {report.rejectionReason}
                        </div>
                      ) : null}
                    </td>
                    <td>{report.pointsAwarded || 0}</td>
                    <td style={{ minWidth: 260 }}>
                      {report.title ? <div><strong>{report.title}</strong></div> : null}
                      <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>{report.details || '-'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                        ساعات العمل: {report.hoursSpent || 0}
                      </div>
                      {(report.images || []).length ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {(report.images || []).map((image, index) => (
                            <a
                              key={`${report._id}-img-${index}`}
                              href={resolveUploadUrl(image.publicUrl)}
                              target="_blank"
                              rel="noreferrer"
                              title={image.comment || 'فتح الصورة'}
                            >
                              <img
                                src={resolveUploadUrl(image.publicUrl)}
                                alt={`work-report-${index + 1}`}
                                style={{
                                  width: 46,
                                  height: 46,
                                  objectFit: 'cover',
                                  borderRadius: 8,
                                  border: '1px solid var(--border)',
                                }}
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button className="btn btn-soft" type="button" onClick={() => openReportPdf(report)}>
                          عرض PDF
                        </button>
                        <button className="btn btn-soft" type="button" onClick={() => downloadReportPdf(report)}>
                          حفظ PDF
                        </button>
                        <button className="btn btn-soft" type="button" onClick={() => sendReportPdfToWhatsApp(report)}>
                          واتساب PDF
                        </button>
                      </div>
                      {canModerate ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                          <button className="btn btn-soft" type="button" onClick={() => startApproval(report)}>
                            اعتماد ومنح نقاط
                          </button>
                          <button className="btn btn-soft" type="button" onClick={() => startRejection(report)}>
                            رفض
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--text-soft)' }}>لا توجد تقارير عمل حالياً.</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : null}
      </section>
    </>
  );
}
