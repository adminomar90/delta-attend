'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission, hasPermission } from '../../../lib/permissions';
import {
  buildDailyWorkPlanFormData,
  buildStatusPayload,
  createEmptyDailyWorkPlanFilters,
  dailyWorkPlanPriorityClassMap,
  dailyWorkPlanPriorityLabelMap,
  dailyWorkPlanStatusClassMap,
  dailyWorkPlanStatusLabelMap,
  dailyWorkPlanTaskTypeLabelMap,
  formatAssigneesSummary,
  formatDate,
  formatDateTime,
  toDateInputValue,
} from '../../../lib/dailyWorkPlans';
import {
  buildDailyWorkPlanArchiveWhatsappMessage,
  buildDailyWorkPlanWhatsappMessage,
} from '../../../lib/dailyWorkPlanWhatsapp';
import DailyWorkPlanCalendar from '../../../components/daily-work-plans/DailyWorkPlanCalendar';
import DailyWorkPlanModal from '../../../components/daily-work-plans/DailyWorkPlanModal';
import DailyWorkPlanActionModal from '../../../components/daily-work-plans/DailyWorkPlanActionModal';
import DailyWorkPlanDetailsModal from '../../../components/daily-work-plans/DailyWorkPlanDetailsModal';
import ProgressGauge from '../../../components/ProgressGauge';

const requiredPermissions = [
  Permission.VIEW_DAILY_WORK_PLANS,
  Permission.CREATE_DAILY_WORK_PLANS,
  Permission.MANAGE_DAILY_WORK_PLANS,
  Permission.UPDATE_ASSIGNED_DAILY_WORK_PLANS,
  Permission.APPROVE_DAILY_WORK_PLANS,
  Permission.EXPORT_DAILY_WORK_PLANS,
];

const toAssigneeUserId = (assignee) => String(assignee?.user?._id || assignee?.user?.id || assignee?.user || '');
const resolveActorAssignee = (plan, currentUserId) =>
  (plan?.assignees || []).find((assignee) => toAssigneeUserId(assignee) === String(currentUserId || '')) || null;

const enrichPlan = (plan, { currentUserId = '', canManage = false } = {}) => {
  const actorAssignee = !canManage ? resolveActorAssignee(plan, currentUserId) : null;
  const displayProgressPercent = actorAssignee ? Number(actorAssignee.progressPercent || 0) : Number(plan.progressPercent || 0);
  return {
    ...plan,
    actorAssignee,
    displayProgressPercent,
    displayProgressLabel: actorAssignee ? 'إنجازي' : 'الإنجاز العام',
    statusLabel: dailyWorkPlanStatusLabelMap[plan.status] || plan.status || '-',
    priorityLabel: dailyWorkPlanPriorityLabelMap[plan.priority] || plan.priority || '-',
    taskTypeLabel: dailyWorkPlanTaskTypeLabelMap[plan.taskType] || plan.taskType || '-',
  };
};

const createMonthAnchor = (value = new Date()) => {
  const safeValue = value || new Date();
  if (typeof safeValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
    const [year, month] = safeValue.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
  }
  const date = safeValue instanceof Date ? safeValue : new Date(safeValue);
  const resolvedDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Date(Date.UTC(resolvedDate.getUTCFullYear(), resolvedDate.getUTCMonth(), 1, 12, 0, 0, 0));
};

