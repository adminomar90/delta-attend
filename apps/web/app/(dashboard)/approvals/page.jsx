'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission, hasPermission } from '../../../lib/permissions';
import {
  calculateWorkReportDistribution,
  formatWorkReportPoints,
} from '../../../lib/workReportPoints';

const roleLabelMap = {
  GENERAL_MANAGER: 'مدير عام',
  HR_MANAGER: 'مدير موارد بشرية',
  FINANCIAL_MANAGER: 'مدير مالي',
  PROJECT_MANAGER: 'مدير مشروع',
  ASSISTANT_PROJECT_MANAGER: 'مساعد مدير مشروع',
  TEAM_LEAD: 'قائد فريق',
  TECHNICAL_STAFF: 'موظف تقني',
  SERVICE_STAFF: 'موظف خدمات',
};

const projectStatusLabelMap = {
  PENDING_APPROVAL: 'قيد الموافقة',
  ACTIVE: 'نشط',
  ON_HOLD: 'معلق',
  DONE: 'مكتمل',
  REJECTED: 'مرفوض',
};

const reportStatusLabelMap = {
  SUBMITTED: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};

const attendanceApprovalStatusLabelMap = {
  PENDING: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};

const resolveMapUrl = (location) => {
  if (!location?.latitude || !location?.longitude) {
    return '';
  }
  return `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
};

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('ar-IQ');
};

export default function ApprovalsPage() {
  const router = useRouter();
  const currentUser = authStorage.getUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [workReports, setWorkReports] = useState([]);
  const [attendanceItems, setAttendanceItems] = useState([]);
  const [materialRequests, setMaterialRequests] = useState([]);
  const [materialReconciliations, setMaterialReconciliations] = useState([]);
  const [taskForm, setTaskForm] = useState({});
  const [projectForm, setProjectForm] = useState({});
  const [workReportForm, setWorkReportForm] = useState({});
  const [attendanceForm, setAttendanceForm] = useState({});
  const [materialForm, setMaterialForm] = useState({});

  const canAccess = useMemo(() => {
    return hasAnyPermission(currentUser, [
      Permission.APPROVE_TASKS,
      Permission.APPROVE_PROJECTS,
      Permission.REVIEW_MATERIAL_REQUESTS,
    ]);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canApproveTasks = useMemo(() => {
    return hasPermission(currentUser, Permission.APPROVE_TASKS);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canApproveProjects = useMemo(() => {
    return hasPermission(currentUser, Permission.APPROVE_PROJECTS);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canApproveMaterials = useMemo(() => {
    return hasPermission(currentUser, Permission.REVIEW_MATERIAL_REQUESTS);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canViewApprovalHistory = useMemo(() => {
    return hasPermission(currentUser, Permission.VIEW_APPROVAL_HISTORY);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const load = async () => {
    setLoading(true);
    setError('');
    setInfo('');

    try {
      const [tasksRes, projectsRes, reportsRes, attendanceRes, materialRequestsRes, materialReconRes] = await Promise.all([
        api.get('/tasks?status=SUBMITTED').catch((e) => { console.warn('tasks fetch failed', e.message); return { tasks: [] }; }),
        api.get('/projects?status=PENDING_APPROVAL').catch((e) => { console.warn('projects fetch failed', e.message); return { projects: [] }; }),
        api.get('/work-reports?status=SUBMITTED').catch((e) => { console.warn('work-reports fetch failed', e.message); return { reports: [] }; }),
        api.get('/attendance/approvals/pending').catch((e) => { console.warn('attendance fetch failed', e.message); return { items: [] }; }),
        api.get('/materials/approvals/requests/pending').catch((e) => { console.warn('material-requests fetch failed', e.message); return { requests: [] }; }),
        api.get('/materials/approvals/reconciliations/pending').catch((e) => { console.warn('material-reconciliations fetch failed', e.message); return { reconciliations: [] }; }),
      ]);

      setTasks(tasksRes.tasks || []);
      setProjects(projectsRes.projects || []);
      setWorkReports(reportsRes.reports || []);
      setAttendanceItems(attendanceRes.items || []);
      setMaterialRequests(materialRequestsRes.requests || []);
      setMaterialReconciliations(materialReconRes.reconciliations || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل بيانات الاعتمادات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess) {
      console.warn('Approvals: canAccess=false, role=', currentUser?.role, 'perms=', canApproveTasks, canApproveProjects, canApproveMaterials);
      return;
    }
    load();
  }, [canAccess]);

  const getTaskInput = (taskId) => {
    return taskForm[taskId] || {
      points: '',
      qualityScore: 4,
      note: '',
      rejectionReason: '',
    };
  };

  const setTaskInput = (taskId, patch) => {
    setTaskForm((prev) => ({
      ...prev,
      [taskId]: {
        ...getTaskInput(taskId),
        ...patch,
      },
    }));
  };

  const approveTask = async (task) => {
    const input = getTaskInput(task._id);
    setError('');
    setInfo('');
    try {
      await api.patch(`/tasks/${task._id}/approve`, {
        qualityScore: Number(input.qualityScore || 3),
        note: input.note || '',
        points: input.points === '' ? undefined : Number(input.points),
      });
      setTasks((prev) => prev.filter((t) => t._id !== task._id));
      setInfo(`تم اعتماد المهمة: ${task.title} — تم نقلها إلى سجل الاعتمادات.`);
    } catch (err) {
      setError(err.message || 'فشل اعتماد المهمة');
    }
  };

  const rejectTask = async (task) => {
    const input = getTaskInput(task._id);
    if (!input.rejectionReason?.trim()) {
      setError('يرجى إدخال سبب رفض المهمة');
      return;
    }
    setError('');
    setInfo('');
    try {
      await api.patch(`/tasks/${task._id}/status`, {
        status: 'REJECTED',
        rejectionReason: input.rejectionReason,
      });
      setTasks((prev) => prev.filter((t) => t._id !== task._id));
      setInfo(`تم رفض المهمة: ${task.title}`);
    } catch (err) {
      setError(err.message || 'فشل رفض المهمة');
    }
  };

  const getProjectInput = (projectId) => {
    return projectForm[projectId] || {
      points: '',
      comment: '',
      reason: '',
    };
  };

  const setProjectInput = (projectId, patch) => {
    setProjectForm((prev) => ({
      ...prev,
      [projectId]: {
        ...getProjectInput(projectId),
        ...patch,
      },
    }));
  };

  const approveProject = async (project) => {
    const input = getProjectInput(project._id);
    setError('');
    setInfo('');
    try {
      await api.patch(`/projects/${project._id}/approve`, {
        comment: input.comment || '',
        points: input.points === '' ? 0 : Number(input.points),
      });
      setProjects((prev) => prev.filter((p) => p._id !== project._id));
      setInfo(`تم اعتماد مرحلة من المشروع: ${project.name} — تم نقلها إلى سجل الاعتمادات.`);
    } catch (err) {
      setError(err.message || 'فشل اعتماد المشروع');
    }
  };

  const rejectProject = async (project) => {
    const input = getProjectInput(project._id);
    if (!input.reason?.trim()) {
      setError('يرجى إدخال سبب رفض المشروع');
      return;
    }
    setError('');
    setInfo('');
    try {
      await api.patch(`/projects/${project._id}/reject`, {
        reason: input.reason,
      });
      setProjects((prev) => prev.filter((p) => p._id !== project._id));
      setInfo(`تم رفض المشروع: ${project.name}`);
    } catch (err) {
      setError(err.message || 'فشل رفض المشروع');
    }
  };

  const getWorkReportInput = (reportId) => {
    return workReportForm[reportId] || {
      points: '',
      managerComment: '',
      reason: '',
    };
  };

  const setWorkReportInput = (reportId, patch) => {
    setWorkReportForm((prev) => ({
      ...prev,
      [reportId]: {
        ...getWorkReportInput(reportId),
        ...patch,
      },
    }));
  };

  const approveWorkReport = async (report) => {
    const ownerId = String(report.user?._id || report.user?.id || report.user || '');
    if (ownerId && ownerId === String(currentUser?.id || '')) {
      setError('لا يمكنك اعتماد تقرير العمل الخاص بك.');
      return;
    }

    const input = getWorkReportInput(report._id);
    if (input.points === '') {
      setError('يرجى إدخال إجمالي نقاط تقرير العمل');
      return;
    }
    setError('');
    setInfo('');
    try {
      await api.patch(`/work-reports/${report._id}/approve`, {
        points: Number(input.points),
        managerComment: input.managerComment || '',
      });
      setWorkReports((prev) => prev.filter((r) => r._id !== report._id));
      setInfo(`تم اعتماد تقرير العمل للموظف: ${report.employeeName} — تم نقله إلى سجل الاعتمادات والتقارير المنجزة.`);
    } catch (err) {
      setError(err.message || 'فشل اعتماد تقرير العمل');
    }
  };

  const rejectWorkReport = async (report) => {
    const ownerId = String(report.user?._id || report.user?.id || report.user || '');
    if (ownerId && ownerId === String(currentUser?.id || '')) {
      setError('لا يمكنك رفض تقرير العمل الخاص بك.');
      return;
    }

    const input = getWorkReportInput(report._id);
    if (!input.reason?.trim()) {
      setError('يرجى إدخال سبب رفض تقرير العمل');
      return;
    }
    setError('');
    setInfo('');
    try {
      await api.patch(`/work-reports/${report._id}/reject`, {
        reason: input.reason,
        managerComment: input.managerComment || '',
      });
      setWorkReports((prev) => prev.filter((r) => r._id !== report._id));
      setInfo(`تم رفض تقرير العمل للموظف: ${report.employeeName}`);
    } catch (err) {
      setError(err.message || 'فشل رفض تقرير العمل');
    }
  };

  const getAttendanceInput = (attendanceId) => {
    return attendanceForm[attendanceId] || {
      points: '',
      approvalNote: '',
      reason: '',
    };
  };

  const setAttendanceInput = (attendanceId, patch) => {
    setAttendanceForm((prev) => ({
      ...prev,
      [attendanceId]: {
        ...getAttendanceInput(attendanceId),
        ...patch,
      },
    }));
  };

  const approveAttendance = async (item) => {
    const input = getAttendanceInput(item.id);
    setError('');
    setInfo('');
    try {
      await api.patch(`/attendance/${item.id}/approve`, {
        points: input.points === '' ? 0 : Number(input.points),
        approvalNote: input.approvalNote || '',
      });
      setAttendanceItems((prev) => prev.filter((a) => a.id !== item.id));
      setInfo(`تم اعتماد حضور/انصراف الموظف: ${item.employeeName} — تم نقله إلى سجل الاعتمادات.`);
    } catch (err) {
      setError(err.message || 'فشل اعتماد الحضور والانصراف');
    }
  };

  const rejectAttendance = async (item) => {
    const input = getAttendanceInput(item.id);
    if (!input.reason?.trim()) {
      setError('يرجى إدخال سبب رفض الحضور/الانصراف');
      return;
    }
    setError('');
    setInfo('');
    try {
      await api.patch(`/attendance/${item.id}/reject`, {
        reason: input.reason,
        approvalNote: input.approvalNote || '',
      });
      setAttendanceItems((prev) => prev.filter((a) => a.id !== item.id));
      setInfo(`تم رفض حضور/انصراف الموظف: ${item.employeeName}`);
    } catch (err) {
      setError(err.message || 'فشل رفض الحضور والانصراف');
    }
  };

  const getMaterialInput = (id) => {
    return materialForm[id] || {
      notes: '',
      points: '',
    };
  };

  const setMaterialInput = (id, patch) => {
    setMaterialForm((prev) => ({
      ...prev,
      [id]: {
        ...getMaterialInput(id),
        ...patch,
      },
    }));
  };

  const approveMaterialRequest = async (request) => {
    const input = getMaterialInput(request._id);
    setError('');
    setInfo('');

    try {
      await api.patch(`/materials/requests/${request._id}/review`, {
        action: 'APPROVE_FULL',
        notes: input.notes || '',
      });
      setMaterialRequests((prev) => prev.filter((r) => r._id !== request._id));
      setInfo(`تم اعتماد طلب المواد: ${request.requestNo} — تم نقله إلى سجل الاعتمادات.`);
    } catch (err) {
      setError(err.message || 'فشل اعتماد طلب المواد');
    }
  };

  const rejectMaterialRequest = async (request) => {
    const input = getMaterialInput(request._id);
    if (!input.notes?.trim()) {
      setError('يرجى إدخال سبب رفض طلب المواد');
      return;
    }

    setError('');
    setInfo('');
    try {
      await api.patch(`/materials/requests/${request._id}/review`, {
        action: 'REJECT',
        notes: input.notes,
      });
      setMaterialRequests((prev) => prev.filter((r) => r._id !== request._id));
      setInfo(`تم رفض طلب المواد: ${request.requestNo}`);
    } catch (err) {
      setError(err.message || 'فشل رفض طلب المواد');
    }
  };

  const approveMaterialReconciliation = async (reconciliation) => {
    const input = getMaterialInput(reconciliation._id);
    setError('');
    setInfo('');
    try {
      await api.patch(`/materials/reconciliations/${reconciliation._id}/review`, {
        action: 'APPROVE',
        points: input.points === '' ? 0 : Number(input.points),
        reviewNotes: input.notes || '',
      });
      setMaterialReconciliations((prev) => prev.filter((r) => r._id !== reconciliation._id));
      setInfo(`تم اعتماد تصفية المواد: ${reconciliation.reconcileNo} — تم نقله إلى سجل الاعتمادات.`);
    } catch (err) {
      setError(err.message || 'فشل اعتماد تصفية المواد');
    }
  };

  const rejectMaterialReconciliation = async (reconciliation) => {
    const input = getMaterialInput(reconciliation._id);
    if (!input.notes?.trim()) {
      setError('يرجى إدخال سبب رفض تصفية المواد');
      return;
    }

    setError('');
    setInfo('');
    try {
      await api.patch(`/materials/reconciliations/${reconciliation._id}/review`, {
        action: 'REJECT',
        reviewNotes: input.notes,
      });
      setMaterialReconciliations((prev) => prev.filter((r) => r._id !== reconciliation._id));
      setInfo(`تم رفض تصفية المواد: ${reconciliation.reconcileNo}`);
    } catch (err) {
      setError(err.message || 'فشل رفض تصفية المواد');
    }
  };

  if (!canAccess) {
    return (
      <section className="card section" style={{ color: 'var(--text-soft)' }}>
        لا تملك صلاحية الوصول إلى صفحة الاعتمادات.
      </section>
    );
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: '#9bc8ff' }}>{info}</section> : null}

      {canViewApprovalHistory ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <div className="section-header">
            <div>
              <h2 style={{ margin: 0 }}>سجل الاعتمادات</h2>
              <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
                السجلات المعتمدة بالكامل أصبحت تظهر في الأرشيف بدل قائمة الاعتمادات الحالية.
              </p>
            </div>
            <button type="button" className="btn btn-soft" onClick={() => router.push('/approval-history')}>
              فتح السجل
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid-4" style={{ marginBottom: 16 }}>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>المهام بانتظار الاعتماد</p>
          <h2>{tasks.length}</h2>
        </article>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>المشاريع بانتظار الاعتماد</p>
          <h2>{projects.length}</h2>
        </article>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>تقارير العمل بانتظار الاعتماد</p>
          <h2>{workReports.length}</h2>
        </article>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>حضور/انصراف بانتظار الاعتماد</p>
          <h2>{attendanceItems.length}</h2>
        </article>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>طلبات مواد بانتظار الاعتماد</p>
          <h2>{materialRequests.length}</h2>
        </article>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>تصفيات مواد بانتظار الاعتماد</p>
          <h2>{materialReconciliations.length}</h2>
        </article>
      </section>

      <section className="card section" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>اعتمادات المهام</h2>
          <button type="button" className="btn btn-soft" onClick={load} disabled={loading}>
            {loading ? 'جارٍ التحديث...' : 'تحديث'}
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>المهمة</th>
              <th>الموظف</th>
              <th>المشروع</th>
              <th>نقاط</th>
              <th>جودة</th>
              <th>ملاحظة</th>
              <th>سبب الرفض</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length ? tasks.map((task) => {
              const input = getTaskInput(task._id);
              return (
                <tr key={task._id}>
                  <td>
                    <strong>{task.title}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>{task.description || '-'}</div>
                  </td>
                  <td>{task.assignee?.fullName || '-'}</td>
                  <td>{task.project?.name || '-'}</td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={1000}
                      value={input.points}
                      onChange={(e) => setTaskInput(task._id, { points: e.target.value })}
                      style={{ width: 100 }}
                      placeholder="تلقائي"
                      disabled={!canApproveTasks}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={5}
                      value={input.qualityScore}
                      onChange={(e) => setTaskInput(task._id, { qualityScore: e.target.value })}
                      style={{ width: 70 }}
                      disabled={!canApproveTasks}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={input.note}
                      onChange={(e) => setTaskInput(task._id, { note: e.target.value })}
                      disabled={!canApproveTasks}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={input.rejectionReason}
                      onChange={(e) => setTaskInput(task._id, { rejectionReason: e.target.value })}
                      disabled={!canApproveTasks}
                    />
                  </td>
                  <td>
                    {canApproveTasks ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button type="button" className="btn btn-soft" onClick={() => approveTask(task)}>اعتماد</button>
                        <button type="button" className="btn btn-soft" onClick={() => rejectTask(task)}>رفض</button>
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={8} style={{ color: 'var(--text-soft)' }}>لا توجد مهام بانتظار الاعتماد.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card section" style={{ marginBottom: 16 }}>
        <h2>اعتمادات المشاريع حسب الدور</h2>
        <table className="table">
          <thead>
            <tr>
              <th>المشروع</th>
              <th>المالك</th>
              <th>الأدوار المطلوبة</th>
              <th>الحالة</th>
              <th>نقاط</th>
              <th>تعليق</th>
              <th>سبب الرفض</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {projects.length ? projects.map((project) => {
              const input = getProjectInput(project._id);
              return (
                <tr key={project._id}>
                  <td>
                    <strong>{project.name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>{project.code}</div>
                  </td>
                  <td>{project.owner?.fullName || '-'}</td>
                  <td>
                    {(project.requiredApprovalRoles || []).map((item) => roleLabelMap[item] || item).join(' | ') || '-'}
                  </td>
                  <td>{projectStatusLabelMap[project.status] || project.status}</td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={1000}
                      value={input.points}
                      onChange={(e) => setProjectInput(project._id, { points: e.target.value })}
                      style={{ width: 100 }}
                      placeholder="اختياري"
                      disabled={!canApproveProjects}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={input.comment}
                      onChange={(e) => setProjectInput(project._id, { comment: e.target.value })}
                      disabled={!canApproveProjects}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={input.reason}
                      onChange={(e) => setProjectInput(project._id, { reason: e.target.value })}
                      disabled={!canApproveProjects}
                    />
                  </td>
                  <td>
                    {canApproveProjects ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button type="button" className="btn btn-soft" onClick={() => approveProject(project)}>اعتماد</button>
                        <button type="button" className="btn btn-soft" onClick={() => rejectProject(project)}>رفض</button>
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={8} style={{ color: 'var(--text-soft)' }}>لا توجد مشاريع بانتظار الاعتماد.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card section" style={{ marginBottom: 16 }}>
        <h2>اعتمادات تقارير العمل</h2>
        <table className="table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>المشروع</th>
              <th>الإنجاز</th>
              <th>الحالة</th>
              <th>إجمالي النقاط</th>
              <th>تعليق المدير</th>
              <th>سبب الرفض</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {workReports.length ? workReports.map((report) => {
              const input = getWorkReportInput(report._id);
              const ownerId = String(report.user?._id || report.user?.id || report.user || '');
              const isOwnReport = ownerId && ownerId === String(currentUser?.id || '');
              const participantNames = (report.participants || [])
                .map((participant) => participant.fullName || participant.user?.fullName || '')
                .filter(Boolean);
              const participantCount = Number(report.participantCount || participantNames.length || 0);
              const previewDistribution = calculateWorkReportDistribution(
                input.points === '' ? 0 : Number(input.points),
                participantCount,
              );
              return (
                <tr key={report._id}>
                  <td>
                    <strong>{report.employeeName || report.user?.fullName || '-'}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>الرمز: {report.employeeCode || '-'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                      الكادر المشارك: {participantCount || 0}
                    </div>
                    {participantNames.length ? (
                      <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                        {participantNames.join('، ')}
                      </div>
                    ) : null}
                  </td>
                  <td>{report.project?.name || report.projectName || '-'}</td>
                  <td>{report.progressPercent || 0}%</td>
                  <td>{reportStatusLabelMap[report.status] || report.status}</td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={1000}
                      value={input.points}
                      onChange={(e) => setWorkReportInput(report._id, { points: e.target.value })}
                      style={{ width: 100 }}
                      disabled={!canApproveTasks}
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                      الكاتب: {formatWorkReportPoints(previewDistribution.reporterPoints)}
                      {participantCount
                        ? ` | لكل مشارك: ${formatWorkReportPoints(previewDistribution.participantPoints)}`
                        : ' | لا يوجد كادر مشارك'}
                    </div>
                  </td>
                  <td>
                    <input
                      className="input"
                      value={input.managerComment}
                      onChange={(e) => setWorkReportInput(report._id, { managerComment: e.target.value })}
                      disabled={!canApproveTasks}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={input.reason}
                      onChange={(e) => setWorkReportInput(report._id, { reason: e.target.value })}
                      disabled={!canApproveTasks}
                    />
                  </td>
                  <td>
                    {canApproveTasks && !isOwnReport ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button type="button" className="btn btn-soft" onClick={() => approveWorkReport(report)}>اعتماد</button>
                        <button type="button" className="btn btn-soft" onClick={() => rejectWorkReport(report)}>رفض</button>
                      </div>
                    ) : isOwnReport ? (
                      <span style={{ color: 'var(--warning)', fontSize: 12 }}>لا يمكن اعتماد تقريرك الشخصي</span>
                    ) : !canApproveTasks ? (
                      <span style={{ color: 'var(--text-soft)', fontSize: 12 }}>لا تملك صلاحية الاعتماد</span>
                    ) : '-'}
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={8} style={{ color: 'var(--text-soft)' }}>لا توجد تقارير عمل بانتظار الاعتماد.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card section">
        <h2>اعتمادات الحضور والانصراف</h2>
        <table className="table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>وقت الدخول</th>
              <th>وقت الخروج</th>
              <th>الحالة</th>
              <th>نقاط</th>
              <th>ملاحظة الاعتماد</th>
              <th>سبب الرفض</th>
              <th>المواقع</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {attendanceItems.length ? attendanceItems.map((item) => {
              const input = getAttendanceInput(item.id);
              const inMap = resolveMapUrl(item.checkInLocation);
              const outMap = resolveMapUrl(item.checkOutLocation);

              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.employeeName}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>{item.employeeCode || '-'}</div>
                  </td>
                  <td>{formatDateTime(item.checkInAt)}</td>
                  <td>{formatDateTime(item.checkOutAt)}</td>
                  <td>{attendanceApprovalStatusLabelMap[item.approvalStatus] || item.approvalStatus}</td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={1000}
                      value={input.points}
                      onChange={(e) => setAttendanceInput(item.id, { points: e.target.value })}
                      style={{ width: 100 }}
                      disabled={!canApproveTasks}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={input.approvalNote}
                      onChange={(e) => setAttendanceInput(item.id, { approvalNote: e.target.value })}
                      disabled={!canApproveTasks}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={input.reason}
                      onChange={(e) => setAttendanceInput(item.id, { reason: e.target.value })}
                      disabled={!canApproveTasks}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {inMap ? <a href={inMap} target="_blank" rel="noreferrer" style={{ color: '#9bc8ff' }}>دخول</a> : '-'}
                      {outMap ? <a href={outMap} target="_blank" rel="noreferrer" style={{ color: '#9bc8ff' }}>خروج</a> : null}
                    </div>
                  </td>
                  <td>
                    {canApproveTasks ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button type="button" className="btn btn-soft" onClick={() => approveAttendance(item)}>اعتماد</button>
                        <button type="button" className="btn btn-soft" onClick={() => rejectAttendance(item)}>رفض</button>
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={9} style={{ color: 'var(--text-soft)' }}>لا توجد جلسات حضور/انصراف بانتظار الاعتماد.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <h2>اعتمادات طلبات المواد</h2>
        <table className="table">
          <thead>
            <tr>
              <th>رقم الطلب</th>
              <th>المشروع</th>
              <th>مقدم الطلب</th>
              <th>الأولوية</th>
              <th>الحالة</th>
              <th>ملاحظات</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {materialRequests.length ? materialRequests.map((request) => {
              const input = getMaterialInput(request._id);
              return (
                <tr key={request._id}>
                  <td>{request.requestNo || '-'}</td>
                  <td>{request.project?.name || request.projectName || '-'}</td>
                  <td>{request.requestedBy?.fullName || '-'}</td>
                  <td>{request.priority || '-'}</td>
                  <td>{request.status || '-'}</td>
                  <td>
                    <input
                      className="input"
                      value={input.notes}
                      onChange={(e) => setMaterialInput(request._id, { notes: e.target.value })}
                      disabled={!canApproveMaterials}
                    />
                  </td>
                  <td>
                    {canApproveMaterials ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-soft" onClick={() => approveMaterialRequest(request)}>اعتماد</button>
                        <button type="button" className="btn btn-soft" onClick={() => rejectMaterialRequest(request)}>رفض</button>
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={7} style={{ color: 'var(--text-soft)' }}>لا توجد طلبات مواد بانتظار الاعتماد.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <h2>اعتمادات تصفية المواد</h2>
        <table className="table">
          <thead>
            <tr>
              <th>رقم التصفية</th>
              <th>رقم الذمة</th>
              <th>المشروع</th>
              <th>الحالة</th>
              <th>نقاط</th>
              <th>ملاحظات</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {materialReconciliations.length ? materialReconciliations.map((reconciliation) => {
              const input = getMaterialInput(reconciliation._id);
              return (
                <tr key={reconciliation._id}>
                  <td>{reconciliation.reconcileNo || '-'}</td>
                  <td>{reconciliation.custody?.custodyNo || '-'}</td>
                  <td>{reconciliation.project?.name || '-'}</td>
                  <td>{reconciliation.status || '-'}</td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={1000}
                      value={input.points}
                      onChange={(e) => setMaterialInput(reconciliation._id, { points: e.target.value })}
                      disabled={!canApproveMaterials}
                      style={{ width: 110 }}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={input.notes}
                      onChange={(e) => setMaterialInput(reconciliation._id, { notes: e.target.value })}
                      disabled={!canApproveMaterials}
                    />
                  </td>
                  <td>
                    {canApproveMaterials ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-soft" onClick={() => approveMaterialReconciliation(reconciliation)}>اعتماد</button>
                        <button type="button" className="btn btn-soft" onClick={() => rejectMaterialReconciliation(reconciliation)}>رفض</button>
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={7} style={{ color: 'var(--text-soft)' }}>لا توجد تصفيات مواد بانتظار الاعتماد.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
