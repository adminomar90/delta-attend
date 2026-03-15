'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { buildWhatsAppSendUrl } from '../../../lib/whatsapp';

const statusMap = {
  TODO: 'جديدة',
  IN_PROGRESS: 'قيد التنفيذ',
  SUBMITTED: 'بانتظار الاعتماد',
  APPROVED: 'معتمدة',
  REJECTED: 'مرفوضة',
};

const statusClassMap = {
  TODO: 'status-todo',
  IN_PROGRESS: 'status-inprogress',
  SUBMITTED: 'status-submitted',
  APPROVED: 'status-approved',
  REJECTED: 'status-rejected',
};

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    project: '',
    assignee: '',
    dueDate: '',
    difficulty: 3,
    urgency: 1,
    estimatedHours: 2,
    plannedPoints: '',
    requiredApprovals: 1,
  });

  const currentUser = authStorage.getUser();
  const loadingRef = useRef(false);
  const [taskApprovalModal, setTaskApprovalModal] = useState(null);
  const [taskQualityScore, setTaskQualityScore] = useState('4');
  const [taskApprovalNote, setTaskApprovalNote] = useState('');

  const canCreate = useMemo(() => {
    const allowed = ['GENERAL_MANAGER', 'PROJECT_MANAGER', 'ASSISTANT_PROJECT_MANAGER', 'TEAM_LEAD'];
    return allowed.includes(currentUser?.role);
  }, [currentUser?.role]);

  const canApprove = useMemo(() => {
    const allowed = ['GENERAL_MANAGER', 'PROJECT_MANAGER', 'ASSISTANT_PROJECT_MANAGER', 'TEAM_LEAD'];
    return allowed.includes(currentUser?.role);
  }, [currentUser?.role]);

  const load = async (silent = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) setError('');

    try {
      const [tasksRes, projectsRes] = await Promise.all([api.get('/tasks'), api.get('/projects')]);
      setTasks(tasksRes.tasks || []);
      setProjects(projectsRes.projects || []);

      try {
        const usersRes = await api.get('/auth/users');
        setUsers(usersRes.users || []);
      } catch {
        setUsers([]);
      }
    } catch (err) {
      if (!silent) setError(err.message || 'تعذر تحميل المهام');
    } finally {
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    load();
    // Auto-refresh every 15 seconds so employees see status changes without manual refresh
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, []);

  const submitTask = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await api.post('/tasks', {
        ...form,
        project: form.project || undefined,
        difficulty: Number(form.difficulty),
        urgency: Number(form.urgency),
        estimatedHours: Number(form.estimatedHours),
        plannedPoints: form.plannedPoints ? Number(form.plannedPoints) : undefined,
        requiredApprovals: Number(form.requiredApprovals),
      });
      setForm({
        title: '',
        description: '',
        project: '',
        assignee: '',
        dueDate: '',
        difficulty: 3,
        urgency: 1,
        estimatedHours: 2,
        plannedPoints: '',
        requiredApprovals: 1,
      });
      await load();
    } catch (err) {
      setError(err.message || 'فشل إنشاء المهمة');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (taskId, status) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status });
      await load();
    } catch (err) {
      setError(err.message || 'فشل تحديث الحالة');
    }
  };

  const approveTask = async (taskId) => {
    if (!taskApprovalModal) {
      setTaskApprovalModal(taskId);
      setTaskQualityScore('4');
      setTaskApprovalNote('');
      return;
    }

    try {
      await api.patch(`/tasks/${taskId}/approve`, {
        qualityScore: Number(taskQualityScore),
        note: taskApprovalNote,
      });

      setTaskApprovalModal(null);
      await load();
    } catch (err) {
      setError(err.message || 'فشل اعتماد المهمة');
    }
  };

  const sendTaskToWhatsApp = (task) => {
    const assigneeName = task.assignee?.fullName || 'الموظف';
    const dueDate = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString('ar-IQ')
      : '-';
    const plannedPoints = task.plannedPoints || 0;
    const awardedPoints = task.pointsAwarded || 0;

    const message = [
      `السلام عليكم ${assigneeName}،`,
      '',
      'يرجى التكرم بالاطلاع على تفاصيل المهمة التالية:',
      '',
      'تفاصيل المهمة:',
      `- العنوان: ${task.title || '-'}`,
      `- المشروع: ${task.project?.name || '-'}`,
      `- الحالة الحالية: ${statusMap[task.status] || task.status || '-'}`,
      `- تاريخ الاستحقاق: ${dueDate}`,
      `- الصعوبة: ${task.difficulty || '-'}/5`,
      `- الاستعجال: ${task.urgency || '-'}/3`,
      `- الساعات التقديرية: ${task.estimatedHours || '-'}`,
      `- عدد الموافقات المطلوبة: ${task.requiredApprovals || 1}`,
      `- النقاط المخصصة: ${plannedPoints}`,
      `- النقاط المكتسبة حتى الآن: ${awardedPoints}`,
      `- الوصف: ${task.description || '-'}`,
      '',
      'الإجراء المطلوب:',
      'يرجى تأكيد استلام المهمة والبدء بالتنفيذ حسب الخطة.',
      '',
      'مع التقدير.',
    ].join('\n');

    const url = buildWhatsAppSendUrl({
      phone: task.assignee?.phone,
      message,
    });

    if (!url) {
      setError('لا يمكن الإرسال عبر واتساب لأن رقم هاتف الموظف غير موجود أو غير صالح.');
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}

      {canCreate ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>إنشاء مهمة جديدة</h2>
          <form onSubmit={submitTask} className="grid-3">
            <label>
              عنوان المهمة
              <input className="input" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required />
            </label>

            <label>
              الموظف المكلّف
              <select className="select" value={form.assignee} onChange={(e) => setForm((prev) => ({ ...prev, assignee: e.target.value }))} required>
                <option value="">اختر موظف</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>{user.fullName} - {user.role}</option>
                ))}
              </select>
            </label>

            <label>
              تاريخ الاستحقاق
              <input className="input" type="date" value={form.dueDate} onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))} required />
            </label>

            <label>
              الصعوبة (1-5)
              <input className="input" type="number" min={1} max={5} value={form.difficulty} onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value }))} />
            </label>

            <label>
              الاستعجال (1-3)
              <input className="input" type="number" min={1} max={3} value={form.urgency} onChange={(e) => setForm((prev) => ({ ...prev, urgency: e.target.value }))} />
            </label>

            <label>
              عدد الموافقات المطلوبة
              <input className="input" type="number" min={1} max={5} value={form.requiredApprovals} onChange={(e) => setForm((prev) => ({ ...prev, requiredApprovals: e.target.value }))} />
            </label>

            <label>
              الساعات التقديرية
              <input className="input" type="number" min={1} max={40} value={form.estimatedHours} onChange={(e) => setForm((prev) => ({ ...prev, estimatedHours: e.target.value }))} />
            </label>

            <label>
              النقاط المخصصة
              <input
                className="input"
                type="number"
                min={1}
                max={1000}
                value={form.plannedPoints}
                onChange={(e) => setForm((prev) => ({ ...prev, plannedPoints: e.target.value }))}
                placeholder="اختياري"
              />
            </label>

            <label className="grid-span-full">
              الوصف
              <textarea className="textarea" rows={3} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
            </label>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'جارٍ الحفظ...' : 'إسناد المهمة'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card section">
        <div className="section-header">
          <h2 style={{ margin: 0 }}>قائمة المهام</h2>
          <button className="btn btn-soft" onClick={() => load()} style={{ fontSize: 13 }}>↻ تحديث</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>المهمة</th>
              <th>المشروع</th>
              <th>المكلّف</th>
              <th>الحالة</th>
              <th>الموافقات</th>
              <th>النقاط</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const completed = task.approvalTrail?.length || 0;
              const required = task.requiredApprovals || 1;

              return (
                <tr key={task._id}>
                  <td>
                    <strong>{task.title}</strong>
                    <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>{task.description || '-'}</div>
                    {task.approvalTrail?.length ? (
                      <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>
                        {task.approvalTrail.map((entry) => entry.approver?.fullName || entry.role).join(' | ')}
                      </div>
                    ) : null}
                  </td>
                  <td>{task.project?.name || '-'}</td>
                  <td>{task.assignee?.fullName || '-'}</td>
                  <td>
                    <span className={`status-pill ${statusClassMap[task.status] || 'status-todo'}`}>
                      {statusMap[task.status] || task.status}
                    </span>
                  </td>
                  <td>{completed}/{required}</td>
                  <td>{task.pointsAwarded || task.plannedPoints || 0}</td>
                  <td>
                    {(() => {
                      const isAssignee = String(task.assignee?._id) === currentUser?.id;
                      const canMove = isAssignee || canCreate;
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {canCreate ? (
                            <button className="btn btn-soft" onClick={() => sendTaskToWhatsApp(task)}>واتساب</button>
                          ) : null}
                          {task.status === 'TODO' && canMove ? (
                            <button className="btn btn-soft" onClick={() => updateStatus(task._id, 'IN_PROGRESS')}>بدء</button>
                          ) : null}
                          {task.status === 'IN_PROGRESS' && canMove ? (
                            <button className="btn btn-soft" onClick={() => updateStatus(task._id, 'SUBMITTED')}>إرسال للاعتماد</button>
                          ) : null}
                          {task.status === 'SUBMITTED' && canApprove ? (
                            <button className="btn btn-primary" onClick={() => approveTask(task._id)}>اعتماد</button>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {taskApprovalModal ? (
        <div className="modal-backdrop" onClick={() => setTaskApprovalModal(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>اعتماد المهمة</h3>
              <button type="button" className="modal-close" onClick={() => setTaskApprovalModal(null)}>&times;</button>
            </div>
            <label>
              جودة الإنجاز (1 إلى 5)
              <select className="select" value={taskQualityScore} onChange={(e) => setTaskQualityScore(e.target.value)}>
                <option value="1">1 - ضعيف</option>
                <option value="2">2 - مقبول</option>
                <option value="3">3 - جيد</option>
                <option value="4">4 - جيد جداً</option>
                <option value="5">5 - ممتاز</option>
              </select>
            </label>
            <label style={{ marginTop: 12 }}>
              ملاحظة الاعتماد (اختياري)
              <input className="input" value={taskApprovalNote} onChange={(e) => setTaskApprovalNote(e.target.value)} placeholder="ملاحظة..." />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn-soft" onClick={() => setTaskApprovalModal(null)}>إلغاء</button>
              <button type="button" className="btn btn-primary" onClick={() => approveTask(taskApprovalModal)}>اعتماد</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
