'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';

const maintenanceTypeOptions = [
  ['PERIODIC', 'صيانة دورية'],
  ['EMERGENCY', 'صيانة طارئة'],
  ['FOLLOW_UP', 'متابعة عطل سابق'],
  ['INSTALLATION', 'تركيب معدات'],
];

const deviceConditionOptions = [
  ['GOOD', 'جيد'],
  ['NEEDS_MAINTENANCE', 'يحتاج صيانة'],
  ['NEEDS_REPLACEMENT', 'يحتاج تبديل'],
];

const issueSeverityOptions = [
  ['MEDIUM', 'متوسط'],
  ['HIGH', 'عالي'],
];

const statusClassMap = {
  NEW: 'status-todo',
  AWAITING_ACCEPTANCE: 'status-submitted',
  ACCEPTED: 'status-inprogress',
  IN_PROGRESS: 'status-inprogress',
  DRAFT: 'status-inprogress',
  COMPLETED: 'status-approved',
  AWAITING_CUSTOMER_FEEDBACK: 'status-submitted',
  FEEDBACK_SUBMITTED: 'status-approved',
  PENDING_MANAGER_APPROVAL: 'status-submitted',
  RETURNED_FOR_EDIT: 'status-inprogress',
  APPROVED: 'status-approved',
  REJECTED: 'status-rejected',
  CLOSED: 'status-approved',
};

const emptyRequestForm = {
  customerName: '',
  siteLocation: '',
  phone: '',
  projectNumber: '',
  points: 15,
  assignedEmployeeId: '',
  description: '',
};

const createEmptyReportForm = () => ({
  siteName: '',
  siteAddress: '',
  visitDate: '',
  arrivalTime: '',
  departureTime: '',
  technicianName: '',
  department: '',
  maintenanceTypes: [],
  inspectedDevices: [{ device: '', model: '', condition: 'GOOD', notes: '' }],
  performedActions: [''],
  detectedIssues: [{ issue: '', severity: 'MEDIUM', proposedSolution: '' }],
  usedMaterials: [{ material: '', quantity: '', notes: '' }],
  recommendations: [''],
  imageUploads: [{ file: null, comment: '' }],
});

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' });
};

const mapReportToForm = (report) => ({
  siteName: report?.visitInfo?.siteName || report?.customerName || '',
  siteAddress: report?.visitInfo?.siteAddress || report?.siteLocation || '',
  visitDate: report?.visitInfo?.visitDate ? new Date(report.visitInfo.visitDate).toISOString().split('T')[0] : '',
  arrivalTime: report?.visitInfo?.arrivalTime || '',
  departureTime: report?.visitInfo?.departureTime || '',
  technicianName: report?.visitInfo?.technicianName || report?.assignedEmployee?.fullName || '',
  department: report?.visitInfo?.department || report?.assignedEmployee?.department || '',
  maintenanceTypes: (report?.maintenanceTypes || []).map((item) => item.value || item),
  inspectedDevices: report?.inspectedDevices?.length
    ? report.inspectedDevices.map((item) => ({
        device: item.device || '',
        model: item.model || '',
        condition: item.condition || 'GOOD',
        notes: item.notes || '',
      }))
    : [{ device: '', model: '', condition: 'GOOD', notes: '' }],
  performedActions: report?.performedActions?.length ? report.performedActions : [''],
  detectedIssues: report?.detectedIssues?.length
    ? report.detectedIssues.map((item) => ({
        issue: item.issue || '',
        severity: item.severity || 'MEDIUM',
        proposedSolution: item.proposedSolution || '',
      }))
    : [{ issue: '', severity: 'MEDIUM', proposedSolution: '' }],
  usedMaterials: report?.usedMaterials?.length
    ? report.usedMaterials.map((item) => ({
        material: item.material || '',
        quantity: item.quantity || '',
        notes: item.notes || '',
      }))
    : [{ material: '', quantity: '', notes: '' }],
  recommendations: report?.recommendations?.length ? report.recommendations : [''],
  imageUploads: [{ file: null, comment: '' }],
});

const appendObjectRow = (setter, key, value) => setter((current) => ({ ...current, [key]: [...current[key], value] }));
const appendStringRow = (setter, key) => setter((current) => ({ ...current, [key]: [...current[key], ''] }));

const renderStars = (rating) => {
  const n = Number(rating || 0);
  return Array.from({ length: 5 }, (_, i) => i < n ? '\u2605' : '\u2606').join('');
};

const maintenanceTypeLabelMap = Object.fromEntries(maintenanceTypeOptions);
const deviceConditionLabelMap = Object.fromEntries(deviceConditionOptions);
const issueSeverityLabelMap = Object.fromEntries(issueSeverityOptions);

