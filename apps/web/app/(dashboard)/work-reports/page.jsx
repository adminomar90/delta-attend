'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';
import {
  calculateWorkReportDistribution,
  formatWorkReportPoints,
} from '../../../lib/workReportPoints';

/* ── Constants ─────────────────────────────────────────────────────────────── */

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
  participantCount: 0,
  participantIds: [],
};

const defaultFilters = {
  status: '',
  projectId: '',
  dateFrom: '',
  dateTo: '',
  search: '',
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

const resolveUploadUrl = (value) => assetUrl(String(value || '').trim());

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ar-IQ');
};

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('ar-IQ');
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

const resolveReportNumber = (report) => `#${String(report?._id || '').slice(-8).toUpperCase()}`;

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function WorkReportsPage() {
  const currentUser = authStorage.getUser();
  const currentUserId = String(currentUser?.id || currentUser?._id || '');

  /* state */
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [attachments, setAttachments] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [inlineAction, setInlineAction] = useState(null);
  const [approvalPoints, setApprovalPoints] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionComment, setRejectionComment] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const attachmentsRef = useRef([]);

  /* permissions */
  const canApprove = useMemo(() => {
    return hasPermission(currentUser, Permission.APPROVE_TASKS);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canSendWhatsapp = useMemo(() => {
    return hasPermission(currentUser, Permission.SEND_REPORTS_WHATSAPP);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  /* derived data */
  const projectOptions = useMemo(() => {
    return (projects || []).filter((p) => p.status !== 'REJECTED');
  }, [projects]);

  const employeeOptions = useMemo(() => {
    return (employees || []).filter((e) => {
      const eid = String(e.id || e._id || '');
      return eid && eid !== currentUserId;
    });
  }, [employees, currentUserId]);

  const summary = useMemo(() => {
    const s = { total: reports.length, submitted: 0, approved: 0, rejected: 0 };
    for (const r of reports) {
      if (r.status === 'SUBMITTED') s.submitted += 1;
      else if (r.status === 'APPROVED') s.approved += 1;
      else if (r.status === 'REJECTED') s.rejected += 1;
    }
    return s;
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (filters.status && r.status !== filters.status) return false;
      const rProjectId = String(r.project?._id || r.project || '');
      if (filters.projectId && rProjectId !== filters.projectId) return false;
      if (filters.dateFrom) {
        const workDate = r.workDate || r.createdAt;
        if (workDate && new Date(workDate) < new Date(filters.dateFrom)) return false;
      }
      if (filters.dateTo) {
        const workDate = r.workDate || r.createdAt;
        if (workDate && new Date(workDate) > new Date(`${filters.dateTo}T23:59:59`)) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const name = (r.employeeName || r.user?.fullName || '').toLowerCase();
        const title = (r.title || '').toLowerCase();
        if (!name.includes(q) && !title.includes(q)) return false;
      }
      return true;
    });
  }, [reports, filters]);

  const selectedReport = useMemo(() => {
    return reports.find((r) => r._id === selectedReportId) || null;
  }, [reports, selectedReportId]);

  const participantCount = Math.max(0, Number(form.participantCount || 0));
  const participantSlots = Array.from({ length: participantCount }, (_, i) => i);

  const selectedDistribution = useMemo(() => {
    if (!selectedReport) return null;
    return calculateWorkReportDistribution(
      selectedReport.pointsAwarded || 0,
      selectedReport.participantCount || selectedReport.participants?.length || 0,
    );
  }, [selectedReport]);

  const approvalDistribution = useMemo(() => {
    if (!selectedReport || !approvalPoints) return null;
    return calculateWorkReportDistribution(
      approvalPoints,
      selectedReport.participantCount || selectedReport.participants?.length || 0,
    );
  }, [selectedReport, approvalPoints]);

  /* ── Data Loading ────────────────────────────────────────────────────────── */

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [projectsRes, reportsRes, employeesRes] = await Promise.all([
        api.get('/projects'),
        api.get('/work-reports'),
        api.get('/work-reports/employees'),
      ]);
      setProjects(projectsRes.projects || []);
      setReports(reportsRes.reports || []);
      setEmployees(employeesRes.employees || []);
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
        if (item.previewUrl) window.URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  /* ── Attachment Helpers ──────────────────────────────────────────────────── */

  const clearAttachments = () => {
    attachmentsRef.current.forEach((item) => {
      if (item.previewUrl) window.URL.revokeObjectURL(item.previewUrl);
    });
    attachmentsRef.current = [];
    setAttachments([]);
  };

  const resetForm = () => {
    setForm({ ...defaultForm, workDate: todayIso() });
    clearAttachments();
  };

  const addAttachments = (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
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
    setAttachments((prev) => prev.map((item) => (item.id === id ? { ...item, comment } : item)));
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) window.URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  /* ── Participant Helpers ─────────────────────────────────────────────────── */

  const syncParticipantCount = (value) => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
      setForm((prev) => ({ ...prev, participantCount: '', participantIds: [] }));
      return;
    }
    const nextCount = Math.max(0, Math.min(100, Number(rawValue) || 0));
    setForm((prev) => ({
      ...prev,
      participantCount: nextCount,
      participantIds: Array.from({ length: nextCount }, (_, i) => prev.participantIds?.[i] || ''),
    }));
  };

  const updateParticipant = (index, value) => {
    setForm((prev) => {
      const currentCount = Math.max(0, Number(prev.participantCount || 0));
      const nextIds = Array.from({ length: currentCount }, (_, i) => prev.participantIds?.[i] || '');
      nextIds[index] = value;
      return { ...prev, participantIds: nextIds };
    });
  };

  /* ── API Actions ─────────────────────────────────────────────────────────── */

  const submitReport = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const normalizedCount = Math.max(0, Number(form.participantCount || 0));
      const participantIds = Array.from(
        { length: normalizedCount },
        (_, i) => String(form.participantIds?.[i] || '').trim(),
      ).filter(Boolean);

      if (participantIds.length !== normalizedCount) {
        throw new Error('يرجى اختيار أسماء جميع أفراد الكادر المشارك.');
      }
      if (new Set(participantIds).size !== participantIds.length) {
        throw new Error('لا يمكن اختيار نفس الموظف أكثر من مرة داخل التقرير نفسه.');
      }
      if (participantIds.includes(currentUserId)) {
        throw new Error('لا يمكن إضافة كاتب التقرير ضمن الكادر المشارك.');
      }

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
      payload.append('participantCount', String(normalizedCount));
      payload.append('participantIds', JSON.stringify(participantIds));

      attachments.forEach((item) => payload.append('images', item.file));
      payload.append('imageComments', JSON.stringify(attachments.map((item) => item.comment || '')));

      await api.post('/work-reports', payload);
      setInfo('تم إنشاء تقرير العمل بنجاح وإرساله للاعتماد.');
      resetForm();
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setError(err.message || 'فشل إنشاء تقرير العمل');
    } finally {
      setSaving(false);
    }
  };

  const submitApproval = async () => {
    if (!selectedReport) return;
    setApproving(true);
    setError('');
    setInfo('');
    try {
      await api.patch(`/work-reports/${selectedReport._id}/approve`, {
        points: Number(approvalPoints),
        managerComment: approvalComment,
      });
      setInfo('تم اعتماد التقرير وإضافة النقاط بنجاح.');
      setInlineAction(null);
      setApprovalPoints('');
      setApprovalComment('');
      await load();
    } catch (err) {
      setError(err.message || 'فشل اعتماد تقرير العمل');
    } finally {
      setApproving(false);
    }
  };

  const submitRejection = async () => {
    if (!selectedReport) return;
    setRejecting(true);
    setError('');
    setInfo('');
    try {
      await api.patch(`/work-reports/${selectedReport._id}/reject`, {
        reason: rejectionReason,
        managerComment: rejectionComment,
      });
      setInfo('تم رفض التقرير وإرسال الملاحظة للموظف.');
      setInlineAction(null);
      setRejectionReason('');
      setRejectionComment('');
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
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
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

  const sendReportPdfToWhatsApp = (report) => {
    const lines = [
      '[ تقرير عمل - Delta Plus ]',
      '----------------------------------',
      `العنوان: ${report.title || 'بدون عنوان'}`,
      `الموظف: ${report.employeeName || report.user?.fullName || '-'}`,
      `المشروع: ${report.project?.name || report.projectName || '-'}`,
      `الحالة: ${statusLabelMap[report.status] || report.status}`,
      `نوع النشاط: ${report.activityType || '-'}`,
      `نسبة الإنجاز: ${Number(report.progressPercent || 0)}%`,
      `ساعات العمل: ${Number(report.hoursSpent || 0)}`,
      '----------------------------------',
      'يرجى مراجعة التقرير في أقرب وقت.',
      '[ صادر من نظام Delta Plus ]',
    ].join('\n');

    const url = `https://wa.me/?text=${encodeURIComponent(lines)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  /* ── Detail Panel Helpers ────────────────────────────────────────────────── */

  const openDetails = (report) => {
    setSelectedReportId(report._id);
    setInlineAction(null);
    setApprovalPoints('');
    setApprovalComment('');
    setRejectionReason('');
    setRejectionComment('');
  };

  const canModerateSelected = useMemo(() => {
    if (!selectedReport || !canApprove) return false;
    const userId = String(selectedReport.user?._id || selectedReport.user?.id || '');
    return userId !== currentUserId && selectedReport.status === 'SUBMITTED';
  }, [selectedReport, canApprove, currentUserId]);

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <>
      {/* ── Messages ── */}
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: '#9bc8ff' }}>{info}</section> : null}

      {/* ══════════════════════════════════════════════════════════════════════
          KPI Summary Cards
          ══════════════════════════════════════════════════════════════════════ */}
      <section className="card section" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ margin: 0 }}>تقارير العمل</h2>
          <button type="button" className="btn btn-soft" onClick={load} disabled={loading}>
            {loading ? 'جارٍ التحديث...' : 'تحديث'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 14 }}>
          {[
            { label: 'إجمالي التقارير', value: summary.total, color: '#4d91ff' },
            { label: 'بانتظار الاعتماد', value: summary.submitted, color: '#e67e22' },
            { label: 'معتمد', value: summary.approved, color: '#27ae60' },
            { label: 'مرفوض', value: summary.rejected, color: '#c0392b' },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '14px 16px',
                textAlign: 'center',
                borderTop: `3px solid ${card.color}`,
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
              <div style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: 4 }}>{card.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          Create Report Form (collapsible)
          ══════════════════════════════════════════════════════════════════════ */}
      <section className="card section" style={{ marginBottom: 16 }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          <h2 style={{ margin: 0 }}>إنشاء تقرير عمل</h2>
          <button type="button" className="btn btn-soft">
            {showCreateForm ? 'إخفاء النموذج' : 'فتح النموذج'}
          </button>
        </div>

        {showCreateForm ? (
          <form className="grid-3" style={{ marginTop: 16 }} onSubmit={submitReport}>
            {/* ── Section: بيانات أساسية ── */}
            <div className="grid-span-full" style={{ marginBottom: 4 }}>
              <h3 style={{ margin: '0 0 4px', color: 'var(--text-soft)', fontSize: 14, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                بيانات أساسية
              </h3>
            </div>
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

            {/* ── Section: مؤشرات الأداء ── */}
            <div className="grid-span-full" style={{ marginTop: 8, marginBottom: 4 }}>
              <h3 style={{ margin: '0 0 4px', color: 'var(--text-soft)', fontSize: 14, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                مؤشرات الأداء
              </h3>
            </div>
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
            <label>
              عدد الكادر المشارك
              <input
                className="input"
                type="number"
                min={0}
                max={Math.max(0, employeeOptions.length)}
                value={form.participantCount}
                onChange={(e) => syncParticipantCount(e.target.value)}
              />
              <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: 'var(--text-soft)' }}>
                أدخل العدد ليتم إنشاء حقول اختيار الأسماء تلقائيًا.
              </span>
            </label>

            {/* ── Section: التفاصيل ── */}
            <div className="grid-span-full" style={{ marginTop: 8, marginBottom: 4 }}>
              <h3 style={{ margin: '0 0 4px', color: 'var(--text-soft)', fontSize: 14, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                تفاصيل العمل
              </h3>
            </div>
            <label className="grid-span-full">
              تفاصيل العمل
              <textarea
                className="textarea"
                rows={3}
                value={form.details}
                onChange={(e) => setForm((prev) => ({ ...prev, details: e.target.value }))}
                required
              />
            </label>
            <label className="grid-span-full">
              ما تم إنجازه
              <textarea
                className="textarea"
                rows={2}
                value={form.accomplishments}
                onChange={(e) => setForm((prev) => ({ ...prev, accomplishments: e.target.value }))}
              />
            </label>
            <label className="grid-span-full">
              التحديات والمشاكل
              <textarea
                className="textarea"
                rows={2}
                value={form.challenges}
                onChange={(e) => setForm((prev) => ({ ...prev, challenges: e.target.value }))}
              />
            </label>
            <label className="grid-span-full">
              الخطوات القادمة
              <textarea
                className="textarea"
                rows={2}
                value={form.nextSteps}
                onChange={(e) => setForm((prev) => ({ ...prev, nextSteps: e.target.value }))}
              />
            </label>

            {/* ── Section: الكادر المشارك ── */}
            {participantSlots.length ? (
              <div className="grid-span-full">
                <h3 style={{ margin: '8px 0 4px', color: 'var(--text-soft)', fontSize: 14, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                  الكادر المشارك
                </h3>
                <p style={{ marginTop: 4, color: 'var(--text-soft)', fontSize: 12 }}>
                  اختر أسماء الموظفين المشاركين في التنفيذ. لا يمكن تكرار نفس الموظف داخل التقرير.
                </p>
                <div className="grid-3" style={{ gap: 12 }}>
                  {participantSlots.map((slotIndex) => {
                    const otherSelections = new Set(
                      (form.participantIds || [])
                        .filter((_, ci) => ci !== slotIndex)
                        .filter(Boolean),
                    );
                    return (
                      <label key={`participant-${slotIndex}`}>
                        المشارك {slotIndex + 1}
                        <select
                          className="select"
                          value={form.participantIds?.[slotIndex] || ''}
                          onChange={(e) => updateParticipant(slotIndex, e.target.value)}
                          required
                        >
                          <option value="">اختر الموظف</option>
                          {employeeOptions.map((emp) => {
                            const eid = String(emp.id || emp._id || '');
                            const eCode = emp.employeeCode ? ` - ${emp.employeeCode}` : '';
                            return (
                              <option key={eid} value={eid} disabled={otherSelections.has(eid)}>
                                {emp.fullName}{eCode}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* ── Section: الصور ── */}
            <div className="grid-span-full">
              <h3 style={{ margin: '8px 0 4px', color: 'var(--text-soft)', fontSize: 14, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                صور الأعمال (حتى 10 صور)
              </h3>
              <p style={{ marginTop: 4, color: 'var(--text-soft)', fontSize: 12 }}>
                يمكنك فتح كاميرا الموبايل مباشرة أو اختيار صور موجودة في الجهاز.
              </p>
              <div className="action-row" style={{ marginBottom: 10 }}>
                <label className="btn btn-soft" style={{ cursor: 'pointer' }}>
                  فتح الكاميرا مباشرة
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => { addAttachments(e.target.files); e.target.value = ''; }}
                  />
                </label>
                <label className="btn btn-soft" style={{ cursor: 'pointer' }}>
                  رفع من ملفات الجهاز
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => { addAttachments(e.target.files); e.target.value = ''; }}
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
                        style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
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

            {/* ── Submit ── */}
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'جارٍ إرسال التقرير...' : 'إرسال التقرير للاعتماد'}
              </button>
              <button className="btn btn-soft" type="button" onClick={resetForm}>
                إعادة تعيين
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          Filters
          ══════════════════════════════════════════════════════════════════════ */}
      <section className="card section" style={{ marginBottom: 16 }}>
        <div className="grid-3" style={{ gap: 10, alignItems: 'end' }}>
          <label>
            الحالة
            <select
              className="select"
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">الكل</option>
              <option value="SUBMITTED">بانتظار الاعتماد</option>
              <option value="APPROVED">معتمد</option>
              <option value="REJECTED">مرفوض</option>
            </select>
          </label>
          <label>
            المشروع
            <select
              className="select"
              value={filters.projectId}
              onChange={(e) => setFilters((prev) => ({ ...prev, projectId: e.target.value }))}
            >
              <option value="">الكل</option>
              {projectOptions.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            بحث
            <input
              className="input"
              placeholder="اسم الموظف أو العنوان..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
          </label>
          <label>
            من تاريخ
            <input
              className="input"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
            />
          </label>
          <label>
            إلى تاريخ
            <input
              className="input"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
            />
          </label>
          <div>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => setFilters(defaultFilters)}
            >
              إعادة تعيين الفلاتر
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          Reports Table
          ══════════════════════════════════════════════════════════════════════ */}
      <section className="card section" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px' }}>سجل التقارير ({filteredReports.length})</h2>
        {loading ? <p style={{ color: 'var(--text-soft)' }}>جارٍ تحميل التقارير...</p> : null}

        {!loading ? (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>الموظف</th>
                <th>المشروع</th>
                <th>العنوان</th>
                <th>تاريخ العمل</th>
                <th>الإنجاز</th>
                <th>الكادر</th>
                <th>الحالة</th>
                <th>النقاط</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.length ? filteredReports.map((report, idx) => {
                const isSelected = selectedReportId === report._id;
                const reportParticipantCount = Number(report.participantCount || report.participants?.length || 0);
                const pct = Number(report.progressPercent || 0);

                return (
                  <tr
                    key={report._id}
                    style={isSelected ? { background: 'rgba(77, 145, 255, 0.08)' } : undefined}
                  >
                    <td>{idx + 1}</td>
                    <td>
                      <strong>{report.employeeName || report.user?.fullName || '-'}</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                        {report.employeeCode || report.user?.employeeCode || ''}
                      </div>
                    </td>
                    <td>{report.project?.name || report.projectName || '-'}</td>
                    <td>{report.title || '-'}</td>
                    <td>{formatDate(report.workDate || report.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          style={{
                            width: 50,
                            height: 8,
                            borderRadius: 4,
                            background: '#1e2d4d',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, pct)}%`,
                              height: '100%',
                              borderRadius: 4,
                              background: pct >= 80 ? '#27ae60' : pct >= 50 ? '#2980b9' : '#e67e22',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 12 }}>{pct}%</span>
                      </div>
                    </td>
                    <td>{reportParticipantCount}</td>
                    <td>
                      <span className={`status-pill ${statusClassMap[report.status] || 'status-todo'}`}>
                        {statusLabelMap[report.status] || report.status}
                      </span>
                    </td>
                    <td>{formatWorkReportPoints(report.pointsAwarded || 0)}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button className="btn btn-soft" type="button" onClick={() => openDetails(report)}>
                          تفاصيل
                        </button>
                        <button className="btn btn-soft" type="button" onClick={() => openReportPdf(report)}>
                          PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={10} style={{ color: 'var(--text-soft)' }}>لا توجد تقارير عمل مطابقة.</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : null}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          Detail Panel
          ══════════════════════════════════════════════════════════════════════ */}
      {selectedReport ? (
        <section className="card section">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0 }}>
                {selectedReport.title || 'بدون عنوان'}{' '}
                <span style={{ color: 'var(--text-soft)', fontWeight: 400 }}>{resolveReportNumber(selectedReport)}</span>
              </h2>
              <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
                {selectedReport.employeeName || selectedReport.user?.fullName || '-'}
                {' | '}
                {selectedReport.project?.name || selectedReport.projectName || '-'}
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="btn btn-soft" onClick={() => openReportPdf(selectedReport)}>
                عرض PDF
              </button>
              <button type="button" className="btn btn-soft" onClick={() => downloadReportPdf(selectedReport)}>
                حفظ PDF
              </button>
              {canSendWhatsapp ? (
                <button type="button" className="btn btn-soft" onClick={() => sendReportPdfToWhatsApp(selectedReport)}>
                  واتساب
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => { setSelectedReportId(''); setInlineAction(null); }}
              >
                إغلاق
              </button>
            </div>
          </div>

          {/* Status Badge */}
          <div style={{ marginTop: 12 }}>
            <span className={`status-pill ${statusClassMap[selectedReport.status] || 'status-todo'}`}>
              {statusLabelMap[selectedReport.status] || selectedReport.status}
            </span>
          </div>

          {/* Basic Info Grid */}
          <div className="grid-3" style={{ marginTop: 16 }}>
            <label>
              رقم التقرير
              <input className="input" value={resolveReportNumber(selectedReport)} disabled />
            </label>
            <label>
              رمز الموظف
              <input className="input" value={selectedReport.employeeCode || selectedReport.user?.employeeCode || '-'} disabled />
            </label>
            <label>
              نوع النشاط
              <input className="input" value={selectedReport.activityType || '-'} disabled />
            </label>
            <label>
              تاريخ العمل
              <input className="input" value={formatDate(selectedReport.workDate || selectedReport.createdAt)} disabled />
            </label>
            <label>
              تاريخ الإنشاء
              <input className="input" value={formatDateTime(selectedReport.createdAt)} disabled />
            </label>
            <label>
              تاريخ الاعتماد
              <input className="input" value={formatDateTime(selectedReport.approvedAt)} disabled />
            </label>
          </div>

          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginTop: 16 }}>
            {[
              { label: 'نسبة الإنجاز', value: `${Number(selectedReport.progressPercent || 0)}%` },
              { label: 'ساعات العمل', value: `${Number(selectedReport.hoursSpent || 0)}` },
              { label: 'الكادر المشارك', value: `${Number(selectedReport.participantCount || selectedReport.participants?.length || 0)}` },
              { label: 'إجمالي النقاط', value: formatWorkReportPoints(selectedReport.pointsAwarded || 0) },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: '#0e1a34',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 700 }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          {(() => {
            const pct = Math.min(100, Math.max(0, Number(selectedReport.progressPercent || 0)));
            return (
              <div style={{ marginTop: 12 }}>
                <div style={{ width: '100%', height: 10, borderRadius: 5, background: '#1e2d4d', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      borderRadius: 5,
                      background: pct >= 80 ? '#27ae60' : pct >= 50 ? '#2980b9' : '#e67e22',
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            );
          })()}

          {/* Points Distribution */}
          {selectedReport.status === 'APPROVED' && selectedDistribution ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>توزيع النقاط</h3>
              <div className="grid-3">
                <label>
                  نقاط كاتب التقرير
                  <input className="input" value={formatWorkReportPoints(selectedReport.reporterPointsAwarded || selectedDistribution.reporterPoints)} disabled />
                </label>
                <label>
                  نقاط كل مشارك
                  <input className="input" value={formatWorkReportPoints(selectedReport.participantPointsAwarded || selectedDistribution.participantPoints)} disabled />
                </label>
                <label>
                  إجمالي نقاط المشاركين
                  <input className="input" value={formatWorkReportPoints(selectedReport.participantsTotalAwarded || selectedDistribution.participantsTotalPoints || 0)} disabled />
                </label>
              </div>
            </div>
          ) : null}

          {/* Text Sections */}
          {selectedReport.details ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>تفاصيل العمل</h3>
              <div style={{ color: 'var(--text-soft)', lineHeight: 1.8, background: '#0e1a34', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                {selectedReport.details}
              </div>
            </div>
          ) : null}

          {selectedReport.accomplishments ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>المنجزات</h3>
              <div style={{ color: 'var(--text-soft)', lineHeight: 1.8, background: '#0e1a34', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                {selectedReport.accomplishments}
              </div>
            </div>
          ) : null}

          {selectedReport.challenges ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>التحديات</h3>
              <div style={{ color: 'var(--text-soft)', lineHeight: 1.8, background: '#0e1a34', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                {selectedReport.challenges}
              </div>
            </div>
          ) : null}

          {selectedReport.nextSteps ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>الخطوات القادمة</h3>
              <div style={{ color: 'var(--text-soft)', lineHeight: 1.8, background: '#0e1a34', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                {selectedReport.nextSteps}
              </div>
            </div>
          ) : null}

          {/* Participants */}
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>المشاركون ({selectedReport.participants?.length || 0})</h3>
            {(selectedReport.participants || []).length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {selectedReport.participants.map((p, i) => (
                  <span
                    key={p.user || i}
                    className="status-pill"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  >
                    {p.fullName || 'مشارك'}
                    {p.employeeCode ? ` (${p.employeeCode})` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-soft)' }}>لا يوجد مشاركون في هذا التقرير.</p>
            )}
          </div>

          {/* Images */}
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>الصور المرفقة</h3>
            {(selectedReport.images || []).length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {(selectedReport.images || []).map((image, index) => (
                  <a
                    key={`${selectedReport._id}-img-${index}`}
                    href={resolveUploadUrl(image.publicUrl)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ width: 110, textDecoration: 'none', color: 'inherit' }}
                  >
                    <img
                      src={resolveUploadUrl(image.publicUrl)}
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
                      <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 6 }}>{image.comment}</div>
                    ) : null}
                  </a>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-soft)' }}>لا توجد صور مرفقة.</p>
            )}
          </div>

          {/* Manager Comment / Rejection */}
          {selectedReport.managerComment ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>تعليق المدير</h3>
              <div style={{ color: 'var(--text-soft)', lineHeight: 1.8, background: '#0e1a34', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                {selectedReport.managerComment}
              </div>
            </div>
          ) : null}

          {selectedReport.rejectionReason ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8, color: 'var(--danger)' }}>سبب الرفض</h3>
              <div style={{ color: 'var(--danger)', lineHeight: 1.8, background: '#1a0e0e', padding: 12, borderRadius: 8, border: '1px solid var(--danger)' }}>
                {selectedReport.rejectionReason}
              </div>
            </div>
          ) : null}

          {selectedReport.approvedBy ? (
            <div style={{ marginTop: 12, color: 'var(--text-soft)', fontSize: 13 }}>
              اعتمده: {selectedReport.approvedBy?.fullName || '-'}
            </div>
          ) : null}

          {/* ── Inline Approve / Reject ── */}
          {canModerateSelected ? (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              {!inlineAction ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setInlineAction('approve')}
                  >
                    اعتماد ومنح نقاط
                  </button>
                  <button
                    type="button"
                    className="btn btn-soft"
                    onClick={() => setInlineAction('reject')}
                    style={{ color: 'var(--danger)' }}
                  >
                    رفض التقرير
                  </button>
                </div>
              ) : null}

              {inlineAction === 'approve' ? (
                <div>
                  <h3 style={{ margin: '0 0 10px' }}>اعتماد التقرير</h3>
                  <div className="grid-3" style={{ gap: 10 }}>
                    <label>
                      إجمالي نقاط التقرير (إلزامي)
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={1000}
                        value={approvalPoints}
                        onChange={(e) => setApprovalPoints(e.target.value)}
                        required
                      />
                      {approvalDistribution ? (
                        <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: 'var(--text-soft)' }}>
                          الكاتب: {formatWorkReportPoints(approvalDistribution.reporterPoints)} نقطة
                          {approvalDistribution.participantCount
                            ? ` | كل مشارك: ${formatWorkReportPoints(approvalDistribution.participantPoints)} نقطة`
                            : ''}
                        </span>
                      ) : null}
                    </label>
                    <label className="grid-span-full">
                      تعليق المدير
                      <input
                        className="input"
                        value={approvalComment}
                        onChange={(e) => setApprovalComment(e.target.value)}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={approving || !approvalPoints}
                      onClick={submitApproval}
                    >
                      {approving ? 'جارٍ الاعتماد...' : 'تأكيد الاعتماد'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-soft"
                      disabled={approving}
                      onClick={() => { setInlineAction(null); setApprovalPoints(''); setApprovalComment(''); }}
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : null}

              {inlineAction === 'reject' ? (
                <div>
                  <h3 style={{ margin: '0 0 10px', color: 'var(--danger)' }}>رفض التقرير</h3>
                  <div className="grid-3" style={{ gap: 10 }}>
                    <label>
                      سبب الرفض (إلزامي)
                      <input
                        className="input"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        required
                      />
                    </label>
                    <label className="grid-span-full">
                      تعليق إضافي
                      <input
                        className="input"
                        value={rejectionComment}
                        onChange={(e) => setRejectionComment(e.target.value)}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={rejecting || !rejectionReason}
                      onClick={submitRejection}
                    >
                      {rejecting ? 'جارٍ الرفض...' : 'تأكيد الرفض'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-soft"
                      disabled={rejecting}
                      onClick={() => { setInlineAction(null); setRejectionReason(''); setRejectionComment(''); }}
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
