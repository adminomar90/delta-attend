'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission, hasPermission } from '../../../lib/permissions';
import {
  buildWorkReportApprovalPayload,
  buildWorkReportApprovalPointsMap,
  buildWorkReportAwardees,
  formatWorkReportPoints,
  summarizeWorkReportPointAwards,
} from '../../../lib/workReportPoints';
import { compressImage, formatFileSize } from '../../../lib/imageUtils';
import MaintenancePlanModal from '../../../components/maintenance/MaintenancePlanModal';
import ProgressGauge from '../../../components/ProgressGauge';
import { buildPlanDefaultsFromReport } from '../../../lib/maintenancePlans';

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

const resolveWorkReportDeepLink = (reportId) => {
  const id = String(reportId || '').trim();
  if (!id) {
    return '/work-reports';
  }

  if (typeof window === 'undefined') {
    return `/work-reports?reportId=${encodeURIComponent(id)}`;
  }

  return `${window.location.origin}/work-reports?reportId=${encodeURIComponent(id)}`;
};

const defaultForm = {
  projectName: '',
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

const toDateInputValue = (value) => {
  if (!value) {
    return todayIso();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return todayIso();
  }

  return date.toISOString().slice(0, 10);
};

const createWorkReportEditForm = (report) => ({
  projectName: report?.project?.name || report?.projectName || '',
  activityType: report?.activityType || '',
  title: report?.title || '',
  details: report?.details || '',
  progressPercent: Number(report?.progressPercent || 0),
  hoursSpent: Number(report?.hoursSpent || 0),
  workDate: toDateInputValue(report?.workDate || report?.createdAt),
  accomplishments: report?.accomplishments || '',
  challenges: report?.challenges || '',
  nextSteps: report?.nextSteps || '',
  participantCount: Number(report?.participantCount || report?.participants?.length || 0),
  participantIds: (report?.participants || [])
    .map((participant) => String(participant.user?._id || participant.user || ''))
    .filter(Boolean),
});

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

const buildMaintenancePlansByReportId = (plans = []) =>
  (plans || []).reduce((accumulator, plan) => {
    const workReportId = String(plan?.workReportId || '').trim();
    if (workReportId && !accumulator[workReportId]) {
      accumulator[workReportId] = plan;
    }
    return accumulator;
  }, {});

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
  const [approvalPointsByUser, setApprovalPointsByUser] = useState({});
  const [approvalComment, setApprovalComment] = useState('');
  const [detailMode, setDetailMode] = useState('view');
  const [managerEditForm, setManagerEditForm] = useState(defaultForm);
  const [managerEditPointsByUser, setManagerEditPointsByUser] = useState({});
  const [managerEditSaving, setManagerEditSaving] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionComment, setRejectionComment] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [directApprovingId, setDirectApprovingId] = useState('');
  const [directRejectingId, setDirectRejectingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [maintenancePlansByReportId, setMaintenancePlansByReportId] = useState({});
  const [maintenanceTechnicians, setMaintenanceTechnicians] = useState([]);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceTargetReport, setMaintenanceTargetReport] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const attachmentsRef = useRef([]);

  /* permissions */
  const canApprove = useMemo(() => {
    return hasAnyPermission(currentUser, [
      Permission.APPROVE_TASKS,
      Permission.VIEW_TEAM_WORK_REPORTS,
    ]);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canSendWhatsapp = useMemo(() => {
    return hasPermission(currentUser, Permission.SEND_REPORTS_WHATSAPP);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canActivateMaintenance = useMemo(() => {
    return hasPermission(currentUser, Permission.CREATE_MAINTENANCE_PLANS);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canOverrideDuplicatePlan = useMemo(() => {
    return hasPermission(currentUser, Permission.OVERRIDE_MAINTENANCE_PLAN_DUPLICATES);
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
        const projectName = (r.project?.name || r.projectName || '').toLowerCase();
        if (!name.includes(q) && !title.includes(q) && !projectName.includes(q)) return false;
      }
      return true;
    });
  }, [reports, filters]);

  const selectedReport = useMemo(() => {
    return reports.find((r) => r._id === selectedReportId) || null;
  }, [reports, selectedReportId]);

  const selectedReportOwnerId = useMemo(() => {
    return String(selectedReport?.user?._id || selectedReport?.user?.id || selectedReport?.user || '');
  }, [selectedReport]);

  const maintenanceTargetPlan = useMemo(() => {
    const reportId = String(maintenanceTargetReport?._id || maintenanceTargetReport?.id || '').trim();
    return reportId ? maintenancePlansByReportId[reportId] || null : null;
  }, [maintenancePlansByReportId, maintenanceTargetReport]);

  const participantCount = Math.max(0, Number(form.participantCount || 0));
  const participantSlots = Array.from({ length: participantCount }, (_, i) => i);

  const selectedAwardsSummary = useMemo(() => {
    if (!selectedReport) return null;
    return summarizeWorkReportPointAwards(selectedReport);
  }, [selectedReport]);

  const approvalAwardees = useMemo(() => {
    if (!selectedReport) return [];
    return buildWorkReportAwardees(selectedReport);
  }, [selectedReport]);

  const managerEditParticipantSlots = useMemo(
    () => Array.from({ length: Math.max(0, Number(managerEditForm.participantCount || 0)) }, (_, i) => i),
    [managerEditForm.participantCount],
  );

  const managerEditEmployeeOptions = useMemo(() => {
    return (employees || []).filter((employee) => {
      const employeeId = String(employee.id || employee._id || '');
      return employeeId && employeeId !== selectedReportOwnerId;
    });
  }, [employees, selectedReportOwnerId]);

  const managerEditAwardees = useMemo(() => {
    if (!selectedReport) return [];

    const participantIds = Array.from(
      { length: Math.max(0, Number(managerEditForm.participantCount || 0)) },
      (_, index) => String(managerEditForm.participantIds?.[index] || '').trim(),
    ).filter(Boolean);

    return buildWorkReportAwardees({
      ...selectedReport,
      participantCount: participantIds.length,
      participants: participantIds.map((participantId) => {
        const employee = (employees || []).find((item) => String(item.id || item._id || '') === participantId);
        return {
          user: participantId,
          fullName: employee?.fullName || 'مشارك',
          employeeCode: employee?.employeeCode || '',
        };
      }),
    });
  }, [employees, managerEditForm.participantCount, managerEditForm.participantIds, selectedReport]);

  const approvalTotalPoints = useMemo(
    () => Object.values(approvalPointsByUser || {}).reduce((sum, value) => {
      const parsed = Number(value);
      return sum + (Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0);
    }, 0),
    [approvalPointsByUser],
  );
  const approvalDistribution = useMemo(
    () => ({
      reporterPoints: approvalTotalPoints,
      participantPoints: 0,
      participantCount: approvalAwardees.filter((award) => award.distributionRole === 'PARTICIPANT').length,
    }),
    [approvalAwardees, approvalTotalPoints],
  );

  const managerEditTotalPoints = useMemo(
    () => Object.values(managerEditPointsByUser || {}).reduce((sum, value) => {
      const parsed = Number(value);
      return sum + (Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0);
    }, 0),
    [managerEditPointsByUser],
  );

  /* ── Data Loading ────────────────────────────────────────────────────────── */

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [projectsRes, reportsRes, employeesRes, maintenancePlansRes] = await Promise.all([
        api.get('/projects'),
        api.get('/work-reports'),
        api.get('/work-reports/employees'),
        canActivateMaintenance
          ? api.get('/maintenance-plans').catch(() => ({ plans: [] }))
          : Promise.resolve({ plans: [] }),
      ]);
      setProjects(projectsRes.projects || []);
      setReports(reportsRes.reports || []);
      setEmployees(employeesRes.employees || []);
      setMaintenancePlansByReportId(buildMaintenancePlansByReportId(maintenancePlansRes.plans || []));
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const reportId = new URLSearchParams(window.location.search).get('reportId');
    if (!reportId) {
      return;
    }

    const exists = reports.some((report) => String(report._id) === String(reportId));
    if (exists) {
      setSelectedReportId(String(reportId));
    }
  }, [reports]);

  const scrollToDetailPanel = () => {};

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

  const addAttachments = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;

    const currentCount = attachments.length;
    const remaining = Math.max(0, 50 - currentCount);
    if (!remaining) return;
    const selected = files.slice(0, remaining);

    // Create attachment items with 'compressing' status
    const newItems = selected.map((file) => ({
      id: makeAttachmentId(),
      file,
      originalSize: file.size,
      compressedSize: file.size,
      comment: '',
      previewUrl: window.URL.createObjectURL(file),
      status: 'compressing', // compressing | ready | uploading | done | error
      error: '',
    }));

    setAttachments((prev) => [...prev, ...newItems]);

    // Compress each image asynchronously
    for (const item of newItems) {
      try {
        const compressed = await compressImage(item.file);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? { ...a, file: compressed, compressedSize: compressed.size, status: 'ready' }
              : a,
          ),
        );
      } catch {
        setAttachments((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, status: 'ready' } : a)),
        );
      }
    }
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
    setIsUploading(false);
    setUploadProgress(0);
    setError('');
    setInfo('');
    let uploadStarted = false;
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

      if (!String(form.projectName || '').trim()) {
        throw new Error('\u064A\u0631\u062C\u0649 \u0643\u062A\u0627\u0628\u0629 \u0627\u0633\u0645 \u0627\u0644\u0645\u0634\u0631\u0648\u0639.');
      }

      // Wait for compression to finish
      const isCompressing = attachments.some((a) => a.status === 'compressing');
      if (isCompressing) {
        throw new Error('يرجى الانتظار حتى اكتمال ضغط الصور.');
      }

      const hasImages = attachments.length > 0;
      const BATCH_SIZE = 3;

      // ── Step 1: Create the report (text only, no images) ──
      const textPayload = new FormData();
      textPayload.append('projectName', form.projectName);
      textPayload.append('activityType', form.activityType);
      textPayload.append('title', form.title);
      textPayload.append('details', form.details);
      textPayload.append('progressPercent', String(form.progressPercent));
      textPayload.append('hoursSpent', String(form.hoursSpent));
      textPayload.append('workDate', form.workDate);
      textPayload.append('accomplishments', form.accomplishments);
      textPayload.append('challenges', form.challenges);
      textPayload.append('nextSteps', form.nextSteps);
      textPayload.append('participantCount', String(normalizedCount));
      textPayload.append('participantIds', JSON.stringify(participantIds));

      const createResponse = await api.post('/work-reports', textPayload);
      const reportId = createResponse?.report?._id;

      if (!reportId) {
        throw new Error('فشل إنشاء التقرير — لم يتم الحصول على معرّف التقرير.');
      }

      // ── Step 2: Upload images in batches of BATCH_SIZE ──
      if (hasImages) {
        uploadStarted = true;
        setIsUploading(true);
        setAttachments((prev) => prev.map((a) => ({ ...a, status: 'uploading', error: '' })));

        const totalImages = attachments.length;
        let uploadedCount = 0;

        for (let i = 0; i < totalImages; i += BATCH_SIZE) {
          const batchItems = attachments.slice(i, i + BATCH_SIZE);
          const batchPayload = new FormData();
          batchItems.forEach((item) => batchPayload.append('images', item.file));
          batchPayload.append('imageComments', JSON.stringify(batchItems.map((item) => item.comment || '')));

          await api.patchWithProgress(`/work-reports/${reportId}/images`, batchPayload, {
            onProgress: ({ percent }) => {
              const batchWeight = batchItems.length / totalImages;
              const baseProgress = (uploadedCount / totalImages) * 100;
              setUploadProgress(Math.round(baseProgress + percent * batchWeight));
            },
          });

          // Mark batch items as done
          const batchIds = new Set(batchItems.map((item) => item.id));
          setAttachments((prev) =>
            prev.map((a) => (batchIds.has(a.id) ? { ...a, status: 'done' } : a)),
          );
          uploadedCount += batchItems.length;
        }

        setUploadProgress(100);

        // ── Step 3: Regenerate PDF with all images included ──
        try {
          await api.post(`/work-reports/${reportId}/pdf/save`);
        } catch {
          // PDF will be regenerated on next access — not critical
        }
      }

      setInfo('تم إنشاء تقرير العمل بنجاح وإرساله للاعتماد.');
      resetForm();
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setError(err.message || 'فشل إنشاء تقرير العمل');
      if (uploadStarted) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.status === 'uploading' ? { ...a, status: 'error', error: err.message || 'فشل الرفع' } : a,
          ),
        );
      }
    } finally {
      setSaving(false);
      setIsUploading(false);
    }
  };

  const submitApproval = async () => {
    if (!selectedReport) return;
    setApproving(true);
    setError('');
    setInfo('');
    try {
      const payload = {
        pointsByUser: buildWorkReportApprovalPayload(
          {
            ...buildWorkReportApprovalPointsMap(selectedReport),
            ...(approvalPointsByUser || {}),
          },
        ),
      };
      if (String(approvalComment || '').trim()) {
        payload.managerComment = approvalComment;
      }

      await api.patch(`/work-reports/${selectedReport._id}/approve`, payload);
      setInfo('تم اعتماد التقرير وإضافة النقاط بنجاح.');
      setInlineAction(null);
      setApprovalPoints('');
      setApprovalPointsByUser({});
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
      const blob = await api.get(`/work-reports/${report._id}/pdf?regenerate=1`);
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
      const blob = await api.get(`/work-reports/${report._id}/pdf?regenerate=1`);
      const label = (report.employeeCode || report.user?.employeeCode || 'employee').replace(/[^\w-]/g, '');
      const fileName = `work-report-${label}-${String(report._id).slice(-6)}.pdf`;
      downloadBlob(blob, fileName);
      setInfo('تم حفظ ملف PDF للتقرير.');
    } catch (err) {
      setError(err.message || 'تعذر حفظ PDF للتقرير');
    }
  };

  const buildWorkReportWhatsappMessage = (report) => {
    const reportTitle = report.title || 'بدون عنوان';
    const employeeName = report.employeeName || report.user?.fullName || '-';
    const projectName = report.project?.name || report.projectName || '-';
    const statusLabel = statusLabelMap[report.status] || report.status;
    const isSubmitted = report.status === 'SUBMITTED';
    const reportLink = resolveWorkReportDeepLink(report._id);

    if (isSubmitted) {
      return [
        '[ تذكير اعتماد تقرير عمل - Delta Plus ]',
        '----------------------------------',
        'السلام عليكم،',
        'نرجو التفضل بمراجعة واعتماد تقرير العمل التالي:',
        `العنوان: ${reportTitle}`,
        `الموظف: ${employeeName}`,
        `المشروع: ${projectName}`,
        `نسبة الإنجاز: ${Number(report.progressPercent || 0)}%`,
        `ساعات العمل: ${Number(report.hoursSpent || 0)}`,
        `الحالة الحالية: ${statusLabel}`,
        `رابط التقرير: ${reportLink}`,
        '----------------------------------',
        'تم إرسال هذه الرسالة للمتابعة والتذكير بالاعتماد.',
        '[ صادر من نظام Delta Plus ]',
      ].join('\n');
    }

    return [
      '[ تقرير عمل - Delta Plus ]',
      '----------------------------------',
      `العنوان: ${reportTitle}`,
      `الموظف: ${employeeName}`,
      `المشروع: ${projectName}`,
      `الحالة: ${statusLabel}`,
      `نوع النشاط: ${report.activityType || '-'}`,
      `نسبة الإنجاز: ${Number(report.progressPercent || 0)}%`,
      `ساعات العمل: ${Number(report.hoursSpent || 0)}`,
      `رابط التقرير: ${reportLink}`,
      '----------------------------------',
      'يرجى مراجعة التقرير في أقرب وقت.',
      '[ صادر من نظام Delta Plus ]',
    ].join('\n');
  };

  const sendReportPdfToWhatsApp = (report) => {
    const lines = buildWorkReportWhatsappMessage(report);

    const url = `https://wa.me/?text=${encodeURIComponent(lines)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const resolveReportOwnerId = (report) => String(report?.user?._id || report?.user?.id || report?.user || '');

  const isOwnReport = (report) => {
    const ownerId = resolveReportOwnerId(report);
    return ownerId && ownerId === currentUserId;
  };

  const canShareReportViaWhatsapp = (report) => isOwnReport(report) || canSendWhatsapp;

  const closeSelectedReport = () => {
    setSelectedReportId('');
    setInlineAction(null);
    setDetailMode('view');
    setApprovalPoints('');
    setApprovalPointsByUser({});
    setApprovalComment('');
    setManagerEditForm(defaultForm);
    setManagerEditPointsByUser({});
    setRejectionReason('');
    setRejectionComment('');
  };

  const hydrateSelectedReportState = (report, nextInlineAction = null) => {
    setSelectedReportId(String(report._id));
    setInlineAction(nextInlineAction);
    setDetailMode('view');
    setApprovalPoints('');
    setApprovalPointsByUser(buildWorkReportApprovalPointsMap(report));
    setApprovalComment('');
    setManagerEditForm(createWorkReportEditForm(report));
    setManagerEditPointsByUser(buildWorkReportApprovalPointsMap(report));
    setRejectionReason('');
    setRejectionComment('');
  };

  const openMaintenanceModal = async (report) => {
    if (!report || !canActivateMaintenance) {
      return;
    }

    setMaintenanceTargetReport(report);
    setSelectedReportId(String(report._id));
    setInlineAction(null);
    setError('');
    setInfo('');

    try {
      if (!maintenanceTechnicians.length) {
        const response = await api.get('/maintenance-plans/technicians');
        setMaintenanceTechnicians(response.technicians || []);
      }
      setMaintenanceModalOpen(true);
    } catch (err) {
      setError(err.message || 'تعذر تحميل قائمة الفنيين');
    }
  };

  const activateMaintenancePlan = async (payload) => {
    if (!maintenanceTargetReport?._id) {
      return;
    }

    const existingPlan = maintenancePlansByReportId[String(maintenanceTargetReport._id)] || null;

    setMaintenanceSaving(true);
    setError('');
    setInfo('');
    try {
      await api.post('/maintenance-plans', {
        ...payload,
        workReportId: maintenanceTargetReport._id,
        ...(existingPlan && canOverrideDuplicatePlan ? { forceDuplicate: true } : {}),
      });
      const plansResponse = await api.get('/maintenance-plans');
      setMaintenancePlansByReportId(buildMaintenancePlansByReportId(plansResponse.plans || []));
      setMaintenanceModalOpen(false);
      setInfo('تم تفعيل الصيانة الدورية وربطها بتقرير العمل بنجاح.');
    } catch (err) {
      setError(err.message || 'تعذر تفعيل الصيانة الدورية');
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const directApproveReport = async (report) => {
    if (!report || report.status !== 'SUBMITTED' || isOwnReport(report) || !canApprove) {
      return;
    }

    setDirectApprovingId(String(report._id));
    setError('');
    setInfo('');
    try {
      setInfo('تم الاعتماد المباشر للتقرير بنجاح.');
      setSelectedReportId(String(report._id));
      setInfo('');
      setInlineAction('approve');
      setApprovalPoints('');
      setApprovalPointsByUser(buildWorkReportApprovalPointsMap(report));
      setApprovalComment('');
      setDetailMode('view');
      setManagerEditForm(createWorkReportEditForm(report));
      setManagerEditPointsByUser(buildWorkReportApprovalPointsMap(report));
      setRejectionReason('');
      setRejectionComment('');
      setInfo('تم فتح تفاصيل الاعتماد ويمكنك الآن توزيع النقاط يدويًا.');
      scrollToDetailPanel();
    } catch (err) {
      setError(err.message || 'فشل الاعتماد المباشر لتقرير العمل');
    } finally {
      setDirectApprovingId('');
    }
  };

  const directRejectReport = async (report) => {
    if (!report || report.status !== 'SUBMITTED' || isOwnReport(report) || !canApprove) {
      return;
    }
    setDirectRejectingId(String(report._id));
    setError('');
    setInfo('');
    try {
      await api.patch(`/work-reports/${report._id}/reject`, {
        reason: 'تم الرفض من المدير المباشر عبر زر الإجراءات',
        managerComment: '',
      });
      setInfo('تم رفض التقرير بنجاح.');
      setSelectedReportId(String(report._id));
      setInlineAction(null);
      setRejectionReason('');
      setRejectionComment('');
      await load();
    } catch (err) {
      setError(err.message || 'فشل رفض تقرير العمل');
    } finally {
      setDirectRejectingId('');
    }
  };

  const deleteReport = async (report) => {
    if (!report) return;
    const title = report.title || report.projectName || 'بدون عنوان';
    if (!window.confirm(`هل أنت متأكد من حذف التقرير "${title}"؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;

    setDeletingId(String(report._id));
    setError('');
    setInfo('');
    try {
      await api.delete(`/work-reports/${report._id}`);
      setInfo('تم حذف التقرير بنجاح.');
      if (selectedReportId === report._id) {
        setSelectedReportId('');
        setInlineAction(null);
      }
      await load();
    } catch (err) {
      setError(err.message || 'فشل حذف التقرير');
    } finally {
      setDeletingId('');
    }
  };

  const canDeleteReport = (report) => {
    if (!report) return false;
    const isOwner = isOwnReport(report);
    const isGM = currentUser?.role === 'GENERAL_MANAGER';
    if (report.status === 'APPROVED') return isGM;
    return isOwner || isGM;
  };

  const renderReportProgress = (pct) => <ProgressGauge value={pct} />;

  const renderReportActions = ({
    report,
    canDirectApprove,
    canWhatsapp,
    maintenancePlanInfo,
    canShowMaintenanceAction,
    mobile = false,
  }) => (
    <div className={`work-report-actions${mobile ? ' work-report-actions-mobile' : ''}`}>
      <button className="btn btn-soft" type="button" onClick={() => openDetails(report)}>
        تفاصيل
      </button>
      <button className="btn btn-soft" type="button" onClick={() => openReportPdf(report)}>
        PDF
      </button>
      {canDirectApprove ? (
        <>
          <button
            className="btn btn-soft"
            type="button"
            onClick={() => directApproveReport(report)}
            disabled={directApprovingId === String(report._id)}
          >
            {directApprovingId === String(report._id) ? 'جارٍ الاعتماد...' : 'اعتماد مباشر'}
          </button>
          <button
            className="btn btn-soft"
            type="button"
            style={{ color: 'var(--danger)' }}
            onClick={() => directRejectReport(report)}
            disabled={directRejectingId === String(report._id)}
          >
            {directRejectingId === String(report._id) ? 'جارٍ الرفض...' : 'رفض مباشر'}
          </button>
        </>
      ) : null}
      {canWhatsapp ? (
        <button className="btn btn-soft" type="button" onClick={() => sendReportPdfToWhatsApp(report)}>
          {report.status === 'SUBMITTED' ? 'تذكير واتساب' : 'إرسال واتساب'}
        </button>
      ) : null}
      {canShowMaintenanceAction ? (
        maintenancePlanInfo ? (
          <>
            <button className="btn btn-soft" type="button" disabled>
              تم تفعيل الصيانة الدورية
            </button>
            {canOverrideDuplicatePlan ? (
              <button className="btn btn-soft" type="button" onClick={() => openMaintenanceModal(report)}>
                إنشاء خطة إضافية
              </button>
            ) : null}
          </>
        ) : (
          <button className="btn btn-primary" type="button" onClick={() => openMaintenanceModal(report)}>
            تفعيل الصيانة الدورية
          </button>
        )
      ) : null}
      {canDeleteReport(report) ? (
        <button
          className="btn btn-soft"
          type="button"
          style={{ color: 'var(--danger)' }}
          onClick={() => deleteReport(report)}
          disabled={deletingId === String(report._id)}
        >
          {deletingId === String(report._id) ? 'جارٍ الحذف...' : 'حذف'}
        </button>
      ) : null}
    </div>
  );

  /* ── Detail Panel Helpers ────────────────────────────────────────────────── */

  const openDetails = (report) => {
    setSelectedReportId(report._id);
    setInlineAction(null);
    setApprovalPoints('');
    setApprovalPointsByUser(buildWorkReportApprovalPointsMap(report));
    setApprovalComment(report.managerComment || '');
    setDetailMode('view');
    setManagerEditForm(createWorkReportEditForm(report));
    setManagerEditPointsByUser(buildWorkReportApprovalPointsMap(report));
    setRejectionReason('');
    setRejectionComment('');
    scrollToDetailPanel();
  };

  const updateApprovalUserPoints = (userId, value) => {
    setApprovalPointsByUser((prev) => ({
      ...prev,
      [userId]: value,
    }));
  };

  const syncManagerEditParticipantCount = (value) => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
      setManagerEditForm((prev) => ({ ...prev, participantCount: '', participantIds: [] }));
      return;
    }

    const nextCount = Math.max(0, Math.min(100, Number(rawValue) || 0));
    setManagerEditForm((prev) => ({
      ...prev,
      participantCount: nextCount,
      participantIds: Array.from({ length: nextCount }, (_, index) => prev.participantIds?.[index] || ''),
    }));
  };

  const updateManagerEditParticipant = (index, value) => {
    setManagerEditForm((prev) => {
      const currentCount = Math.max(0, Number(prev.participantCount || 0));
      const nextIds = Array.from({ length: currentCount }, (_, i) => prev.participantIds?.[i] || '');
      nextIds[index] = value;
      return { ...prev, participantIds: nextIds };
    });
  };

  const updateManagerEditUserPoints = (userId, value) => {
    setManagerEditPointsByUser((prev) => ({
      ...prev,
      [userId]: value,
    }));
  };

  const cancelManagerEdit = () => {
    if (!selectedReport) {
      setDetailMode('view');
      return;
    }

    setDetailMode('view');
    setManagerEditForm(createWorkReportEditForm(selectedReport));
    setManagerEditPointsByUser(buildWorkReportApprovalPointsMap(selectedReport));
  };

  const canModerateSelected = useMemo(() => {
    if (!selectedReport || !canApprove) return false;
    const userId = resolveReportOwnerId(selectedReport);
    return userId !== currentUserId && selectedReport.status === 'SUBMITTED';
  }, [selectedReport, canApprove, currentUserId]);

  const canManagerEditSelected = useMemo(() => {
    if (!selectedReport || selectedReport.status !== 'APPROVED' || !canApprove) return false;
    const userId = resolveReportOwnerId(selectedReport);
    return userId !== currentUserId;
  }, [selectedReport, canApprove, currentUserId]);

  const submitManagerEdit = async () => {
    if (!selectedReport || !canManagerEditSelected) return;

    setManagerEditSaving(true);
    setError('');
    setInfo('');
    try {
      const payload = {
        projectName: managerEditForm.projectName,
        activityType: managerEditForm.activityType,
        title: managerEditForm.title,
        details: managerEditForm.details,
        progressPercent: managerEditForm.progressPercent,
        hoursSpent: managerEditForm.hoursSpent,
        workDate: managerEditForm.workDate,
        accomplishments: managerEditForm.accomplishments,
        challenges: managerEditForm.challenges,
        nextSteps: managerEditForm.nextSteps,
        participantCount: managerEditForm.participantCount,
        participantIds: Array.from(
          { length: Math.max(0, Number(managerEditForm.participantCount || 0)) },
          (_, index) => String(managerEditForm.participantIds?.[index] || '').trim(),
        ).filter(Boolean),
        managerComment: approvalComment,
        pointsByUser: buildWorkReportApprovalPayload(managerEditPointsByUser),
      };

      const response = await api.patch(`/work-reports/${selectedReport._id}/manager-edit`, payload);
      const updatedReport = response?.report || null;

      if (updatedReport?._id) {
        setReports((prev) => prev.map((report) => (report._id === updatedReport._id ? updatedReport : report)));
        setSelectedReportId(String(updatedReport._id));
        setManagerEditForm(createWorkReportEditForm(updatedReport));
        setManagerEditPointsByUser(buildWorkReportApprovalPointsMap(updatedReport));
        setApprovalPointsByUser(buildWorkReportApprovalPointsMap(updatedReport));
        setApprovalComment(updatedReport.managerComment || '');
      } else {
        await load();
      }

      setDetailMode('view');
      setInfo('تم حفظ تعديل التقرير المعتمد وتحديث النقاط بنجاح.');
    } catch (err) {
      setError(err.message || 'فشل حفظ تعديل التقرير المعتمد');
    } finally {
      setManagerEditSaving(false);
    }
  };

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
              {'\u0627\u0633\u0645 \u0627\u0644\u0645\u0634\u0631\u0648\u0639'}
              <input
                className="input"
                value={form.projectName}
                onChange={(e) => setForm((prev) => ({ ...prev, projectName: e.target.value }))}
                required
              />
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
                صور الأعمال
              </h3>
              <p style={{ marginTop: 4, color: 'var(--text-soft)', fontSize: 12 }}>
                يمكنك فتح كاميرا الموبايل مباشرة أو اختيار صور أو سحب وإفلات الصور هنا. يتم ضغط الصور تلقائيًا لتسريع الرفع.
              </p>

              {/* Drag & Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); addAttachments(e.dataTransfer.files); }}
                style={{
                  border: `2px dashed ${dragActive ? '#4d91ff' : 'var(--border)'}`,
                  borderRadius: 12,
                  padding: '20px 16px',
                  textAlign: 'center',
                  background: dragActive ? 'rgba(77,145,255,0.06)' : 'transparent',
                  marginBottom: 12,
                  marginTop: 8,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.4 }}>📷</div>
                <p style={{ color: 'var(--text-soft)', fontSize: 13, margin: '0 0 10px' }}>
                  اسحب الصور وأفلتها هنا أو استخدم الأزرار أدناه
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
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
                {attachments.length > 0 && (
                  <p style={{ marginTop: 8, fontSize: 12, color: '#4d91ff' }}>
                    {attachments.length} صورة مضافة
                  </p>
                )}
              </div>

              {/* ── Overall Upload Progress Bar ── */}
              {isUploading && (
                <div style={{ marginBottom: 14, background: '#0e1a34', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>جاري رفع الصور...</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#4d91ff' }}>{uploadProgress}%</span>
                  </div>
                  <div style={{ width: '100%', height: 10, borderRadius: 5, background: '#1e2d4d', overflow: 'hidden' }}>
                    <div style={{
                      width: `${uploadProgress}%`,
                      height: '100%',
                      borderRadius: 5,
                      background: uploadProgress >= 100 ? '#27ae60' : '#4d91ff',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              )}

              {/* ── Image Cards Grid ── */}
              {attachments.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: 14 }}>
                  {attachments.map((item) => {
                    const statusColor =
                      item.status === 'done' ? '#27ae60' :
                      item.status === 'error' ? '#c0392b' :
                      item.status === 'uploading' ? '#4d91ff' :
                      item.status === 'compressing' ? '#e67e22' :
                      'var(--text-soft)';

                    const statusLabel =
                      item.status === 'compressing' ? '⏳ جاري الضغط...' :
                      item.status === 'ready' ? '✓ جاهز للرفع' :
                      item.status === 'uploading' ? '↑ جاري الرفع...' :
                      item.status === 'done' ? '✓ تم الرفع بنجاح' :
                      item.status === 'error' ? '✕ فشل الرفع' : '';

                    return (
                      <article
                        key={item.id}
                        style={{
                          border: `1px solid ${item.status === 'error' ? '#c0392b' : item.status === 'done' ? '#27ae60' : 'var(--border)'}`,
                          borderRadius: 12,
                          padding: 12,
                          background: '#0e1a34',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {/* Image Preview */}
                        <div style={{
                          width: '100%',
                          height: 160,
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: '#0a1128',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid var(--border)',
                          marginBottom: 8,
                        }}>
                          <img
                            src={item.previewUrl}
                            alt="معاينة"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '100%',
                              objectFit: 'contain',
                            }}
                          />
                        </div>

                        {/* File Name */}
                        <div
                          title={item.file?.name}
                          style={{
                            fontSize: 12,
                            color: 'var(--text-soft)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginBottom: 4,
                            direction: 'ltr',
                            textAlign: 'right',
                          }}
                        >
                          {item.file?.name || 'صورة'}
                        </div>

                        {/* File Size */}
                        <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 4 }}>
                          الحجم: {formatFileSize(item.compressedSize || item.file?.size || 0)}
                          {item.originalSize && item.compressedSize && item.originalSize > item.compressedSize && (
                            <span style={{ color: '#27ae60', marginRight: 6 }}>
                              ({formatFileSize(item.originalSize)} ← مضغوط)
                            </span>
                          )}
                        </div>

                        {/* Upload Status */}
                        <div style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: statusColor,
                          marginBottom: 4,
                        }}>
                          {statusLabel}
                        </div>

                        {/* Per-Image Progress Bar */}
                        {item.status === 'uploading' && (
                          <div style={{ width: '100%', height: 5, borderRadius: 3, background: '#1e2d4d', overflow: 'hidden', marginBottom: 6 }}>
                            <div style={{
                              width: `${uploadProgress}%`,
                              height: '100%',
                              borderRadius: 3,
                              background: '#4d91ff',
                              transition: 'width 0.3s ease',
                            }} />
                          </div>
                        )}

                        {/* Compression Progress */}
                        {item.status === 'compressing' && (
                          <div style={{ width: '100%', height: 5, borderRadius: 3, background: '#1e2d4d', overflow: 'hidden', marginBottom: 6 }}>
                            <div style={{
                              width: '60%',
                              height: '100%',
                              borderRadius: 3,
                              background: '#e67e22',
                              animation: 'pulse 1.2s infinite',
                            }} />
                          </div>
                        )}

                        {/* Error message + Retry */}
                        {item.status === 'error' && (
                          <div style={{ fontSize: 11, color: '#c0392b', marginBottom: 4 }}>
                            {item.error || 'حدث خطأ أثناء الرفع'}
                          </div>
                        )}

                        {/* Comment Input */}
                        <input
                          className="input"
                          placeholder="تعليق على الصورة"
                          value={item.comment}
                          style={{ marginTop: 'auto', fontSize: 12 }}
                          onChange={(e) => updateAttachmentComment(item.id, e.target.value)}
                          disabled={isUploading}
                        />

                        {/* Delete Button */}
                        {!isUploading && (
                          <button
                            className="btn btn-soft"
                            type="button"
                            style={{
                              marginTop: 8,
                              width: '100%',
                              fontSize: 12,
                              color: '#c0392b',
                              borderColor: '#c0392b33',
                            }}
                            onClick={() => removeAttachment(item.id)}
                          >
                            🗑 حذف الصورة
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: 'var(--text-soft)' }}>لم يتم إضافة صور بعد.</p>
              )}
            </div>

            {/* ── Submit ── */}
            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving || isUploading || attachments.some((a) => a.status === 'compressing')}
              >
                {isUploading
                  ? `جاري رفع الصور... ${uploadProgress}%`
                  : saving
                    ? 'جارٍ إرسال التقرير...'
                    : attachments.some((a) => a.status === 'compressing')
                      ? 'جاري ضغط الصور...'
                      : 'إرسال التقرير للاعتماد'}
              </button>
              <button className="btn btn-soft" type="button" onClick={resetForm} disabled={saving || isUploading}>
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
          <>
            <div className="work-reports-table-shell">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>الموظف</th>
                    <th>المشروع</th>
                    <th>العنوان</th>
                    <th style={{ minWidth: 100, whiteSpace: 'nowrap' }}>تاريخ العمل</th>
                    <th style={{ minWidth: 120, whiteSpace: 'nowrap' }}>الإنجاز</th>
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
                    const canDirectApprove = canApprove && report.status === 'SUBMITTED' && !isOwnReport(report);
                    const canWhatsapp = canShareReportViaWhatsapp(report);
                    const maintenancePlanInfo = maintenancePlansByReportId[String(report._id)] || null;
                    const canShowMaintenanceAction = canActivateMaintenance
                      && (maintenancePlanInfo || (report.status === 'APPROVED' && pct === 100));

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
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(report.workDate || report.createdAt)}</td>
                        <td>{renderReportProgress(pct)}</td>
                        <td>{reportParticipantCount}</td>
                        <td>
                          <span className={`status-pill ${statusClassMap[report.status] || 'status-todo'}`}>
                            {statusLabelMap[report.status] || report.status}
                          </span>
                        </td>
                        <td>{formatWorkReportPoints(report.pointsAwarded || 0)}</td>
                        <td>
                          {renderReportActions({
                            report,
                            canDirectApprove,
                            canWhatsapp,
                            maintenancePlanInfo,
                            canShowMaintenanceAction,
                          })}
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
            </div>

            <div className="work-reports-mobile-list">
              {filteredReports.length ? filteredReports.map((report, idx) => {
                const isSelected = selectedReportId === report._id;
                const reportParticipantCount = Number(report.participantCount || report.participants?.length || 0);
                const pct = Number(report.progressPercent || 0);
                const canDirectApprove = canApprove && report.status === 'SUBMITTED' && !isOwnReport(report);
                const canWhatsapp = canShareReportViaWhatsapp(report);
                const maintenancePlanInfo = maintenancePlansByReportId[String(report._id)] || null;
                const canShowMaintenanceAction = canActivateMaintenance
                  && (maintenancePlanInfo || (report.status === 'APPROVED' && pct === 100));

                return (
                  <article
                    key={`${report._id}-mobile`}
                    className={`work-report-mobile-card${isSelected ? ' work-report-mobile-card-active' : ''}`}
                  >
                    <div className="work-report-mobile-head">
                      <div>
                        <strong>{report.title || 'بدون عنوان'}</strong>
                        <div className="work-report-mobile-subtitle">
                          {resolveReportNumber(report)} - {report.project?.name || report.projectName || '-'}
                        </div>
                        <div className="work-report-mobile-subtitle">
                          {report.employeeName || report.user?.fullName || '-'}
                        </div>
                      </div>
                      <span className={`status-pill ${statusClassMap[report.status] || 'status-todo'}`}>
                        {statusLabelMap[report.status] || report.status}
                      </span>
                    </div>

                    {renderReportProgress(pct)}

                    <div className="work-report-mobile-grid">
                      <div>
                        <span>التاريخ</span>
                        <strong>{formatDate(report.workDate || report.createdAt)}</strong>
                      </div>
                      <div>
                        <span>الكادر</span>
                        <strong>{reportParticipantCount}</strong>
                      </div>
                      <div>
                        <span>النقاط</span>
                        <strong>{formatWorkReportPoints(report.pointsAwarded || 0)}</strong>
                      </div>
                      <div>
                        <span>الترتيب</span>
                        <strong>#{idx + 1}</strong>
                      </div>
                    </div>

                    {renderReportActions({
                      report,
                      canDirectApprove,
                      canWhatsapp,
                      maintenancePlanInfo,
                      canShowMaintenanceAction,
                      mobile: true,
                    })}
                  </article>
                );
              }) : (
                <p className="work-report-mobile-empty">لا توجد تقارير عمل مطابقة.</p>
              )}
            </div>
          </>
        ) : null}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          Detail Panel
          ══════════════════════════════════════════════════════════════════════ */}
      {selectedReport ? (
        <div className="modal-backdrop" onClick={closeSelectedReport}>
        <section
          className="card section modal-panel daily-plan-modal-panel"
          style={{ width: 'min(100%, 1100px)', maxHeight: '90dvh' }}
          onClick={(event) => event.stopPropagation()}
        >
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
            <div className="work-report-detail-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="btn btn-soft" onClick={() => openReportPdf(selectedReport)}>
                عرض PDF
              </button>
              <button type="button" className="btn btn-soft" onClick={() => downloadReportPdf(selectedReport)}>
                حفظ PDF
              </button>
              {canShareReportViaWhatsapp(selectedReport) ? (
                <button type="button" className="btn btn-soft" onClick={() => sendReportPdfToWhatsApp(selectedReport)}>
                  {selectedReport.status === 'SUBMITTED' ? 'تذكير واتساب' : 'واتساب'}
                </button>
              ) : null}
              {canDeleteReport(selectedReport) ? (
                <button
                  type="button"
                  className="btn btn-soft"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => deleteReport(selectedReport)}
                  disabled={deletingId === String(selectedReport._id)}
                >
                  {deletingId === String(selectedReport._id) ? 'جارٍ الحذف...' : 'حذف التقرير'}
                </button>
              ) : null}
              {canManagerEditSelected ? (
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => {
                    if (detailMode === 'edit') {
                      cancelManagerEdit();
                      return;
                    }

                    setDetailMode('edit');
                    setManagerEditForm(createWorkReportEditForm(selectedReport));
                    setManagerEditPointsByUser(buildWorkReportApprovalPointsMap(selectedReport));
                    setApprovalComment(selectedReport.managerComment || '');
                  }}
                >
                  {detailMode === 'edit' ? 'إلغاء التعديل' : 'تعديل بعد الاعتماد'}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-soft"
                onClick={closeSelectedReport}
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
          {selectedReport.status === 'APPROVED' && selectedAwardsSummary ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>توزيع النقاط</h3>
              <div className="grid-3">
                <label>
                  نقاط كاتب التقرير
                  <input className="input" value={formatWorkReportPoints(selectedAwardsSummary.ownerPoints)} disabled />
                </label>
                <label>
                  نقاط كل مشارك
                  <input className="input" value={formatWorkReportPoints(selectedAwardsSummary.participantsTotalPoints)} disabled />
                </label>
                <label>
                  إجمالي نقاط المشاركين
                  <input className="input" value={formatWorkReportPoints(selectedAwardsSummary.totalPoints)} disabled />
                </label>
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {selectedAwardsSummary.pointAwards.map((award) => (
                  <div
                    key={`${selectedReport._id}-${award.userId}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 12px',
                      background: '#0e1a34',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <strong>{award.fullName || 'مستخدم'}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                        {award.distributionRole === 'REPORT_OWNER' ? 'صاحب التقرير / قائد الفريق' : 'مشارك'}
                        {award.employeeCode ? ` | ${award.employeeCode}` : ''}
                      </div>
                    </div>
                    <strong>{formatWorkReportPoints(award.pointsAwarded)} نقطة</strong>
                  </div>
                ))}
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
            <h3 style={{ marginBottom: 8 }}>الصور المرفقة ({(selectedReport.images || []).length})</h3>
            {(selectedReport.images || []).length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {(selectedReport.images || []).map((image, index) => (
                  <a
                    key={`${selectedReport._id}-img-${index}`}
                    href={resolveUploadUrl(image.publicUrl)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 8,
                      background: '#0e1a34',
                    }}>
                      <div style={{
                        width: '100%',
                        height: 120,
                        borderRadius: 6,
                        overflow: 'hidden',
                        background: '#0a1128',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--border)',
                        marginBottom: 6,
                      }}>
                        <img
                          src={resolveUploadUrl(image.publicUrl)}
                          alt={`صورة التقرير ${index + 1}`}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                          }}
                        />
                      </div>
                      {image.originalName && (
                        <div
                          title={image.originalName}
                          style={{ fontSize: 11, color: 'var(--text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr', textAlign: 'right' }}
                        >
                          {image.originalName}
                        </div>
                      )}
                      {image.size > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>
                          {formatFileSize(image.size)}
                        </div>
                      )}
                      {image.comment ? (
                        <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 6, padding: '4px 6px', background: '#0a1128', borderRadius: 6, border: '1px solid var(--border)' }}>
                          {image.comment}
                        </div>
                      ) : null}
                    </div>
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
          {canManagerEditSelected && detailMode === 'edit' ? (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <h3 style={{ margin: '0 0 10px' }}>تعديل التقرير المعتمد</h3>
              <div className="grid-3" style={{ gap: 12 }}>
                <label>
                  اسم المشروع
                  <input
                    className="input"
                    value={managerEditForm.projectName}
                    onChange={(e) => setManagerEditForm((prev) => ({ ...prev, projectName: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  نوع النشاط
                  <input
                    className="input"
                    value={managerEditForm.activityType}
                    onChange={(e) => setManagerEditForm((prev) => ({ ...prev, activityType: e.target.value }))}
                  />
                </label>
                <label>
                  عنوان التقرير
                  <input
                    className="input"
                    value={managerEditForm.title}
                    onChange={(e) => setManagerEditForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </label>
                <label>
                  تاريخ العمل
                  <input
                    className="input"
                    type="date"
                    value={managerEditForm.workDate}
                    onChange={(e) => setManagerEditForm((prev) => ({ ...prev, workDate: e.target.value }))}
                  />
                </label>
                <label>
                  نسبة الإنجاز (%)
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    value={managerEditForm.progressPercent}
                    onChange={(e) => setManagerEditForm((prev) => ({ ...prev, progressPercent: e.target.value }))}
                  />
                </label>
                <label>
                  ساعات العمل
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={managerEditForm.hoursSpent}
                    onChange={(e) => setManagerEditForm((prev) => ({ ...prev, hoursSpent: e.target.value }))}
                  />
                </label>
                <label>
                  عدد الكادر المشارك
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={Math.max(0, managerEditEmployeeOptions.length)}
                    value={managerEditForm.participantCount}
                    onChange={(e) => syncManagerEditParticipantCount(e.target.value)}
                  />
                </label>
                <label className="grid-span-full">
                  تعليق المدير
                  <input
                    className="input"
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                  />
                </label>
                <label className="grid-span-full">
                  تفاصيل العمل
                  <textarea
                    className="textarea"
                    rows={4}
                    value={managerEditForm.details}
                    onChange={(e) => setManagerEditForm((prev) => ({ ...prev, details: e.target.value }))}
                    required
                  />
                </label>
                <label className="grid-span-full">
                  ما تم إنجازه
                  <textarea
                    className="textarea"
                    rows={3}
                    value={managerEditForm.accomplishments}
                    onChange={(e) => setManagerEditForm((prev) => ({ ...prev, accomplishments: e.target.value }))}
                  />
                </label>
                <label className="grid-span-full">
                  التحديات والمشاكل
                  <textarea
                    className="textarea"
                    rows={3}
                    value={managerEditForm.challenges}
                    onChange={(e) => setManagerEditForm((prev) => ({ ...prev, challenges: e.target.value }))}
                  />
                </label>
                <label className="grid-span-full">
                  الخطوات القادمة
                  <textarea
                    className="textarea"
                    rows={3}
                    value={managerEditForm.nextSteps}
                    onChange={(e) => setManagerEditForm((prev) => ({ ...prev, nextSteps: e.target.value }))}
                  />
                </label>
              </div>

              {managerEditParticipantSlots.length ? (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ margin: '0 0 10px' }}>المشاركون</h4>
                  <div className="grid-3" style={{ gap: 12 }}>
                    {managerEditParticipantSlots.map((slotIndex) => {
                      const otherSelections = new Set(
                        (managerEditForm.participantIds || [])
                          .filter((_, currentIndex) => currentIndex !== slotIndex)
                          .filter(Boolean),
                      );

                      return (
                        <label key={`manager-participant-${slotIndex}`}>
                          المشارك {slotIndex + 1}
                          <select
                            className="select"
                            value={managerEditForm.participantIds?.[slotIndex] || ''}
                            onChange={(e) => updateManagerEditParticipant(slotIndex, e.target.value)}
                            required
                          >
                            <option value="">اختر الموظف</option>
                            {managerEditEmployeeOptions.map((employee) => {
                              const employeeId = String(employee.id || employee._id || '');
                              const employeeCode = employee.employeeCode ? ` - ${employee.employeeCode}` : '';
                              return (
                                <option key={employeeId} value={employeeId} disabled={otherSelections.has(employeeId)}>
                                  {employee.fullName}{employeeCode}
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

              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: '#0e1a34',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>النقاط المحدثة</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                      يمكن للمدير تعديل نقاط صاحب التقرير والمشاركين ثم إعادة الحفظ.
                    </div>
                  </div>
                  <strong>{formatWorkReportPoints(managerEditTotalPoints)} نقطة</strong>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {managerEditAwardees.map((awardee) => (
                    <div
                      key={`${selectedReport._id}-${awardee.userId}-manager-edit`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      <div>
                        <strong>{awardee.fullName || 'مستخدم'}</strong>
                        <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                          {awardee.distributionRole === 'REPORT_OWNER' ? 'صاحب التقرير / قائد الفريق' : 'مشارك'}
                          {awardee.employeeCode ? ` | ${awardee.employeeCode}` : ''}
                        </div>
                      </div>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        max={1000}
                        value={managerEditPointsByUser?.[awardee.userId] ?? ''}
                        onChange={(e) => updateManagerEditUserPoints(awardee.userId, e.target.value)}
                        style={{ width: 120 }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={managerEditSaving}
                  onClick={submitManagerEdit}
                >
                  {managerEditSaving ? 'جارٍ حفظ التعديل...' : 'حفظ التعديل'}
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={managerEditSaving}
                  onClick={cancelManagerEdit}
                >
                  إلغاء
                </button>
              </div>
            </div>
          ) : null}

          {canModerateSelected ? (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              {!inlineAction ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setApprovalPoints('');
                      setApprovalPointsByUser(buildWorkReportApprovalPointsMap(selectedReport));
                      setApprovalComment('');
                      setInlineAction('approve');
                    }}
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
                <div
                  style={{
                    display: 'grid',
                    gap: 10,
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: '#0e1a34',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong>النقاط اليدوية للكادر</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                        امنح كل مشارك وصاحب التقرير / قائد الفريق نقاطه بشكل مستقل.
                      </div>
                    </div>
                    <strong>{formatWorkReportPoints(approvalTotalPoints)} نقطة</strong>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {approvalAwardees.map((awardee) => (
                      <div
                        key={`${selectedReport._id}-${awardee.userId}-approval`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          padding: '10px 12px',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                        }}
                      >
                        <div>
                          <strong>{awardee.fullName || 'مستخدم'}</strong>
                          <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                            {awardee.distributionRole === 'REPORT_OWNER' ? 'صاحب التقرير / قائد الفريق' : 'مشارك'}
                            {awardee.employeeCode ? ` | ${awardee.employeeCode}` : ''}
                          </div>
                        </div>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={1000}
                          value={approvalPointsByUser?.[awardee.userId] ?? ''}
                          onChange={(e) => updateApprovalUserPoints(awardee.userId, e.target.value)}
                          style={{ width: 120 }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid-3" style={{ display: 'none', gap: 10 }}>
                    <label>
                      إجمالي نقاط التقرير (اختياري)
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
                      disabled={approving}
                      onClick={submitApproval}
                    >
                      {approving ? 'جارٍ الاعتماد...' : 'تأكيد الاعتماد'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-soft"
                      disabled={approving}
                      onClick={() => { setInlineAction(null); setApprovalPoints(''); setApprovalPointsByUser({}); setApprovalComment(''); }}
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
        </div>
      ) : null}

      <MaintenancePlanModal
        open={maintenanceModalOpen}
        title={maintenanceTargetPlan && canOverrideDuplicatePlan ? 'إنشاء خطة صيانة إضافية' : 'تفعيل الصيانة الدورية'}
        subtitle={maintenanceTargetReport ? `${maintenanceTargetReport.project?.name || maintenanceTargetReport.projectName || 'بدون مشروع'} - ${maintenanceTargetReport.employeeName || maintenanceTargetReport.user?.fullName || '-'}` : ''}
        initialForm={buildPlanDefaultsFromReport(maintenanceTargetReport || {})}
        technicians={maintenanceTechnicians}
        saving={maintenanceSaving}
        onClose={() => {
          setMaintenanceModalOpen(false);
          setMaintenanceTargetReport(null);
        }}
        onSubmit={activateMaintenancePlan}
      />
    </>
  );
}