export default function MaintenanceReportsPage() {
  const currentUser = authStorage.getUser();
  const canCreate = hasPermission(currentUser, Permission.CREATE_MAINTENANCE_REPORT_REQUESTS);

  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState(null);
  const [employeesSummary, setEmployeesSummary] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [reportForm, setReportForm] = useState(createEmptyReportForm());
  const [filters, setFilters] = useState({
    customerName: '',
    projectNumber: '',
    employeeName: '',
    status: '',
    maintenanceType: '',
    dateFrom: '',
    dateTo: '',
  });
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [feedbackResult, setFeedbackResult] = useState(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [reportsRes, summaryRes, assigneesRes] = await Promise.all([
        api.get(`/maintenance-reports${queryString ? `?${queryString}` : ''}`),
        api.get(`/maintenance-reports/summary${queryString ? `?${queryString}` : ''}`).catch(() => ({ summary: null, employees: [] })),
        canCreate ? api.get('/maintenance-reports/assignees').catch(() => ({ assignees: [] })) : Promise.resolve({ assignees: [] }),
      ]);
      setReports(reportsRes.reports || []);
      setSummary(summaryRes.summary || null);
      setEmployeesSummary(summaryRes.employees || []);
      setAssignees(assigneesRes.assignees || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل بيانات تقارير الصيانة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [queryString]);

  const openReport = async (reportId) => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const response = await api.get(`/maintenance-reports/${reportId}`);
      setSelectedReport(response.report || null);
      setReportForm(mapReportToForm(response.report));
      setFeedbackResult(null);
    } catch (err) {
      setError(err.message || 'تعذر فتح التقرير');
    } finally {
      setSaving(false);
    }
  };

  const submitRequest = async () => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.post('/maintenance-reports', requestForm);
      setRequestForm(emptyRequestForm);
      setInfo('تم إنشاء طلب تقرير الصيانة بنجاح.');
      await load();
    } catch (err) {
      setError(err.message || 'فشل إنشاء طلب تقرير الصيانة');
    } finally {
      setSaving(false);
    }
  };

  const acceptReport = async (reportId) => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const response = await api.patch(`/maintenance-reports/${reportId}/accept`, {});
      setSelectedReport(response.report || null);
      setReportForm(mapReportToForm(response.report));
      setInfo('تم استلام الطلب وفتح نموذج التقرير.');
      await load();
    } catch (err) {
      setError(err.message || 'تعذر استلام الطلب');
    } finally {
      setSaving(false);
    }
  };

  const buildReportFormData = () => {
    const formData = new FormData();
    formData.append('siteName', reportForm.siteName || '');
    formData.append('siteAddress', reportForm.siteAddress || '');
    formData.append('visitDate', reportForm.visitDate || '');
    formData.append('arrivalTime', reportForm.arrivalTime || '');
    formData.append('departureTime', reportForm.departureTime || '');
    formData.append('technicianName', reportForm.technicianName || '');
    formData.append('department', reportForm.department || '');
    formData.append('maintenanceTypes', JSON.stringify(reportForm.maintenanceTypes || []));
    formData.append('inspectedDevices', JSON.stringify(reportForm.inspectedDevices || []));
    formData.append('performedActions', JSON.stringify((reportForm.performedActions || []).filter(Boolean)));
    formData.append('detectedIssues', JSON.stringify(reportForm.detectedIssues || []));
    formData.append('usedMaterials', JSON.stringify(reportForm.usedMaterials || []));
    formData.append('recommendations', JSON.stringify((reportForm.recommendations || []).filter(Boolean)));

    const comments = [];
    (reportForm.imageUploads || []).forEach((upload) => {
      if (upload?.file) {
        formData.append('images', upload.file);
        comments.push(upload.comment || '');
      }
    });
    formData.append('imageComments', JSON.stringify(comments));
    return formData;
  };

  const saveDraft = async ({ completeAfter = false } = {}) => {
    if (!selectedReport) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const saved = await api.patch(`/maintenance-reports/${selectedReport.id}/report`, buildReportFormData());
      let current = saved.report;
      if (completeAfter) {
        const completed = await api.patch(`/maintenance-reports/${selectedReport.id}/complete`, {});
        current = completed.report;
        setInfo('تم حفظ التقرير وإكماله بنجاح.');
      } else {
        setInfo('تم حفظ التقرير كمسودة.');
      }
      setSelectedReport(current);
      setReportForm(mapReportToForm(current));
      await load();
    } catch (err) {
      setError(err.message || 'تعذر حفظ التقرير');
    } finally {
      setSaving(false);
    }
  };

  const createFeedbackLink = async () => {
    if (!selectedReport) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const response = await api.post(`/maintenance-reports/${selectedReport.id}/feedback-link`, {});
      setSelectedReport(response.report || selectedReport);
      setFeedbackResult(response.feedback || null);
      setInfo('تم إنشاء رابط تقييم الزبون.');
      await load();
    } catch (err) {
      setError(err.message || 'تعذر إنشاء رابط التقييم');
    } finally {
      setSaving(false);
    }
  };

  const submitForApproval = async () => {
    if (!selectedReport) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const response = await api.patch(`/maintenance-reports/${selectedReport.id}/submit-for-approval`, {
        notes: submissionNotes,
      });
      setSelectedReport(response.report || selectedReport);
      setSubmissionNotes('');
      setInfo('تم إرسال التقرير إلى المدير المباشر للاعتماد.');
      await load();
    } catch (err) {
      setError(err.message || 'تعذر إرسال التقرير للاعتماد');
    } finally {
      setSaving(false);
    }
  };

  const managerReview = async (action) => {
    if (!selectedReport) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const response = await api.patch(`/maintenance-reports/${selectedReport.id}/manager-review`, {
        action,
        notes: reviewNotes,
      });
      setSelectedReport(response.report || selectedReport);
      setReviewNotes('');
      setInfo('تم تنفيذ إجراء الاعتماد.');
      await load();
    } catch (err) {
      setError(err.message || 'تعذر تنفيذ الاعتماد');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async (report) => {
    try {
      const blob = await api.downloadBlob(`/maintenance-reports/${report.id}/pdf?download=1`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `maintenance-report-${report.requestNo || report.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'تعذر تحميل ملف PDF');
    }
  };

  const openWhatsapp = (report) => {
    const statusText = report.statusLabel || report.status || '-';
    const devicesCount = (report.inspectedDevices || []).length;
    const issuesCount = (report.detectedIssues || []).length;
    const materialsCount = (report.usedMaterials || []).length;

    const lines = [
      `[ تقرير الصيانة الدورية - Delta Plus ]`,
      `----------------------------------`,
      `(i) رقم التقرير  : ${report.requestNo || '-'}`,
      `(i) اسم الزبون   : ${report.customerName || '-'}`,
      `(i) رقم المشروع  : ${report.projectNumber || '-'}`,
      `(i) الموقع        : ${report.siteLocation || '-'}`,
      `----------------------------------`,
      `(*) الفني المسؤول : ${report.assignedEmployee?.fullName || 'غير معيّن'}`,
      `(*) الحالة        : ${statusText}`,
      `(*) النقاط        : ${report.points || 0}`,
      `----------------------------------`,
    ];

    if (report.visitInfo) {
      lines.push(
        `(+) تاريخ الزيارة : ${report.visitInfo.visitDate ? formatDateTime(report.visitInfo.visitDate) : '-'}`,
        `(+) وقت الوصول    : ${report.visitInfo.arrivalTime || '-'}`,
        `(+) وقت المغادرة  : ${report.visitInfo.departureTime || '-'}`,
        `----------------------------------`,
      );
    }

    lines.push(
      `الأجهزة المفحوصة : ${devicesCount}`,
      `المشاكل المكتشفة : ${issuesCount}`,
      `المواد المستخدمة  : ${materialsCount}`,
    );

    if (devicesCount) {
      lines.push('', 'الأجهزة:');
      report.inspectedDevices.forEach((d, i) => {
        lines.push(`  ${i + 1}. ${d.device || '-'} (${d.model || '-'}) - ${d.condition || '-'}`);
      });
    }

    if (issuesCount) {
      lines.push('', 'المشاكل:');
      report.detectedIssues.forEach((d, i) => {
        lines.push(`  ${i + 1}. ${d.issue || '-'} [${d.severity || '-'}]`);
      });
    }

    if (report.customerFeedback?.submittedAt) {
      lines.push(
        `----------------------------------`,
        `تقييم الشركة  : ${report.customerFeedback.companyRating || '-'}/5`,
        `تقييم الموظف  : ${report.customerFeedback.employeeRating || '-'}/5`,
      );
      if (report.customerFeedback.notes) {
        lines.push(`ملاحظات الزبون: ${report.customerFeedback.notes}`);
      }
    }

    lines.push(
      `----------------------------------`,
      `[ صادر تلقائيًا من نظام Delta Plus ]`,
    );

    const url = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return <section className="card section">جارٍ تحميل تقارير الصيانة الدورية...</section>;
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--accent)' }}>{info}</section> : null}

      {summary ? (
        <section className="grid-4" style={{ marginBottom: 16 }}>
          <article className="card section"><p style={{ color: 'var(--text-soft)', marginTop: 0 }}>إجمالي الزيارات</p><h2>{summary.totalVisits || 0}</h2></article>
          <article className="card section"><p style={{ color: 'var(--text-soft)', marginTop: 0 }}>بانتظار الاستلام</p><h2>{summary.awaitingAcceptance || 0}</h2></article>
          <article className="card section"><p style={{ color: 'var(--text-soft)', marginTop: 0 }}>بانتظار الاعتماد</p><h2>{summary.pendingApproval || 0}</h2></article>
          <article className="card section"><p style={{ color: 'var(--text-soft)', marginTop: 0 }}>متوسط تقييم الموظف</p><h2>{summary.averageEmployeeRating || 0}</h2></article>
        </section>
      ) : null}

      {canCreate ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>طلب تقرير صيانة جديد</h2>
          <div className="grid-3">
            <label>اسم الزبون<input className="input" value={requestForm.customerName} onChange={(e) => setRequestForm((c) => ({ ...c, customerName: e.target.value }))} /></label>
            <label>الموقع<input className="input" value={requestForm.siteLocation} onChange={(e) => setRequestForm((c) => ({ ...c, siteLocation: e.target.value }))} /></label>
            <label>رقم الهاتف<input className="input" value={requestForm.phone} onChange={(e) => setRequestForm((c) => ({ ...c, phone: e.target.value }))} /></label>
            <label>رقم المشروع<input className="input" value={requestForm.projectNumber} onChange={(e) => setRequestForm((c) => ({ ...c, projectNumber: e.target.value }))} /></label>
            <label>النقاط<input className="input" type="number" min={0} max={1000} value={requestForm.points} onChange={(e) => setRequestForm((c) => ({ ...c, points: e.target.value }))} /></label>
            <label>تعيين فني
              <select className="select" value={requestForm.assignedEmployeeId} onChange={(e) => setRequestForm((c) => ({ ...c, assignedEmployeeId: e.target.value }))}>
                <option value="">بدون تعيين مسبق</option>
                {assignees.map((user) => <option key={user.id} value={user.id}>{user.fullName} - {user.role}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>وصف إضافي<textarea className="input" rows={3} value={requestForm.description} onChange={(e) => setRequestForm((c) => ({ ...c, description: e.target.value }))} /></label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={submitRequest}>إنشاء الطلب</button>
          </div>
        </section>
      ) : null}

      <section className="card section" style={{ marginBottom: 16 }}>
        <h2>البحث والفلترة</h2>
        <div className="grid-3">
          <label>اسم الزبون<input className="input" value={filters.customerName} onChange={(e) => setFilters((c) => ({ ...c, customerName: e.target.value }))} /></label>
          <label>رقم المشروع<input className="input" value={filters.projectNumber} onChange={(e) => setFilters((c) => ({ ...c, projectNumber: e.target.value }))} /></label>
          <label>اسم الموظف<input className="input" value={filters.employeeName} onChange={(e) => setFilters((c) => ({ ...c, employeeName: e.target.value }))} /></label>
          <label>الحالة
            <select className="select" value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
              <option value="">الكل</option>
              {['AWAITING_ACCEPTANCE', 'IN_PROGRESS', 'DRAFT', 'COMPLETED', 'AWAITING_CUSTOMER_FEEDBACK', 'PENDING_MANAGER_APPROVAL', 'RETURNED_FOR_EDIT', 'APPROVED', 'REJECTED'].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>نوع الصيانة
            <select className="select" value={filters.maintenanceType} onChange={(e) => setFilters((c) => ({ ...c, maintenanceType: e.target.value }))}>
              <option value="">الكل</option>
              {maintenanceTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>من تاريخ<input className="input" type="date" value={filters.dateFrom} onChange={(e) => setFilters((c) => ({ ...c, dateFrom: e.target.value }))} /></label>
          <label>إلى تاريخ<input className="input" type="date" value={filters.dateTo} onChange={(e) => setFilters((c) => ({ ...c, dateTo: e.target.value }))} /></label>
        </div>
      </section>

      {employeesSummary.length ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>ملخص الموظفين</h2>
          <div className="grid-3">
            {employeesSummary.slice(0, 6).map((row) => (
              <article key={row.employee.id} className="card section" style={{ padding: 12 }}>
                <strong>{row.employee.fullName}</strong>
                <div style={{ color: 'var(--text-soft)', marginTop: 6 }}>الزيارات: {row.visits}</div>
                <div style={{ color: 'var(--text-soft)' }}>التقارير المنجزة: {row.completedReports}</div>
                <div style={{ color: 'var(--text-soft)' }}>النقاط: {row.totalPoints}</div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {selectedReport ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>تفاصيل التقرير {selectedReport.requestNo}</h2>
            <button className="btn btn-soft" type="button" onClick={() => setSelectedReport(null)}>إغلاق</button>
          </div>
          <p style={{ color: 'var(--text-soft)' }}>{selectedReport.customerName} - {selectedReport.projectNumber} - {selectedReport.statusLabel}</p>

          {selectedReport.canEditReport ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="grid-3">
                <label>اسم الشركة / الموقع<input className="input" value={reportForm.siteName} onChange={(e) => setReportForm((c) => ({ ...c, siteName: e.target.value }))} /></label>
                <label>عنوان الموقع<input className="input" value={reportForm.siteAddress} onChange={(e) => setReportForm((c) => ({ ...c, siteAddress: e.target.value }))} /></label>
                <label>تاريخ الزيارة<input className="input" type="date" value={reportForm.visitDate} onChange={(e) => setReportForm((c) => ({ ...c, visitDate: e.target.value }))} /></label>
                <label>وقت الوصول<input className="input" type="time" value={reportForm.arrivalTime} onChange={(e) => setReportForm((c) => ({ ...c, arrivalTime: e.target.value }))} /></label>
                <label>وقت المغادرة<input className="input" type="time" value={reportForm.departureTime} onChange={(e) => setReportForm((c) => ({ ...c, departureTime: e.target.value }))} /></label>
                <label>القسم المسؤول<input className="input" value={reportForm.department} onChange={(e) => setReportForm((c) => ({ ...c, department: e.target.value }))} /></label>
              </div>

              <div className="card section" style={{ padding: 12 }}>
                <strong>نوع الصيانة</strong>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                  {maintenanceTypeOptions.map(([value, label]) => (
                    <label key={value} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="checkbox" checked={reportForm.maintenanceTypes.includes(value)} onChange={(e) => setReportForm((c) => ({ ...c, maintenanceTypes: e.target.checked ? [...c.maintenanceTypes, value] : c.maintenanceTypes.filter((item) => item !== value) }))} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="card section" style={{ padding: 12 }}>
                <strong>الأجهزة التي تم فحصها</strong>
                {reportForm.inspectedDevices.map((row, index) => (
                  <div key={`device-${index}`} className="grid-4" style={{ marginTop: 10 }}>
                    <input className="input" placeholder="الجهاز" value={row.device} onChange={(e) => setReportForm((c) => ({ ...c, inspectedDevices: c.inspectedDevices.map((item, itemIndex) => itemIndex === index ? { ...item, device: e.target.value } : item) }))} />
                    <input className="input" placeholder="الموديل" value={row.model} onChange={(e) => setReportForm((c) => ({ ...c, inspectedDevices: c.inspectedDevices.map((item, itemIndex) => itemIndex === index ? { ...item, model: e.target.value } : item) }))} />
                    <select className="select" value={row.condition} onChange={(e) => setReportForm((c) => ({ ...c, inspectedDevices: c.inspectedDevices.map((item, itemIndex) => itemIndex === index ? { ...item, condition: e.target.value } : item) }))}>
                      {deviceConditionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input className="input" placeholder="الملاحظات" value={row.notes} onChange={(e) => setReportForm((c) => ({ ...c, inspectedDevices: c.inspectedDevices.map((item, itemIndex) => itemIndex === index ? { ...item, notes: e.target.value } : item) }))} />
                  </div>
                ))}
                <div className="form-actions"><button className="btn btn-soft" type="button" onClick={() => appendObjectRow(setReportForm, 'inspectedDevices', { device: '', model: '', condition: 'GOOD', notes: '' })}>إضافة جهاز</button></div>
              </div>

              <div className="card section" style={{ padding: 12 }}>
                <strong>الأعمال المنفذة</strong>
                {reportForm.performedActions.map((value, index) => (
                  <textarea key={`action-${index}`} className="input" rows={2} style={{ marginTop: 10 }} value={value} onChange={(e) => setReportForm((c) => ({ ...c, performedActions: c.performedActions.map((item, itemIndex) => itemIndex === index ? e.target.value : item) }))} />
                ))}
                <div className="form-actions"><button className="btn btn-soft" type="button" onClick={() => appendStringRow(setReportForm, 'performedActions')}>إضافة عمل</button></div>
              </div>

              <div className="card section" style={{ padding: 12 }}>
                <strong>المشاكل المكتشفة</strong>
                {reportForm.detectedIssues.map((row, index) => (
                  <div key={`issue-${index}`} className="grid-3" style={{ marginTop: 10 }}>
                    <input className="input" placeholder="المشكلة" value={row.issue} onChange={(e) => setReportForm((c) => ({ ...c, detectedIssues: c.detectedIssues.map((item, itemIndex) => itemIndex === index ? { ...item, issue: e.target.value } : item) }))} />
                    <select className="select" value={row.severity} onChange={(e) => setReportForm((c) => ({ ...c, detectedIssues: c.detectedIssues.map((item, itemIndex) => itemIndex === index ? { ...item, severity: e.target.value } : item) }))}>
                      {issueSeverityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input className="input" placeholder="الحل المقترح" value={row.proposedSolution} onChange={(e) => setReportForm((c) => ({ ...c, detectedIssues: c.detectedIssues.map((item, itemIndex) => itemIndex === index ? { ...item, proposedSolution: e.target.value } : item) }))} />
                  </div>
                ))}
                <div className="form-actions"><button className="btn btn-soft" type="button" onClick={() => appendObjectRow(setReportForm, 'detectedIssues', { issue: '', severity: 'MEDIUM', proposedSolution: '' })}>إضافة مشكلة</button></div>
              </div>

              <div className="card section" style={{ padding: 12 }}>
                <strong>المواد المستخدمة</strong>
                {reportForm.usedMaterials.map((row, index) => (
                  <div key={`material-${index}`} className="grid-3" style={{ marginTop: 10 }}>
                    <input className="input" placeholder="المادة" value={row.material} onChange={(e) => setReportForm((c) => ({ ...c, usedMaterials: c.usedMaterials.map((item, itemIndex) => itemIndex === index ? { ...item, material: e.target.value } : item) }))} />
                    <input className="input" placeholder="الكمية" value={row.quantity} onChange={(e) => setReportForm((c) => ({ ...c, usedMaterials: c.usedMaterials.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: e.target.value } : item) }))} />
                    <input className="input" placeholder="الملاحظات" value={row.notes} onChange={(e) => setReportForm((c) => ({ ...c, usedMaterials: c.usedMaterials.map((item, itemIndex) => itemIndex === index ? { ...item, notes: e.target.value } : item) }))} />
                  </div>
                ))}
                <div className="form-actions"><button className="btn btn-soft" type="button" onClick={() => appendObjectRow(setReportForm, 'usedMaterials', { material: '', quantity: '', notes: '' })}>إضافة مادة</button></div>
              </div>

              <div className="card section" style={{ padding: 12 }}>
                <strong>التوصيات</strong>
                {reportForm.recommendations.map((value, index) => (
                  <textarea key={`recommendation-${index}`} className="input" rows={2} style={{ marginTop: 10 }} value={value} onChange={(e) => setReportForm((c) => ({ ...c, recommendations: c.recommendations.map((item, itemIndex) => itemIndex === index ? e.target.value : item) }))} />
                ))}
                <div className="form-actions"><button className="btn btn-soft" type="button" onClick={() => appendStringRow(setReportForm, 'recommendations')}>إضافة توصية</button></div>
              </div>

              <div className="card section" style={{ padding: 12 }}>
                <strong>صور الصيانة</strong>
                {(selectedReport.images || []).map((image) => (
                  <div key={image.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                    <img src={assetUrl(image.url)} alt="maintenance" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10 }} />
                    <div>
                      <div>{image.originalName || 'صورة'}</div>
                      <div style={{ color: 'var(--text-soft)' }}>{image.comment || 'بدون تعليق'}</div>
                    </div>
                  </div>
                ))}
                {reportForm.imageUploads.map((upload, index) => (
                  <div key={`upload-${index}`} className="grid-3" style={{ marginTop: 10 }}>
                    <input className="input" type="file" accept="image/*" capture="environment" onChange={(e) => setReportForm((c) => ({ ...c, imageUploads: c.imageUploads.map((item, itemIndex) => itemIndex === index ? { ...item, file: e.target.files?.[0] || null } : item) }))} />
                    <input className="input" placeholder="تعليق الصورة" value={upload.comment} onChange={(e) => setReportForm((c) => ({ ...c, imageUploads: c.imageUploads.map((item, itemIndex) => itemIndex === index ? { ...item, comment: e.target.value } : item) }))} />
                  </div>
                ))}
                <div className="form-actions"><button className="btn btn-soft" type="button" onClick={() => appendObjectRow(setReportForm, 'imageUploads', { file: null, comment: '' })}>إضافة صورة</button></div>
              </div>

              <div className="form-actions">
                <button className="btn btn-soft" type="button" disabled={saving} onClick={() => saveDraft()}>حفظ التقرير</button>
                <button className="btn btn-primary" type="button" disabled={saving} onClick={() => saveDraft({ completeAfter: true })}>إكمال التقرير</button>
              </div>
            </div>
          ) : null}

          {/* ── ملخص التقرير المكتمل (للقراءة فقط) ── */}
          {!selectedReport.canEditReport && selectedReport.visitInfo ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card section" style={{ padding: 12 }}>
                <strong>معلومات الزيارة</strong>
                <table className="table" style={{ marginTop: 10 }}>
                  <tbody>
                    <tr><td style={{ fontWeight: 600, width: '30%' }}>الموقع</td><td>{selectedReport.visitInfo.siteName || '-'}</td></tr>
                    <tr><td style={{ fontWeight: 600 }}>العنوان</td><td>{selectedReport.visitInfo.siteAddress || '-'}</td></tr>
                    <tr><td style={{ fontWeight: 600 }}>تاريخ الزيارة</td><td>{selectedReport.visitInfo.visitDate ? new Date(selectedReport.visitInfo.visitDate).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : '-'}</td></tr>
                    <tr><td style={{ fontWeight: 600 }}>وقت الوصول</td><td>{selectedReport.visitInfo.arrivalTime || '-'}</td></tr>
                    <tr><td style={{ fontWeight: 600 }}>وقت المغادرة</td><td>{selectedReport.visitInfo.departureTime || '-'}</td></tr>
                    <tr><td style={{ fontWeight: 600 }}>الفني</td><td>{selectedReport.visitInfo.technicianName || '-'}</td></tr>
                    <tr><td style={{ fontWeight: 600 }}>القسم</td><td>{selectedReport.visitInfo.department || '-'}</td></tr>
                  </tbody>
                </table>
              </div>

              {selectedReport.maintenanceTypes?.length ? (
                <div className="card section" style={{ padding: 12 }}>
                  <strong>نوع الصيانة</strong>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {selectedReport.maintenanceTypes.map((t) => (
                      <span key={t.value || t} className="status-pill status-inprogress">{maintenanceTypeLabelMap[t.value || t] || t.value || t}</span>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedReport.inspectedDevices?.length ? (
                <div className="card section" style={{ padding: 12 }}>
                  <strong>الأجهزة المفحوصة</strong>
                  <table className="table" style={{ marginTop: 10 }}>
                    <thead><tr><th>الجهاز</th><th>الموديل</th><th>الحالة</th><th>ملاحظات</th></tr></thead>
                    <tbody>
                      {selectedReport.inspectedDevices.map((d, i) => (
                        <tr key={i}><td>{d.device || '-'}</td><td>{d.model || '-'}</td><td>{deviceConditionLabelMap[d.condition] || d.condition || '-'}</td><td>{d.notes || '-'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {selectedReport.performedActions?.length ? (
                <div className="card section" style={{ padding: 12 }}>
                  <strong>الأعمال المنفذة</strong>
                  <ul style={{ marginTop: 10, paddingRight: 20 }}>
                    {selectedReport.performedActions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              ) : null}

              {selectedReport.detectedIssues?.length ? (
                <div className="card section" style={{ padding: 12 }}>
                  <strong>المشاكل المكتشفة</strong>
                  <table className="table" style={{ marginTop: 10 }}>
                    <thead><tr><th>المشكلة</th><th>الخطورة</th><th>الحل المقترح</th></tr></thead>
                    <tbody>
                      {selectedReport.detectedIssues.map((issue, i) => (
                        <tr key={i}><td>{issue.issue || '-'}</td><td>{issueSeverityLabelMap[issue.severity] || issue.severity || '-'}</td><td>{issue.proposedSolution || '-'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {selectedReport.usedMaterials?.length ? (
                <div className="card section" style={{ padding: 12 }}>
                  <strong>المواد المستخدمة</strong>
                  <table className="table" style={{ marginTop: 10 }}>
                    <thead><tr><th>المادة</th><th>الكمية</th><th>ملاحظات</th></tr></thead>
                    <tbody>
                      {selectedReport.usedMaterials.map((m, i) => (
                        <tr key={i}><td>{m.material || '-'}</td><td>{m.quantity || '-'}</td><td>{m.notes || '-'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {selectedReport.recommendations?.length ? (
                <div className="card section" style={{ padding: 12 }}>
                  <strong>التوصيات</strong>
                  <ul style={{ marginTop: 10, paddingRight: 20 }}>
                    {selectedReport.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              ) : null}

              {selectedReport.images?.length ? (
                <div className="card section" style={{ padding: 12 }}>
                  <strong>صور الصيانة</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
                    {selectedReport.images.map((image) => (
                      <div key={image.id} style={{ textAlign: 'center' }}>
                        <img src={assetUrl(image.url)} alt="maintenance" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10 }} />
                        <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>{image.comment || image.originalName || ''}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── إجراءات ما بعد الإكمال ── */}
          {(selectedReport.canSendFeedbackLink || selectedReport.canSubmitForApproval) && !selectedReport.canEditReport ? (
            <div className="card section" style={{ padding: 12, marginTop: 14, border: '2px solid var(--accent)', borderRadius: 12 }}>
              <strong>الإجراءات المتاحة</strong>
              <div className="form-actions" style={{ marginTop: 10 }}>
                {selectedReport.canSendFeedbackLink ? <button className="btn btn-soft" type="button" disabled={saving} onClick={createFeedbackLink}>إرسال رابط تقييم الزبون</button> : null}
                {selectedReport.canSubmitForApproval ? <button className="btn btn-primary" type="button" disabled={saving} onClick={submitForApproval}>طلب اعتماد من المدير</button> : null}
              </div>
            </div>
          ) : null}

          {feedbackResult ? (
            <div className="card section" style={{ padding: 12, marginTop: 14 }}>
              <strong>رابط تقييم الزبون</strong>
              <div style={{ marginTop: 8, wordBreak: 'break-all' }}>{feedbackResult.url}</div>
              {feedbackResult.whatsappUrl ? <button className="btn btn-soft" type="button" style={{ marginTop: 10 }} onClick={() => { const url = `https://wa.me/?text=${encodeURIComponent(feedbackResult.url || feedbackResult.whatsappUrl)}`; window.open(url, '_blank', 'noopener,noreferrer'); }}>إرساله عبر واتساب</button> : null}
            </div>
          ) : null}

          {selectedReport.canSubmitForApproval ? (
            <div className="card section" style={{ padding: 12, marginTop: 14 }}>
              <strong>إرسال للاعتماد</strong>
              <textarea className="input" rows={3} style={{ marginTop: 10 }} value={submissionNotes} onChange={(e) => setSubmissionNotes(e.target.value)} placeholder="ملاحظات اختيارية قبل إرسال التقرير للاعتماد" />
              <div className="form-actions"><button className="btn btn-primary" type="button" disabled={saving} onClick={submitForApproval}>إرسال للاعتماد</button></div>
            </div>
          ) : null}

          {selectedReport.canReview ? (
            <div className="card section" style={{ padding: 12, marginTop: 14 }}>
              <strong>اعتماد المدير المباشر</strong>
              <textarea className="input" rows={3} style={{ marginTop: 10 }} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="ملاحظات الاعتماد أو الرفض أو الإرجاع للتعديل" />
              <div className="form-actions">
                <button className="btn btn-primary" type="button" disabled={saving} onClick={() => managerReview('APPROVE')}>اعتماد</button>
                <button className="btn btn-soft" type="button" disabled={saving} onClick={() => managerReview('RETURN_FOR_EDIT')}>إرجاع للتعديل</button>
                <button className="btn btn-soft" type="button" disabled={saving} style={{ color: '#ff9b9b' }} onClick={() => managerReview('REJECT')}>رفض</button>
              </div>
              {selectedReport.canSendFeedbackLink ? (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--stroke)' }}>
                  <button className="btn btn-soft" type="button" disabled={saving} onClick={createFeedbackLink}>إرسال رابط تقييم الزبون</button>
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedReport.customerFeedback?.submittedAt ? (
            <div className="card section" style={{ padding: 12, marginTop: 14 }}>
              <strong>تقييم الزبون</strong>
              <div style={{ marginTop: 10 }}>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-soft)' }}>تقييم الشركة: </span>
                  <span style={{ fontSize: 20, color: '#f1c40f', letterSpacing: 2 }}>{renderStars(selectedReport.customerFeedback.companyRating)}</span>
                  <span style={{ color: 'var(--text-soft)', marginRight: 8 }}>({selectedReport.customerFeedback.companyRating}/5)</span>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-soft)' }}>تقييم الموظف: </span>
                  <span style={{ fontSize: 20, color: '#f1c40f', letterSpacing: 2 }}>{renderStars(selectedReport.customerFeedback.employeeRating)}</span>
                  <span style={{ color: 'var(--text-soft)', marginRight: 8 }}>({selectedReport.customerFeedback.employeeRating}/5)</span>
                </div>
                {selectedReport.customerFeedback.customerName ? <div style={{ marginTop: 8 }}>اسم الزبون: {selectedReport.customerFeedback.customerName}</div> : null}
                {selectedReport.customerFeedback.notes ? <div style={{ marginTop: 8 }}>الملاحظات: {selectedReport.customerFeedback.notes}</div> : null}
                {selectedReport.customerFeedback.suggestions ? <div style={{ marginTop: 8 }}>الاقتراحات: {selectedReport.customerFeedback.suggestions}</div> : null}
              </div>
            </div>
          ) : null}

          {selectedReport.workflowTrail?.length ? (
            <div className="card section" style={{ padding: 12, marginTop: 14 }}>
              <strong>سجل الإجراءات</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {selectedReport.workflowTrail.map((entry, index) => (
                  <div key={`${entry.action}-${entry.occurredAt}-${index}`} style={{ border: '1px solid var(--stroke)', borderRadius: 10, padding: 10 }}>
                    <div><strong>{entry.action}</strong> - {entry.actor?.fullName || entry.actorName || '-'}</div>
                    <div style={{ color: 'var(--text-soft)', fontSize: 13, marginTop: 4 }}>{entry.beforeStatusLabel || entry.beforeStatus || '-'} {'->'} {entry.afterStatusLabel || entry.afterStatus || '-'}</div>
                    {entry.notes ? <div style={{ marginTop: 4 }}>{entry.notes}</div> : null}
                    <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>{formatDateTime(entry.occurredAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-soft" type="button" onClick={() => downloadPdf(selectedReport)}>تحميل PDF</button>
            <button className="btn btn-soft" type="button" onClick={() => openWhatsapp(selectedReport)}>واتساب</button>
          </div>
        </section>
      ) : null}

      <section className="card section">
        <h2>قائمة تقارير الصيانة الدورية</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {reports.length ? reports.map((report) => (
            <article key={report.id} className="card section" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <strong>{report.requestNo}</strong>
                  <div style={{ color: 'var(--text-soft)', marginTop: 6 }}>{report.customerName} - {report.projectNumber}</div>
                  <div style={{ color: 'var(--text-soft)' }}>{report.assignedEmployee?.fullName || 'غير معيّن'} - {formatDateTime(report.updatedAt || report.createdAt)}</div>
                </div>
                <span className={`status-pill ${statusClassMap[report.status] || 'status-inprogress'}`}>{report.statusLabel}</span>
              </div>
              <div style={{ marginTop: 10, color: 'var(--text-soft)' }}>الموقع: {report.siteLocation}</div>
              <div style={{ marginTop: 6, color: 'var(--text-soft)' }}>النقاط: {report.points}</div>
              <div className="form-actions" style={{ marginTop: 12 }}>
                <button className="btn btn-soft" type="button" onClick={() => openReport(report.id)}>فتح</button>
                {report.canAccept ? <button className="btn btn-primary" type="button" disabled={saving} onClick={() => acceptReport(report.id)}>استلام الطلب</button> : null}
                <button className="btn btn-soft" type="button" onClick={() => downloadPdf(report)}>PDF</button>
                <button className="btn btn-soft" type="button" onClick={() => openWhatsapp(report)}>واتساب</button>
              </div>
            </article>
          )) : <p style={{ color: 'var(--text-soft)' }}>لا توجد تقارير مطابقة للفلاتر الحالية.</p>}
        </div>
      </section>
    </>
  );
}
