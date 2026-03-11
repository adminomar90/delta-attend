'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { buildWhatsAppSendUrl } from '../../../lib/whatsapp';

const roleOptions = [
  { value: 'FINANCIAL_MANAGER', label: 'موافقة المالية' },
  { value: 'GENERAL_MANAGER', label: 'موافقة المدير العام' },
  { value: 'PROJECT_MANAGER', label: 'موافقة مدير المشروع' },
];

const statusLabel = {
  PENDING_APPROVAL: 'قيد الموافقة',
  ACTIVE: 'نشط',
  ON_HOLD: 'معلق',
  DONE: 'مكتمل',
  REJECTED: 'مرفوض',
};

const statusClass = {
  PENDING_APPROVAL: 'status-submitted',
  ACTIVE: 'status-approved',
  ON_HOLD: 'status-inprogress',
  DONE: 'status-todo',
  REJECTED: 'status-rejected',
};

const roleLabelMap = {
  GENERAL_MANAGER: 'مدير عام',
  FINANCIAL_MANAGER: 'مدير مالي',
  PROJECT_MANAGER: 'مدير مشروع',
  ASSISTANT_PROJECT_MANAGER: 'مساعد مدير مشروع',
  TEAM_LEAD: 'قائد فريق',
  TECHNICAL_STAFF: 'موظف تقني',
  HR_MANAGER: 'مدير موارد بشرية',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    budget: 0,
    startDate: '',
    endDate: '',
    requiredApprovalRoles: ['FINANCIAL_MANAGER', 'GENERAL_MANAGER'],
  });

  const user = authStorage.getUser();
  const canManage = useMemo(() => {
    const allowed = ['GENERAL_MANAGER', 'PROJECT_MANAGER', 'ASSISTANT_PROJECT_MANAGER'];
    return allowed.includes(user?.role);
  }, [user?.role]);

  const canApprove = useMemo(() => {
    const allowed = ['GENERAL_MANAGER', 'FINANCIAL_MANAGER', 'PROJECT_MANAGER', 'ASSISTANT_PROJECT_MANAGER'];
    return allowed.includes(user?.role);
  }, [user?.role]);

  const load = async () => {
    try {
      const response = await api.get('/projects');
      setProjects(response.projects || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل المشاريع');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleApprovalRole = (role) => {
    setForm((prev) => {
      const exists = prev.requiredApprovalRoles.includes(role);
      return {
        ...prev,
        requiredApprovalRoles: exists
          ? prev.requiredApprovalRoles.filter((item) => item !== role)
          : [...prev.requiredApprovalRoles, role],
      };
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await api.post('/projects', {
        ...form,
        budget: Number(form.budget),
      });
      setForm({
        name: '',
        code: '',
        description: '',
        budget: 0,
        startDate: '',
        endDate: '',
        requiredApprovalRoles: ['FINANCIAL_MANAGER', 'GENERAL_MANAGER'],
      });
      await load();
    } catch (err) {
      setError(err.message || 'فشل إنشاء المشروع');
    } finally {
      setSaving(false);
    }
  };

  const approveProject = async (projectId) => {
    const comment = window.prompt('ملاحظة الاعتماد (اختياري):', '') || '';

    try {
      await api.patch(`/projects/${projectId}/approve`, { comment });
      await load();
    } catch (err) {
      setError(err.message || 'فشل اعتماد المشروع');
    }
  };

  const rejectProject = async (projectId) => {
    const reason = window.prompt('سبب الرفض:', '');
    if (!reason) return;

    try {
      await api.patch(`/projects/${projectId}/reject`, { reason });
      await load();
    } catch (err) {
      setError(err.message || 'فشل رفض المشروع');
    }
  };

  const sendProjectToWhatsApp = (project) => {
    const ownerName = project.owner?.fullName || 'صاحب المشروع';
    const startDate = project.startDate ? new Date(project.startDate).toLocaleDateString('ar-IQ') : '-';
    const endDate = project.endDate ? new Date(project.endDate).toLocaleDateString('ar-IQ') : '-';
    const requiredApprovals = (project.requiredApprovalRoles || [])
      .map((role) => roleLabelMap[role] || role)
      .join('، ');

    const message = [
      `السلام عليكم ${ownerName}،`,
      '',
      'يرجى التكرم بالاطلاع على تفاصيل المشروع التالية:',
      '',
      'تفاصيل المشروع:',
      `- اسم المشروع: ${project.name || '-'}`,
      `- الكود: ${project.code || '-'}`,
      `- الحالة الحالية: ${statusLabel[project.status] || project.status || '-'}`,
      `- الميزانية: ${project.budget || 0}`,
      `- تاريخ البداية: ${startDate}`,
      `- تاريخ النهاية: ${endDate}`,
      `- الأدوار المطلوبة للاعتماد: ${requiredApprovals || '-'}`,
      `- الوصف: ${project.description || '-'}`,
      '',
      'الإجراء المطلوب:',
      'يرجى مراجعة التفاصيل وتأكيد الاستلام.',
      '',
      'مع التقدير.',
    ].join('\n');

    const url = buildWhatsAppSendUrl({
      phone: project.owner?.phone,
      message,
    });

    if (!url) {
      setError('لا يمكن إرسال تفاصيل المشروع عبر واتساب لأن رقم هاتف المالك غير موجود أو غير صالح.');
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}

      {canManage ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>إضافة مشروع جديد</h2>
          <form className="grid-3" onSubmit={submit}>
            <label>
              اسم المشروع
              <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            </label>

            <label>
              الكود
              <input className="input" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} required />
            </label>

            <label>
              الميزانية
              <input className="input" type="number" min={0} value={form.budget} onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))} />
            </label>

            <label>
              تاريخ البداية
              <input className="input" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
            </label>

            <label>
              تاريخ النهاية
              <input className="input" type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
            </label>

            <label style={{ gridColumn: 'span 3' }}>
              الوصف
              <textarea className="textarea" rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </label>

            <div style={{ gridColumn: 'span 3' }}>
              <p style={{ margin: '0 0 8px' }}>الأدوار المطلوبة لاعتماد المشروع</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {roleOptions.map((role) => (
                  <label key={role.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={form.requiredApprovalRoles.includes(role.value)}
                      onChange={() => toggleApprovalRole(role.value)}
                    />
                    {role.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إنشاء المشروع'}</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card section">
        <h2>قائمة المشاريع</h2>
        <table className="table">
          <thead>
            <tr>
              <th>المشروع</th>
              <th>المالك</th>
              <th>الحالة</th>
              <th>الموافقات</th>
              <th>الميزانية</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const approvalsCompleted = project.approvalTrail?.length || 0;
              const approvalsRequired = project.requiredApprovalRoles?.length || 0;
              const canTakeAction = canApprove && project.status === 'PENDING_APPROVAL';

              return (
                <tr key={project._id}>
                  <td>
                    <strong>{project.name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>{project.code} - {project.description || '-'}</div>
                  </td>
                  <td>{project.owner?.fullName || '-'}</td>
                  <td>
                    <span className={`status-pill ${statusClass[project.status] || 'status-todo'}`}>
                      {statusLabel[project.status] || project.status}
                    </span>
                  </td>
                  <td>{approvalsCompleted}/{approvalsRequired}</td>
                  <td>{project.budget || 0}</td>
                  <td>
                    {canTakeAction || canManage ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-soft" onClick={() => sendProjectToWhatsApp(project)}>واتساب</button>
                        {canTakeAction ? <button type="button" className="btn btn-soft" onClick={() => approveProject(project._id)}>اعتماد</button> : null}
                        {canTakeAction ? <button type="button" className="btn btn-soft" onClick={() => rejectProject(project._id)}>رفض</button> : null}
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

