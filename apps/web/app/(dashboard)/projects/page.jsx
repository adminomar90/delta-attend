'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission } from '../../../lib/permissions';
import { buildDailyWorkPlanFormData } from '../../../lib/dailyWorkPlans';
import DailyWorkPlanCalendar from '../../../components/daily-work-plans/DailyWorkPlanCalendar';
import DailyWorkPlanModal from '../../../components/daily-work-plans/DailyWorkPlanModal';

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

const emptyProjectForm = {
  name: '', code: '', customerId: '', workCategories: [], description: '', budget: 0, startDate: '', endDate: '',
};

const projectWorkCategories = [
  'كاميرات مراقبة',
  'بدالة داخلية',
  'شبكة نيت ورك',
  'أنظمة إنذار وإطفاء الحريق',
  'برمجيات',
  'أنظمة الصوت',
  'طاقة شمسية',
  'أخرى',
];

const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const monthAnchor = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
};
const monthRange = (value) => {
  const start = monthAnchor(value);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12));
  return { from: toDateInput(start), to: toDateInput(end) };
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [view, setView] = useState('cards');
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectPlans, setProjectPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => monthAnchor(new Date()));
  const [calendarDate, setCalendarDate] = useState('');
  const [planUsers, setPlanUsers] = useState([]);
  const [planForm, setPlanForm] = useState(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [plansRefreshKey, setPlansRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyProjectForm);

  const user = authStorage.getUser();
  const canManage = useMemo(() => {
    return hasAnyPermission(user, [
      Permission.MANAGE_PROJECTS,
      Permission.MANAGE_MATERIAL_INVENTORY,
      Permission.ADD_PROJECT_FROM_WAREHOUSE,
    ]);
  }, [user]);
  const canCreateDailyPlan = useMemo(() => hasAnyPermission(user, [
    Permission.CREATE_DAILY_WORK_PLANS,
    Permission.MANAGE_DAILY_WORK_PLANS,
  ]), [user]);

  const load = async () => {
    try {
      const [projectsResponse, customersResponse] = await Promise.all([
        api.get('/projects'),
        canManage ? api.get('/projects/customers/options') : Promise.resolve({ customers: [] }),
      ]);
      setProjects(projectsResponse.projects || []);
      setCustomers(customersResponse.customers || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل المشاريع');
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!canCreateDailyPlan) return;
    api.get('/daily-work-plans/meta')
      .then((response) => setPlanUsers((response.users || []).map((item) => ({ ...item, id: item.id || item._id }))))
      .catch(() => {});
  }, [canCreateDailyPlan]);

  useEffect(() => {
    if (!selectedProject) return;
    const loadProjectPlans = async () => {
      setPlansLoading(true);
      try {
        const range = monthRange(calendarMonth);
        const response = await api.get(`/projects/${selectedProject._id}/daily-work-plans?from=${range.from}&to=${range.to}`);
        setProjectPlans(response.plans || []);
      } catch (err) {
        setError(err.message || 'تعذر تحميل أيام العمل المرتبطة بالمشروع');
        setProjectPlans([]);
      } finally {
        setPlansLoading(false);
      }
    };
    loadProjectPlans();
  }, [selectedProject?._id, calendarMonth, plansRefreshKey]);

  const openDailyPlanForm = (project, date = '') => {
    const customer = project.customer || {};
    if (selectedProject?._id !== project._id) {
      setSelectedProject(project);
      setProjectPlans([]);
      setCalendarMonth(monthAnchor(date || new Date()));
      setCalendarDate(date || '');
    }
    setError('');
    setInfo('');
    setPlanForm({
      project: { _id: project._id },
      customer: customer._id || customer.id || '',
      customerName: customer.name || project.clientName || '',
      customerSnapshot: {
        phone: customer.phone || project.clientPhone || '',
        whatsapp: customer.whatsapp || customer.phone || project.clientPhone || '',
      },
      location: project.location || '',
      planDate: date || toDateInput(new Date()),
      title: '',
      description: '',
      assignees: [],
    });
  };

  const saveDailyPlan = async (dailyPlanForm) => {
    setPlanSaving(true);
    setError('');
    setInfo('');
    try {
      await api.post('/daily-work-plans', buildDailyWorkPlanFormData(dailyPlanForm));
      setPlanForm(null);
      setInfo('تم إنشاء بلان العمل وربطه بالمشروع، وسيظهر أيضاً في قائمة بلان العمل اليومي.');
      setCalendarDate(dailyPlanForm.planDate || '');
      setCalendarMonth(monthAnchor(dailyPlanForm.planDate || new Date()));
      setPlansRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err.message || 'تعذر إنشاء بلان العمل اليومي');
    } finally {
      setPlanSaving(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.workCategories.length) {
      setError('اختر تصنيفًا واحدًا على الأقل لنوع أعمال المشروع');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const payload = {
        ...form,
        budget: Number(form.budget),
      };
      if (editingId) await api.patch(`/projects/${editingId}`, payload);
      else await api.post('/projects', payload);
      setForm(emptyProjectForm);
      setEditingId('');
      await load();
    } catch (err) {
      setError(err.message || 'فشل إنشاء المشروع');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (project) => {
    setEditingId(project._id);
    setForm({
      name: project.name || '',
      code: project.code || '',
      customerId: project.customer?._id || project.customer || '',
      workCategories: project.workCategories || [],
      description: project.description || '',
      budget: project.budget || 0,
      startDate: toDateInput(project.startDate),
      endDate: toDateInput(project.endDate),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleWorkCategory = (category) => {
    setForm((previous) => ({
      ...previous,
      workCategories: previous.workCategories.includes(category)
        ? previous.workCategories.filter((item) => item !== category)
        : [...previous.workCategories, category],
    }));
  };

  const cancelEdit = () => {
    setEditingId('');
    setForm(emptyProjectForm);
  };

  const deleteProject = async (project) => {
    if (!window.confirm(`هل تريد حذف المشروع «${project.name}» من القائمة؟ ستبقى السجلات والذمم التاريخية محفوظة.`)) return;
    setSaving(true);
    setError('');
    try {
      await api.delete(`/projects/${project._id}`);
      if (editingId === project._id) cancelEdit();
      await load();
    } catch (err) {
      setError(err.message || 'تعذر حذف المشروع');
    } finally {
      setSaving(false);
    }
  };

  const openProjectDetails = (project) => {
    setSelectedProject(project);
    setProjectPlans([]);
    setCalendarMonth(monthAnchor(new Date()));
    setCalendarDate('');
  };

  const projectActionButtons = (project) => (
    <div className="form-actions daily-plan-actions project-plan-card-actions">
      <button type="button" className="btn btn-primary btn-sm" onClick={() => openProjectDetails(project)}>عرض التفاصيل</button>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => { window.location.href = `/project-custodies?projectId=${project._id}`; }}>المواد وذمة المشروع</button>
      {canCreateDailyPlan ? <button type="button" className="btn btn-primary btn-sm" onClick={() => openDailyPlanForm(project)}>إضافة بلان</button> : null}
      {canManage ? <button type="button" className="btn btn-primary btn-sm" onClick={() => sendProjectToWhatsApp(project)}>واتساب</button> : null}
      {canManage ? <button type="button" className="btn btn-primary btn-sm" onClick={() => startEdit(project)} disabled={saving}>تعديل</button> : null}
      {canManage ? <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteProject(project)} disabled={saving}>حذف</button> : null}
    </div>
  );

  const sendProjectToWhatsApp = (project) => {
    const ownerName = project.owner?.fullName || 'صاحب المشروع';
    const startDate = project.startDate ? new Date(project.startDate).toLocaleDateString('ar-IQ') : '-';
    const endDate = project.endDate ? new Date(project.endDate).toLocaleDateString('ar-IQ') : '-';
    const message = [
      '[ مشروع - Delta Plus ]',
      '----------------------------------',
      `السلام عليكم ${ownerName}،`,
      '',
      'تفاصيل المشروع:',
      `- اسم المشروع: ${project.name || '-'}`,
      `- الكود: ${project.code || '-'}`,
      `- الحالة الحالية: ${statusLabel[project.status] || project.status || '-'}`,
      `- الميزانية: ${project.budget || 0}`,
      `- تاريخ البداية: ${startDate}`,
      `- تاريخ النهاية: ${endDate}`,
      `- الوصف: ${project.description || '-'}`,
      '----------------------------------',
      'يرجى مراجعة التفاصيل وتأكيد الاستلام.',
      '[ صادر من نظام Delta Plus ]',
    ].join('\n');

    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--success)' }}>{info}</section> : null}

      {canManage ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>{editingId ? 'تعديل المشروع' : 'إضافة مشروع جديد'}</h2>
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
              اسم الزبون
              <select className="select" value={form.customerId} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))} required>
                <option value="">اختر الزبون من القائمة</option>
                {customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ''}</option>)}
              </select>
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

            <label className="grid-span-full">
              الوصف
              <textarea className="textarea" rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </label>

            <div className="grid-span-full">
              <p style={{ margin: '0 0 8px' }}>تصنيفات المشروع / نوع الأعمال</p>
              <div className="inline-checks">
                {projectWorkCategories.map((category) => (
                  <label key={category} className="checkbox-row">
                    <input type="checkbox" checked={form.workCategories.includes(category)} onChange={() => toggleWorkCategory(category)} />
                    {category}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : editingId ? 'حفظ التعديلات' : 'إنشاء المشروع مباشرة'}</button>
              {editingId ? <button className="btn btn-soft" type="button" onClick={cancelEdit} disabled={saving}>إلغاء التعديل</button> : null}
            </div>
          </form>
        </section>
      ) : null}

      <section className="card section">
        <div className="section-header">
          <div><h2>قائمة المشاريع</h2><p>عرض المشاريع ككروت أو جدول مع ملف العمل اليومي لكل مشروع.</p></div>
          <div className="form-actions">
            <button type="button" className={`btn ${view === 'cards' ? 'btn-primary' : 'btn-soft'}`} onClick={() => setView('cards')}>كروت</button>
            <button type="button" className={`btn ${view === 'table' ? 'btn-primary' : 'btn-soft'}`} onClick={() => setView('table')}>جدول</button>
          </div>
        </div>

        {view === 'cards' ? (
          <div className="project-card-grid">
            {projects.map((project) => (
              <article className="project-card" key={project._id}>
                <header className="project-card-header">
                  <div className="project-card-identity">
                    <span className="project-code" dir="ltr">{project.code}</span>
                    <h3>{project.name}</h3>
                    <p>{project.customer?.name || project.clientName || 'بدون زبون'}</p>
                  </div>
                  <span className={`status-pill ${statusClass[project.status] || 'status-todo'}`}>{statusLabel[project.status] || project.status}</span>
                </header>
                <div className="project-card-info">
                  <div><span>مدير المشروع</span><strong>{project.projectManager?.fullName || project.owner?.fullName || '-'}</strong></div>
                  <div><span>الميزانية</span><strong className="project-budget" dir="ltr">{Number(project.budget || 0).toLocaleString('en-US')}</strong></div>
                  <div><span>تاريخ البداية</span><strong dir="ltr">{project.startDate ? toDateInput(project.startDate) : '-'}</strong></div>
                  <div><span>تاريخ الانتهاء</span><strong dir="ltr">{project.endDate ? toDateInput(project.endDate) : '-'}</strong></div>
                </div>
                <div className="project-categories">
                  <span className="project-categories-label">أنواع الأعمال</span>
                  <div className="project-category-list">
                    {(project.workCategories || []).length
                      ? project.workCategories.map((category) => <span className="project-category-chip" key={category}>{category}</span>)
                      : <span className="project-category-empty">غير محدد</span>}
                  </div>
                </div>
                <footer>{projectActionButtons(project)}</footer>
              </article>
            ))}
            {!projects.length ? <p>لا توجد مشاريع مسجلة.</p> : null}
          </div>
        ) : (
        <div style={{ overflowX: 'auto' }}><table className="table">
          <thead>
            <tr>
              <th>المشروع</th>
              <th>المالك</th>
              <th>الحالة</th>
              <th>الميزانية</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              return (
                <tr key={project._id}>
                  <td>
                    <strong>{project.name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>{project.code} — {project.customer?.name || project.clientName || 'بدون زبون'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>{(project.workCategories || []).join('، ') || 'التصنيف غير محدد'}</div>
                  </td>
                  <td>{project.owner?.fullName || '-'}</td>
                  <td>
                    <span className={`status-pill ${statusClass[project.status] || 'status-todo'}`}>
                      {statusLabel[project.status] || project.status}
                    </span>
                  </td>
                  <td>{project.budget || 0}</td>
                  <td>{projectActionButtons(project)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        )}
      </section>

      {selectedProject ? (
        <div className="project-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedProject(null)}>
          <section className="project-detail-panel">
            <header className="section-header">
              <div>
                <small>{selectedProject.code}</small>
                <h2>{selectedProject.name}</h2>
                <p>{selectedProject.customer?.name || selectedProject.clientName || '-'} — {(selectedProject.workCategories || []).join('، ') || 'التصنيف غير محدد'}</p>
              </div>
              <button type="button" className="btn btn-soft" onClick={() => setSelectedProject(null)}>إغلاق</button>
            </header>
            <div className="project-detail-summary">
              <div><span>الحالة</span><strong>{statusLabel[selectedProject.status] || selectedProject.status}</strong></div>
              <div><span>مدير المشروع</span><strong>{selectedProject.projectManager?.fullName || selectedProject.owner?.fullName || '-'}</strong></div>
              <div><span>عدد خطط الشهر</span><strong>{projectPlans.length}</strong></div>
              <div><span>الميزانية</span><strong dir="ltr">{Number(selectedProject.budget || 0).toLocaleString('en-US')}</strong></div>
            </div>
            {canCreateDailyPlan ? (
              <div className="project-plan-actions">
                <button type="button" className="btn btn-primary" onClick={() => openDailyPlanForm(selectedProject)}>
                  إضافة بلان عمل يومي
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={!calendarDate}
                  onClick={() => openDailyPlanForm(selectedProject, calendarDate)}
                >
                  {calendarDate ? `إضافة بلان ليوم ${calendarDate}` : 'اختر يوماً من التقويم لإضافة بلان'}
                </button>
              </div>
            ) : null}
            <DailyWorkPlanCalendar
              open
              loading={plansLoading}
              monthDate={calendarMonth}
              plans={projectPlans}
              selectedDate={calendarDate}
              onSelectDate={setCalendarDate}
              onChangeMonth={(value) => { setCalendarMonth(monthAnchor(value)); setCalendarDate(''); }}
              onOpenDetails={() => { window.location.href = `/daily-work-plans?project=${selectedProject._id}`; }}
            />
          </section>
        </div>
      ) : null}

      <DailyWorkPlanModal
        open={Boolean(planForm)}
        initialForm={planForm}
        users={planUsers}
        projects={projects.map((project) => ({ ...project, id: project.id || project._id }))}
        saving={planSaving}
        title="إضافة بلان عمل للمشروع"
        subtitle={planForm ? `${selectedProject?.name || ''} — ${planForm.planDate || ''}` : ''}
        onClose={() => !planSaving && setPlanForm(null)}
        onSubmit={saveDailyPlan}
      />

      <style jsx>{`
        .project-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px;margin-top:18px}
        .project-card{position:relative;display:flex;flex-direction:column;min-height:100%;padding:20px;border:1px solid color-mix(in srgb,var(--primary) 34%,var(--border));border-radius:20px;background:linear-gradient(145deg,color-mix(in srgb,var(--surface-soft) 94%,var(--primary) 6%),var(--surface-soft));box-shadow:0 14px 34px rgba(0,0,0,.12);overflow:hidden;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
        .project-card::before{content:"";position:absolute;inset-block:0 auto;inset-inline:0;width:100%;height:3px;background:linear-gradient(90deg,var(--primary),color-mix(in srgb,var(--primary) 30%,transparent),transparent)}
        .project-card:hover{transform:translateY(-3px);border-color:var(--primary);box-shadow:0 18px 42px rgba(0,0,0,.18)}
        .project-card-header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.project-card-identity{min-width:0}.project-card h3{margin:8px 0 5px;font-size:20px;line-height:1.4}.project-card p{margin:0;color:var(--text-soft)}
        .project-code{display:inline-flex;padding:4px 9px;border:1px solid color-mix(in srgb,var(--primary) 45%,var(--border));border-radius:999px;background:color-mix(in srgb,var(--primary) 10%,transparent);color:var(--text-soft);font-size:12px;font-weight:700}
        .project-card-info,.project-detail-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:18px 0 12px}.project-card-info>div,.project-detail-summary>div{padding:12px;border:1px solid var(--border);border-radius:13px;background:color-mix(in srgb,var(--surface) 54%,transparent)}.project-card-info span,.project-detail-summary span{display:block;color:var(--text-soft);font-size:12px;margin-bottom:6px}.project-card-info strong{display:block;overflow-wrap:anywhere}.project-budget{font-size:17px;color:var(--text)}
        .project-categories{padding:12px;border:1px dashed color-mix(in srgb,var(--primary) 40%,var(--border));border-radius:14px;background:color-mix(in srgb,var(--primary) 5%,transparent)}.project-categories-label{display:block;margin-bottom:8px;color:var(--text-soft);font-size:12px}.project-category-list{display:flex;flex-wrap:wrap;gap:6px}.project-category-chip{padding:5px 9px;border-radius:999px;background:color-mix(in srgb,var(--primary) 17%,var(--surface));color:var(--text);font-size:12px;font-weight:700}.project-category-empty{color:var(--text-soft);font-size:12px}
        .project-card footer{margin-top:auto;padding-top:16px;border-top:1px solid var(--border);margin-block-start:16px}.project-plan-card-actions{align-items:stretch;gap:10px}.project-card .project-plan-card-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.project-plan-card-actions :global(.btn){min-height:42px;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 3px 8px rgba(0,0,0,.12)}.project-card .project-plan-card-actions :global(.btn){width:100%;padding-inline:8px}
        .project-plan-actions{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px}
        .project-detail-backdrop{position:fixed;inset:0;z-index:1200;padding:18px;background:rgba(2,6,14,.82);overflow:auto}.project-detail-panel{width:min(1400px,100%);margin:auto;padding:18px;border:1px solid var(--border);border-radius:20px;background:var(--surface)}
        @media(max-width:700px){.project-card-grid{grid-template-columns:1fr;gap:12px}.project-card{padding:16px;border-radius:17px}.project-card-info,.project-detail-summary{grid-template-columns:1fr}.project-card .project-plan-card-actions{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.project-detail-backdrop{padding:0}.project-detail-panel{min-height:100dvh;border-radius:0}}
        @media(max-width:420px){.project-card .project-plan-card-actions{grid-template-columns:1fr}}
      `}</style>

    </>
  );
}