export default function DailyWorkPlansPage() {
  const currentUser = authStorage.getUser();
  const canView = hasAnyPermission(currentUser, requiredPermissions);
  const canCreate = hasPermission(currentUser, Permission.CREATE_DAILY_WORK_PLANS);
  const canManage = hasPermission(currentUser, Permission.MANAGE_DAILY_WORK_PLANS);
  const canApprove = hasPermission(currentUser, Permission.APPROVE_DAILY_WORK_PLANS);
  const canExport = hasPermission(currentUser, Permission.EXPORT_DAILY_WORK_PLANS);
  const canUpdateAssigned = hasPermission(currentUser, Permission.UPDATE_ASSIGNED_DAILY_WORK_PLANS) || canManage;

  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [productivity, setProductivity] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filters, setFilters] = useState(createEmptyDailyWorkPlanFilters());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [activeTab, setActiveTab] = useState('live');
  const [viewMode, setViewMode] = useState('cards');
  const [editingPlan, setEditingPlan] = useState(null);
  const [detailsPlan, setDetailsPlan] = useState(null);
  const [actionState, setActionState] = useState({ mode: '', plan: null });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarPlans, setCalendarPlans] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => createMonthAnchor(new Date()));
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => toDateInputValue(new Date()));
  const calendarSectionRef = useRef(null);
  const isArchiveTab = activeTab === 'archive';

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    if (isArchiveTab) params.set('archived', 'true');
    return params.toString();
  }, [filters, isArchiveTab]);

  const calendarQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.employee) params.set('employee', filters.employee);
    if (filters.supervisor) params.set('supervisor', filters.supervisor);
    if (filters.project) params.set('project', filters.project);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.taskType) params.set('taskType', filters.taskType);
    const monthStart = createMonthAnchor(calendarMonth);
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 12, 0, 0, 0));
    params.set('dateFrom', toDateInputValue(monthStart));
    params.set('dateTo', toDateInputValue(monthEnd));
    return params.toString();
  }, [calendarMonth, filters.employee, filters.priority, filters.project, filters.search, filters.supervisor, filters.taskType]);

  const loadMeta = async () => {
    const response = await api.get('/daily-work-plans/meta');
    setUsers((response.users || []).map((user) => ({ ...user, id: user.id || user._id })));
    setProjects((response.projects || []).map((project) => ({ ...project, id: project.id || project._id })));
  };

  const load = async (silent = false) => {
    if (!canView) { setLoading(false); return; }
    if (!silent) { setLoading(true); setError(''); }
    try {
      const response = await api.get(`/daily-work-plans${queryString ? `?${queryString}` : ''}`);
      setPlans((response.plans || []).map((plan) => enrichPlan(plan, { currentUserId: currentUser?.id, canManage })));
      setSummary(response.summary || null);
      setProductivity(response.productivity || []);
    } catch (err) {
      if (!silent) setError(err.message || 'تعذر تحميل بلانات العمل اليومية');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadCalendar = async (silent = false) => {
    if (!canView || !calendarOpen || isArchiveTab) return;
    if (!silent) setCalendarLoading(true);
    try {
      const response = await api.get(`/daily-work-plans?${calendarQueryString}`);
      setCalendarPlans((response.plans || []).map((plan) => enrichPlan(plan, { currentUserId: currentUser?.id, canManage })));
    } catch (err) {
      if (!silent) setError(err.message || 'تعذر تحميل تقويم البلان اليومي');
    } finally {
      if (!silent) setCalendarLoading(false);
    }
  };

  useEffect(() => { load(); }, [queryString]);
  useEffect(() => { if (canView) loadMeta().catch(() => {}); }, [canView]);
  useEffect(() => { if (canView && calendarOpen && !isArchiveTab) loadCalendar(); }, [calendarOpen, calendarQueryString, canView, isArchiveTab]);
  useEffect(() => { if (!canView) return undefined; const interval = window.setInterval(() => load(true), 30000); return () => window.clearInterval(interval); }, [canView, queryString]);
  useEffect(() => { if (!filters.planDate) return; setCalendarSelectedDate(filters.planDate); setCalendarMonth(createMonthAnchor(filters.planDate)); }, [filters.planDate]);
  useEffect(() => { if (!canView || !calendarOpen || isArchiveTab) return undefined; const interval = window.setInterval(() => loadCalendar(true), 30000); return () => window.clearInterval(interval); }, [calendarOpen, calendarQueryString, canView, isArchiveTab]);
  useEffect(() => { if (!calendarOpen || isArchiveTab) return undefined; const rafId = window.requestAnimationFrame(() => { const el = calendarSectionRef.current; if (!el) return; const targetTop = el.getBoundingClientRect().top + window.scrollY - 88; window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' }); }); return () => window.cancelAnimationFrame(rafId); }, [calendarOpen, isArchiveTab]);
  useEffect(() => { if (isArchiveTab) setCalendarOpen(false); }, [isArchiveTab]);

  const mutate = async (callback, successMessage) => {
    setSaving(true); setError(''); setInfo('');
    try {
      await callback();
      setEditingPlan(null);
      setActionState({ mode: '', plan: null });
      setInfo(successMessage);
      await load();
      if (calendarOpen && !isArchiveTab) await loadCalendar(true);
    } catch (err) {
      setError(err.message || 'تعذر تنفيذ العملية');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePlan = async (form) => mutate(async () => {
    const formData = buildDailyWorkPlanFormData(form);
    if (editingPlan?._id || editingPlan?.id) await api.patch(`/daily-work-plans/${editingPlan._id || editingPlan.id}`, formData);
    else await api.post('/daily-work-plans', formData);
  }, editingPlan ? 'تم تحديث البلان بنجاح.' : 'تم إنشاء البلان بنجاح.');

  const handleActionSubmit = async (payload) => {
    const planId = actionState.plan?._id || actionState.plan?.id;
    if (!planId) return null;
    if (actionState.mode === 'progress') return mutate(() => api.patch(`/daily-work-plans/${planId}/progress`, payload), 'تم تحديث نسبة الإنجاز.');
    if (actionState.mode === 'status') return mutate(() => api.patch(`/daily-work-plans/${planId}/status`, payload), 'تم تحديث الحالة.');
    if (actionState.mode === 'postpone') return mutate(() => api.post(`/daily-work-plans/${planId}/postpone`, payload), 'تم تأجيل البلان.');
    if (actionState.mode === 'approve') return mutate(() => api.patch(`/daily-work-plans/${planId}/approve`, payload), 'تم اعتماد البلان.');
    if (actionState.mode === 'finish') return mutate(() => api.patch(`/daily-work-plans/${planId}/status`, payload), 'تم إرسال البلان للاعتماد.');
    return null;
  };

  const quickStatusUpdate = async (plan, status) => mutate(() => api.patch(`/daily-work-plans/${plan._id || plan.id}/status`, buildStatusPayload({ status })), 'تم تحديث الحالة بنجاح.');
  const deletePlan = async (plan) => { if (!window.confirm(`هل تريد حذف البلان "${plan.title}"؟`)) return; await mutate(() => api.delete(`/daily-work-plans/${plan._id || plan.id}`), 'تم حذف البلان.'); };
  const rolloverPlan = async (plan) => mutate(() => api.post(`/daily-work-plans/${plan._id || plan.id}/rollover`, {}), 'تم ترحيل البلان إلى اليوم التالي.');
  const downloadFile = async (format) => {
    setSaving(true); setError('');
    try {
      const blob = await api.downloadBlob(`/daily-work-plans/export/${format}${queryString ? `?${queryString}` : ''}`);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `daily-work-plans${isArchiveTab ? '-archive' : ''}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'تعذر تصدير البلانات');
    } finally {
      setSaving(false);
    }
  };

  const handleCalendarToggle = () => {
    setCalendarOpen((previous) => {
      const nextOpen = !previous;
      if (nextOpen) {
        const nextDate = filters.planDate || calendarSelectedDate || toDateInputValue(new Date());
        setCalendarSelectedDate(nextDate);
        setCalendarMonth(createMonthAnchor(nextDate));
      }
      return nextOpen;
    });
  };

  const handleCalendarDateSelect = (dateKey) => {
    setCalendarSelectedDate(dateKey);
    setFilters((prev) => ({ ...prev, planDate: dateKey || '' }));
    if (dateKey) setCalendarMonth(createMonthAnchor(dateKey));
  };

  const handleCalendarMonthChange = (nextMonth) => {
    const nextAnchor = createMonthAnchor(nextMonth);
    setCalendarMonth(nextAnchor);
    if (!calendarSelectedDate) return;
    const selectedAnchor = createMonthAnchor(calendarSelectedDate);
    const sameMonth = selectedAnchor.getUTCFullYear() === nextAnchor.getUTCFullYear()
      && selectedAnchor.getUTCMonth() === nextAnchor.getUTCMonth();
    if (!sameMonth) {
      setCalendarSelectedDate('');
      setFilters((prev) => ({ ...prev, planDate: '' }));
    }
  };

  const resetFilters = () => {
    setFilters(createEmptyDailyWorkPlanFilters());
    setCalendarSelectedDate(toDateInputValue(new Date()));
    setCalendarMonth(createMonthAnchor(new Date()));
  };

  const sendPlanToWhatsApp = (plan) => {
    if (typeof window === 'undefined' || !plan) return;
    const message = buildDailyWorkPlanWhatsappMessage(plan);
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const sendArchiveToWhatsApp = () => {
    if (typeof window === 'undefined') return;
    const message = buildDailyWorkPlanArchiveWhatsappMessage(plans, { search: filters.search });
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const isTeamLeaderOfPlan = (plan) => String(plan.teamLeader?._id || plan.teamLeader?.id || plan.teamLeader || '') === String(currentUser?.id || '');
  const isPlanOwner = (plan) => {
    const actorId = String(currentUser?.id || '');
    const supervisorId = String(plan.supervisor?._id || plan.supervisor?.id || plan.supervisor || '');
    const createdById = String(plan.createdBy?._id || plan.createdBy?.id || plan.createdBy || '');
    return actorId === supervisorId || actorId === createdById;
  };
  const canArchiveThisPlan = (plan) => canManage || canApprove || isTeamLeaderOfPlan(plan) || isPlanOwner(plan);
  const canRestoreThisPlan = (plan) => canArchiveThisPlan(plan) && plan.archived;
  const isArchiveEligible = (plan) => Number(plan?.progressPercent || 0) >= 100 || ['PENDING_APPROVAL', 'COMPLETED'].includes(plan?.status);

  const openLiveTab = () => {
    setActiveTab('live');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openArchiveTab = () => {
    setActiveTab('archive');
    setCalendarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const archivePlan = async (plan) => {
    const planId = plan?._id || plan?.id;
    if (!planId) return;
    if (!window.confirm(`هل تريد أرشفة البلان "${plan.title}"؟`)) return;
    setSaving(true); setError(''); setInfo('');
    try {
      await api.patch(`/daily-work-plans/${planId}/archive`, {});
      setEditingPlan(null);
      setDetailsPlan(null);
      setActionState({ mode: '', plan: null });
      setPlans((prev) => prev.filter((item) => String(item._id || item.id) !== String(planId)));
      setInfo('تمت أرشفة البلان بنجاح ونقله إلى قائمة الأرشيف.');
      openArchiveTab();
    } catch (err) {
      setError(err.message || 'تعذر أرشفة البلان.');
    } finally {
      setSaving(false);
    }
  };

  const restoreArchivedPlan = async (plan) => {
    const planId = plan?._id || plan?.id;
    if (!planId) return;
    await mutate(() => api.patch(`/daily-work-plans/${planId}/unarchive`, {}), 'تمت إعادة البلان من الأرشيف.');
  };

  const archiveInsights = useMemo(() => {
    const todayKey = toDateInputValue(new Date());
    return {
      total: plans.length,
      approved: plans.filter((plan) => plan.isApproved || plan.status === 'COMPLETED').length,
      pendingApproval: plans.filter((plan) => plan.status === 'PENDING_APPROVAL').length,
      archivedToday: plans.filter((plan) => toDateInputValue(plan.archivedAt) === todayKey).length,
    };
  }, [plans]);

  if (!canView) return <section className="card section">لا تملك صلاحية الوصول إلى بلان العمل اليومي.</section>;

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--accent)' }}>{info}</section> : null}

      <section className="card section daily-plan-hero">
        <div>
          <h2 style={{ marginBottom: 6 }}>{isArchiveTab ? 'أرشيف البلان اليومي' : 'بلان العمل اليومي'}</h2>
          <p style={{ margin: 0, color: 'var(--text-soft)' }}>
            {isArchiveTab
              ? 'استعراض البلانات المؤرشفة، البحث، التصدير، ومشاركة واتساب من داخل النظام.'
              : 'تنظيم المهام اليومية، متابعة التنفيذ، واعتماد التحديثات بشكل مرتب واحترافي.'}
          </p>
        </div>

        <div className="daily-plan-view-switch">
          <button type="button" className={`btn ${!isArchiveTab ? 'btn-primary' : 'btn-soft'}`} onClick={openLiveTab}>البلانات الحالية</button>
          <button type="button" className={`btn ${isArchiveTab ? 'btn-primary' : 'btn-soft'}`} onClick={openArchiveTab}>الأرشيف</button>
        </div>

        <div className="action-row">
          {!isArchiveTab && canCreate ? <button className="btn btn-primary" onClick={() => setEditingPlan({})}>إضافة بلان جديد</button> : null}
          {!isArchiveTab ? <button className="btn btn-soft" onClick={handleCalendarToggle}>{calendarOpen ? 'إخفاء التقويم' : 'عرض التقويم'}</button> : null}
          {isArchiveTab ? <button className="btn btn-soft" onClick={sendArchiveToWhatsApp}>واتساب الأرشيف</button> : null}
          {canExport ? <button className="btn btn-soft" onClick={() => downloadFile('excel')} disabled={saving}>Excel</button> : null}
          {canExport ? <button className="btn btn-soft" onClick={() => downloadFile('pdf')} disabled={saving}>PDF</button> : null}
          <button className="btn btn-soft" onClick={() => load()} disabled={loading}>{loading ? 'جارٍ التحديث...' : 'تحديث'}</button>
        </div>
      </section>

      {!isArchiveTab && summary ? (
        <section className="grid-4" style={{ marginTop: 16 }}>
          <article className="card section"><p className="maintenance-kpi-label">خطط اليوم</p><h2>{summary.totalToday || 0}</h2></article>
          <article className="card section"><p className="maintenance-kpi-label">مكتملة</p><h2>{summary.completed || 0}</h2></article>
          <article className="card section"><p className="maintenance-kpi-label">قيد التنفيذ</p><h2>{summary.inProgress || 0}</h2></article>
          <article className="card section"><p className="maintenance-kpi-label">متأخرة</p><h2>{summary.overdue || 0}</h2></article>
        </section>
      ) : null}

      {isArchiveTab ? (
        <section className="grid-4" style={{ marginTop: 16 }}>
          <article className="card section"><p className="maintenance-kpi-label">إجمالي الأرشيف</p><h2>{archiveInsights.total}</h2></article>
          <article className="card section"><p className="maintenance-kpi-label">مكتملة / معتمدة</p><h2>{archiveInsights.approved}</h2></article>
          <article className="card section"><p className="maintenance-kpi-label">بانتظار الاعتماد</p><h2>{archiveInsights.pendingApproval}</h2></article>
          <article className="card section"><p className="maintenance-kpi-label">أرشفة اليوم</p><h2>{archiveInsights.archivedToday}</h2></article>
        </section>
      ) : null}

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="daily-plan-toolbar">
          <div className="daily-plan-filter-grid">
            <label>{isArchiveTab ? 'بحث في الأرشيف' : 'بحث عام'}<input className="input" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder={isArchiveTab ? 'اسم البلان، الموقع، الجهة، أو الموظف' : ''} /></label>
            <label>التاريخ<input className="input" type="date" value={filters.planDate} onChange={(e) => setFilters((prev) => ({ ...prev, planDate: e.target.value }))} /></label>
            <label>الموظف<select className="select" value={filters.employee} onChange={(e) => setFilters((prev) => ({ ...prev, employee: e.target.value }))}><option value="">الكل</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></label>
            <label>المشرف<select className="select" value={filters.supervisor} onChange={(e) => setFilters((prev) => ({ ...prev, supervisor: e.target.value }))}><option value="">الكل</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></label>
            <label>المشروع<select className="select" value={filters.project} onChange={(e) => setFilters((prev) => ({ ...prev, project: e.target.value }))}><option value="">الكل</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label>الحالة<select className="select" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}><option value="">الكل</option>{Object.entries(dailyWorkPlanStatusLabelMap).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>الأولوية<select className="select" value={filters.priority} onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}><option value="">الكل</option>{Object.entries(dailyWorkPlanPriorityLabelMap).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>نوع المهمة<select className="select" value={filters.taskType} onChange={(e) => setFilters((prev) => ({ ...prev, taskType: e.target.value }))}><option value="">الكل</option>{Object.entries(dailyWorkPlanTaskTypeLabelMap).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <div className="action-row">
            <button className="btn btn-soft" onClick={() => load()} disabled={loading}>بحث</button>
            <button className="btn btn-soft" onClick={resetFilters}>إعادة ضبط</button>
            <button className="btn btn-soft" onClick={() => setViewMode((prev) => (prev === 'cards' ? 'table' : 'cards'))}>{viewMode === 'cards' ? 'عرض جدولي' : 'عرض بطاقات'}</button>
          </div>
        </div>
      </section>

      {!isArchiveTab ? (
        <div ref={calendarSectionRef}>
          <DailyWorkPlanCalendar
            open={calendarOpen}
            loading={calendarLoading}
            monthDate={calendarMonth}
            plans={calendarPlans}
            selectedDate={calendarSelectedDate}
            onSelectDate={handleCalendarDateSelect}
            onChangeMonth={handleCalendarMonthChange}
            onOpenDetails={setDetailsPlan}
          />
        </div>
      ) : null}

      {!isArchiveTab && productivity.length ? (
        <section className="card section" style={{ marginTop: 16 }}>
          <div className="section-header">
            <h2 style={{ margin: 0 }}>أفضل الإنجاز اليومي</h2>
            <span style={{ color: 'var(--text-soft)', fontSize: 13 }}>أعلى 5 موظفين ضمن نطاقك الحالي</span>
          </div>
          <div className="daily-plan-productivity-grid">
            {productivity.slice(0, 5).map((item) => (
              <article key={item.userId} className="daily-plan-productivity-card">
                <strong>{item.fullName}</strong>
                <span>مكتملة: {item.completedAssignments}</span>
                <span>متأخرة: {item.overdueAssignments}</span>
                <span>متوسط الإنجاز: {item.averageProgress}%</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card section" style={{ marginTop: 16 }}>
        {viewMode === 'cards' ? (
          <div className="daily-plan-card-grid">
            {plans.length ? plans.map((plan) => (
              <article key={plan._id || plan.id} className={`daily-plan-card ${plan.archived ? 'daily-plan-card-archived' : ''}`}>
                <div className="maintenance-card-header">
                  <div>
                    <strong>{plan.title}</strong>
                    <div className="daily-plan-card-subtitle">{plan.customerName || plan.project?.name || 'بدون جهة'} - {plan.location || 'بدون موقع'}</div>
                  </div>
                  <div className="daily-plan-chip-row">
                    {plan.archived ? <span className="status-pill status-archived">مؤرشف</span> : null}
                    <span className={`status-pill ${dailyWorkPlanStatusClassMap[plan.status] || 'status-todo'}`}>{plan.statusLabel}</span>
                    <span className={`status-pill ${dailyWorkPlanPriorityClassMap[plan.priority] || 'status-todo'}`}>{plan.priorityLabel}</span>
                  </div>
                </div>
                <div className="daily-plan-mini-grid">
                  <div><span>التاريخ</span><strong>{formatDate(plan.planDate)}</strong></div>
                  <div><span>الوقت</span><strong>{[plan.startTime, plan.expectedEndTime].filter(Boolean).join(' - ') || '-'}</strong></div>
                  <div><span>نوع المهمة</span><strong>{plan.taskTypeLabel}</strong></div>
                  <div><span>آخر تحديث</span><strong>{formatDateTime(plan.lastUpdatedAt)}</strong></div>
                </div>
                <div className="daily-plan-progress-row"><span>{plan.displayProgressLabel || 'التقدم'}</span><ProgressGauge value={plan.displayProgressPercent || 0} /></div>
                <div className="daily-plan-card-subtitle">قائد الفريق: {plan.teamLeader?.fullName || 'غير محدد'}</div>
                <div className="daily-plan-card-subtitle">المكلفون: {formatAssigneesSummary(plan.assignees, { maxVisible: 2 })}</div>
                {plan.isApproved ? <div className="daily-plan-card-subtitle">إجمالي النقاط الممنوحة: {plan.pointsAwardedTotal || 0}</div> : null}
                {plan.postponedTo ? <div className="daily-plan-card-subtitle">مؤجلة إلى: {formatDateTime(plan.postponedTo)}</div> : null}
                {plan.archivedAt ? <div className="daily-plan-archive-meta"><span>تاريخ الأرشفة: {formatDateTime(plan.archivedAt)}</span><span>بواسطة: {plan.archivedBy?.fullName || '-'}</span></div> : null}
                <div className="form-actions daily-plan-actions">
                  <button className="btn btn-soft btn-sm" onClick={() => sendPlanToWhatsApp(plan)}>واتساب</button>
                  <button className="btn btn-soft btn-sm" onClick={() => setDetailsPlan(plan)}>التفاصيل</button>
                  {!isArchiveTab ? (
                    <>
                      {canManage ? <button className="btn btn-soft btn-sm" onClick={() => setEditingPlan(plan)}>تعديل</button> : null}
                      {canUpdateAssigned && isTeamLeaderOfPlan(plan) ? <button className="btn btn-soft btn-sm" onClick={() => setActionState({ mode: 'progress', plan })}>تحديث الإنجاز</button> : null}
                      {canUpdateAssigned && isTeamLeaderOfPlan(plan) && plan.status === 'NEW' ? <button className="btn btn-soft btn-sm" onClick={() => quickStatusUpdate(plan, 'IN_PROGRESS')}>بدء</button> : null}
                      {canUpdateAssigned && isTeamLeaderOfPlan(plan) && ['IN_PROGRESS', 'OVERDUE', 'STOPPED'].includes(plan.status) ? <button className="btn btn-soft btn-sm" onClick={() => setActionState({ mode: 'finish', plan })}>إنهاء</button> : null}
                      {canUpdateAssigned && isTeamLeaderOfPlan(plan) ? <button className="btn btn-soft btn-sm" onClick={() => setActionState({ mode: 'postpone', plan })}>تأجيل</button> : null}
                      {canApprove && plan.status === 'PENDING_APPROVAL' && (!isTeamLeaderOfPlan(plan) || currentUser?.role === 'GENERAL_MANAGER') ? <button className="btn btn-primary btn-sm" onClick={() => setActionState({ mode: 'approve', plan })}>اعتماد</button> : null}
                      {canManage && ['POSTPONED', 'OVERDUE'].includes(plan.status) ? <button className="btn btn-soft btn-sm" onClick={() => rolloverPlan(plan)}>ترحيل</button> : null}
                      {canArchiveThisPlan(plan) ? <button className="btn btn-soft btn-sm" onClick={() => archivePlan(plan)} disabled={!isArchiveEligible(plan) || saving}>أرشفة</button> : null}
                      {canManage ? <button className="btn btn-soft btn-sm" onClick={() => deletePlan(plan)}>حذف</button> : null}
                    </>
                  ) : (
                    <>
                      {canApprove && plan.status === 'PENDING_APPROVAL' && (!isTeamLeaderOfPlan(plan) || currentUser?.role === 'GENERAL_MANAGER') ? <button className="btn btn-primary btn-sm" onClick={() => setActionState({ mode: 'approve', plan })}>اعتماد</button> : null}
                      {canRestoreThisPlan(plan) ? <button className="btn btn-soft btn-sm" onClick={() => restoreArchivedPlan(plan)}>استرجاع</button> : null}
                    </>
                  )}
                </div>
              </article>
            )) : <p className="maintenance-empty">{isArchiveTab ? 'لا توجد بلانات مؤرشفة مطابقة للفلاتر الحالية.' : 'لا توجد بلانات مطابقة للفلاتر الحالية.'}</p>}
          </div>
        ) : (
          <div className="work-reports-table-shell">
            <table className="table">
              <thead>
                <tr>
                  <th>العنوان</th>
                  <th>الموظفون</th>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                  <th>الأولوية</th>
                  <th>الإنجاز</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan._id || plan.id}>
                    <td>
                      <strong>{plan.title}</strong>
                      <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>{plan.customerName || plan.project?.name || '-'} - {plan.location || '-'}</div>
                      {plan.archivedAt ? <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>أرشفة: {formatDateTime(plan.archivedAt)}</div> : null}
                    </td>
                    <td>{formatAssigneesSummary(plan.assignees, { maxVisible: 3 })}</td>
                    <td>
                      {formatDate(plan.planDate)}
                      {plan.isApproved ? <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>النقاط: {plan.pointsAwardedTotal || 0}</div> : null}
                      {plan.postponedTo ? <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>مؤجلة إلى: {formatDateTime(plan.postponedTo)}</div> : null}
                    </td>
                    <td>
                      <div className="daily-plan-chip-row">
                        {plan.archived ? <span className="status-pill status-archived">مؤرشف</span> : null}
                        <span className={`status-pill ${dailyWorkPlanStatusClassMap[plan.status] || 'status-todo'}`}>{plan.statusLabel}</span>
                      </div>
                    </td>
                    <td><span className={`status-pill ${dailyWorkPlanPriorityClassMap[plan.priority] || 'status-todo'}`}>{plan.priorityLabel}</span></td>
                    <td>
                      <ProgressGauge value={plan.displayProgressPercent || 0} />
                      {!canManage && plan.actorAssignee ? <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 6 }}>الإنجاز العام: {plan.progressPercent || 0}%</div> : null}
                    </td>
                    <td>
                      <div className="form-actions">
                        <button className="btn btn-soft btn-sm" onClick={() => setDetailsPlan(plan)}>التفاصيل</button>
                        <button className="btn btn-soft btn-sm" onClick={() => sendPlanToWhatsApp(plan)}>واتساب</button>
                        {!isArchiveTab ? (
                          <>
                            {canManage ? <button className="btn btn-soft btn-sm" onClick={() => setEditingPlan(plan)}>تعديل</button> : null}
                            {canApprove && plan.status === 'PENDING_APPROVAL' && (!isTeamLeaderOfPlan(plan) || currentUser?.role === 'GENERAL_MANAGER') ? <button className="btn btn-primary btn-sm" onClick={() => setActionState({ mode: 'approve', plan })}>اعتماد</button> : null}
                            {canArchiveThisPlan(plan) ? <button className="btn btn-soft btn-sm" onClick={() => archivePlan(plan)} disabled={!isArchiveEligible(plan) || saving}>أرشفة</button> : null}
                          </>
                        ) : (
                          <>
                            {canApprove && plan.status === 'PENDING_APPROVAL' && (!isTeamLeaderOfPlan(plan) || currentUser?.role === 'GENERAL_MANAGER') ? <button className="btn btn-primary btn-sm" onClick={() => setActionState({ mode: 'approve', plan })}>اعتماد</button> : null}
                            {canRestoreThisPlan(plan) ? <button className="btn btn-soft btn-sm" onClick={() => restoreArchivedPlan(plan)}>استرجاع</button> : null}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DailyWorkPlanModal open={!!editingPlan} initialForm={editingPlan} users={users} projects={projects} saving={saving} title={editingPlan?._id || editingPlan?.id ? 'تعديل بلان العمل اليومي' : 'إضافة بلان عمل يومي'} subtitle={editingPlan?.title || 'إنشاء خطة يومية جديدة وتوزيعها على الموظفين'} onClose={() => setEditingPlan(null)} onSubmit={handleSavePlan} />
      <DailyWorkPlanActionModal open={!!actionState.mode} mode={actionState.mode} plan={actionState.plan} users={users} currentUserId={currentUser?.id} canManage={canManage} saving={saving} onClose={() => setActionState({ mode: '', plan: null })} onSubmit={handleActionSubmit} />
      <DailyWorkPlanDetailsModal open={!!detailsPlan} plan={detailsPlan} onClose={() => setDetailsPlan(null)} onSendWhatsApp={sendPlanToWhatsApp} />
    </>
  );
}
