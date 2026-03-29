'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission, hasPermission } from '../../../lib/permissions';
import MaintenancePlanModal from '../../../components/maintenance/MaintenancePlanModal';
import MaintenanceVisitDetailsModal from '../../../components/maintenance/MaintenanceVisitDetailsModal';
import MaintenanceVisitModal from '../../../components/maintenance/MaintenanceVisitModal';
import {
  buildDirectPlanDefaults,
  buildPlanDefaultsFromExisting,
  dueStateClassMap,
  formatDate,
  visitStatusClassMap,
  planStatusClassMap,
  maintenanceTypeOptions,
  planStatusOptions,
} from '../../../lib/maintenancePlans';

const tabs = [
  ['all', 'جميع الخطط'],
  ['due', 'الصيانات المستحقة'],
  ['visits', 'الزيارات المنجزة'],
  ['ended', 'الخطط المنتهية'],
];

const createEmptyFilters = () => ({
  search: '',
  customerName: '',
  projectNumber: '',
  location: '',
  maintenanceType: '',
  status: '',
  assignedEmployeeId: '',
  dateFrom: '',
  dateTo: '',
  dueFilter: '',
});

export default function MaintenancePlansPage() {
  const currentUser = authStorage.getUser();
  const canView = hasAnyPermission(currentUser, [
    Permission.VIEW_MAINTENANCE_PLANS,
    Permission.CREATE_MAINTENANCE_PLANS,
    Permission.MANAGE_MAINTENANCE_PLANS,
    Permission.REGISTER_MAINTENANCE_VISITS,
  ]);
  const canManage = hasPermission(currentUser, Permission.MANAGE_MAINTENANCE_PLANS);
  const canCreate = hasPermission(currentUser, Permission.CREATE_MAINTENANCE_PLANS);
  const canRegister = hasPermission(currentUser, Permission.REGISTER_MAINTENANCE_VISITS);
  const canLoadTechnicians = hasAnyPermission(currentUser, [
    Permission.CREATE_MAINTENANCE_PLANS,
    Permission.MANAGE_MAINTENANCE_PLANS,
  ]);

  const [plans, setPlans] = useState([]);
  const [visits, setVisits] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState(createEmptyFilters());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editingPlan, setEditingPlan] = useState(null);
  const [visitTarget, setVisitTarget] = useState(null);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [visitActionId, setVisitActionId] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const load = async () => {
    if (!canView) {
      setPlans([]);
      setSummary(null);
      setVisits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [plansResponse, visitsResponse, techniciansResponse] = await Promise.all([
        api.get(`/maintenance-plans${queryString ? `?${queryString}` : ''}`),
        api.get('/maintenance-plans/visits'),
        canLoadTechnicians ? api.get('/maintenance-plans/technicians').catch(() => ({ technicians: [] })) : Promise.resolve({ technicians: [] }),
      ]);
      const nextPlans = plansResponse.plans || [];
      setPlans(nextPlans);
      setSummary(plansResponse.summary || null);
      setVisits(visitsResponse.visits || []);
      setTechnicians(techniciansResponse.technicians || []);
      setSelectedPlanId((previous) => (nextPlans.some((plan) => plan.id === previous) ? previous : nextPlans[0]?.id || ''));
    } catch (err) {
      setError(err.message || 'تعذر تحميل بيانات الصيانة الدورية');
      setError(err.message || (editingPlan.planId ? 'تعذر تحديث خطة الصيانة' : 'تعذر إضافة خطة الصيانة الدورية'));
      setError(err.message || (editingPlan.planId ? 'تعذر تحديث خطة الصيانة' : 'تعذر إضافة خطة الصيانة الدورية'));
      setError(err.message || (editingPlan.planId ? 'تعذر تحديث خطة الصيانة' : 'تعذر إضافة خطة الصيانة الدورية'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [queryString]);

  useEffect(() => {
    if (!selectedVisit) {
      return;
    }

    const refreshedVisit = visits.find((visit) => visit.id === selectedVisit.id);
    if (!refreshedVisit) {
      setSelectedVisit(null);
      return;
    }

    setSelectedVisit(refreshedVisit);
  }, [selectedVisit, visits]);

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId) || null, [plans, selectedPlanId]);

  const duePlans = useMemo(() => plans.filter((plan) => ['TODAY', 'UPCOMING', 'OVERDUE'].includes(plan.dueCategory)), [plans]);
  const endedPlans = useMemo(() => plans.filter((plan) => ['ENDED', 'EXPIRED'].includes(plan.status)), [plans]);
  const visiblePlans = activeTab === 'due' ? duePlans : activeTab === 'ended' ? endedPlans : plans;
  const filteredVisits = useMemo(() => visits.filter((visit) => {
    if (activeTab !== 'visits') {
      return true;
    }
    if (!filters.search) {
      return true;
    }
    const q = filters.search.toLowerCase();
    return [
      visit.maintenancePlan?.customerName,
      visit.maintenancePlan?.projectName,
      visit.maintenancePlan?.location,
      visit.technicianName,
      visit.visitType,
    ].join(' ').toLowerCase().includes(q);
  }), [activeTab, filters.search, visits]);

  const openEditPlan = (plan) => {
    setEditingPlan({
      planId: plan.id,
      initialForm: buildPlanDefaultsFromExisting(plan),
      title: 'تعديل خطة الصيانة',
      subtitle: `${plan.customerName} - ${plan.projectName || 'بدون مشروع'}`,
    });
  };

  const openCreatePlan = () => {
    setEditingPlan({
      planId: '',
      initialForm: buildDirectPlanDefaults(),
      title: 'إضافة صيانة دورية',
      subtitle: 'إنشاء خطة صيانة دورية مباشرة من قسم الصيانة بدون الرجوع إلى تقرير عمل',
    });
  };

  const openVisitDetails = (visit) => {
    setSelectedPlanId(visit.maintenancePlan?.id || '');
    setSelectedVisit(visit);
  };

  const handleOpenVisitPdf = async (visit) => {
    if (!visit?.id) {
      return;
    }

    const actionKey = `pdf:${visit.id}`;
    const viewer = typeof window !== 'undefined'
      ? window.open('', '_blank', 'noopener,noreferrer')
      : null;

    setVisitActionId(actionKey);
    setError('');
    try {
      const blob = await api.downloadBlob(`/maintenance-plans/visits/${visit.id}/pdf`);
      const url = URL.createObjectURL(blob);

      if (viewer) {
        viewer.location = url;
      } else if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      if (viewer) {
        viewer.close();
      }
      setError(err.message || 'تعذر فتح ملف PDF للزيارة');
    } finally {
      setVisitActionId('');
    }
  };

  const handleVisitWhatsapp = async (visit) => {
    if (!visit?.id) {
      return;
    }

    setVisitActionId(`whatsapp:${visit.id}`);
    setError('');
    setInfo('');
    try {
      const response = await api.post(`/maintenance-plans/visits/${visit.id}/whatsapp-link`, {});
      if (response?.whatsapp?.url && typeof window !== 'undefined') {
        window.open(response.whatsapp.url, '_blank', 'noopener,noreferrer');
      }

      setInfo(
        response?.whatsapp?.mode === 'DIRECT'
          ? 'تم تجهيز رسالة واتساب على رقم الفني المسجل.'
          : 'تم تجهيز الرسالة في واتساب، ويمكن اختيار جهة الإرسال يدويًا لأن رقم الفني غير متوفر.',
      );
    } catch (err) {
      setError(err.message || 'تعذر تجهيز رسالة واتساب للزيارة');
    } finally {
      setVisitActionId('');
    }
  };

  const handleSavePlan = async (payload) => {
    if (!editingPlan) {
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      if (editingPlan.planId) {
        await api.patch(`/maintenance-plans/${editingPlan.planId}`, payload);
      } else {
        await api.post('/maintenance-plans', payload);
      }
      setEditingPlan(null);
      setInfo('تم تحديث خطة الصيانة بنجاح.');
      setInfo(editingPlan.planId ? 'تم تحديث خطة الصيانة بنجاح.' : 'تمت إضافة خطة الصيانة الدورية بنجاح.');
      await load();
    } catch (err) {
      setError(err.message || 'تعذر تحديث خطة الصيانة');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeStatus = async (plan, status) => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.patch(`/maintenance-plans/${plan.id}/status`, { status });
      setInfo(status === 'PAUSED' ? 'تم إيقاف خطة الصيانة.' : status === 'ACTIVE' ? 'تمت إعادة تفعيل الخطة.' : 'تم إنهاء الخطة.');
      await load();
    } catch (err) {
      setError(err.message || 'تعذر تحديث حالة الخطة');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVisit = async (formData) => {
    if (!visitTarget?.id) {
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.post(`/maintenance-plans/${visitTarget.id}/visits`, formData);
      setVisitTarget(null);
      setInfo('تم تسجيل زيارة الصيانة وتحديث الخطة.');
      await load();
    } catch (err) {
      setError(err.message || 'تعذر تسجيل زيارة الصيانة');
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return <section className="card section">لا تملك صلاحية الوصول إلى قسم الصيانة الدورية.</section>;
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--accent)' }}>{info}</section> : null}

      <section className="card section maintenance-hero">
        <div className="action-row">
          {canCreate ? (
            <button type="button" className="btn btn-primary" onClick={openCreatePlan}>
              إضافة صيانة دورية
            </button>
          ) : null}
          <button type="button" className="btn btn-soft" onClick={load} disabled={loading}>
            {loading ? 'جارٍ التحديث...' : 'تحديث'}
          </button>
        </div>
        <div>
          <h2 style={{ marginBottom: 6 }}>الصيانة الدورية</h2>
          <p style={{ margin: 0, color: 'var(--text-soft)' }}>متابعة الخطط الدورية والزيارات المستحقة والمنجزة من مكان واحد.</p>
        </div>
        <button type="button" className="btn btn-soft" onClick={load} disabled={loading}>{loading ? 'جارٍ التحديث...' : 'تحديث'}</button>
      </section>

      {summary ? (
        <section className="grid-4" style={{ marginTop: 16 }}>
          <article className="card section"><p className="maintenance-kpi-label">إجمالي الخطط</p><h2>{summary.totalPlans || 0}</h2></article>
          <article className="card section"><p className="maintenance-kpi-label">المستحقة اليوم</p><h2>{summary.dueToday || 0}</h2></article>
          <article className="card section"><p className="maintenance-kpi-label">المتأخرة</p><h2>{summary.overdue || 0}</h2></article>
          <article className="card section"><p className="maintenance-kpi-label">القادمة قريبًا</p><h2>{summary.upcoming || 0}</h2></article>
        </section>
      ) : null}

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="grid-3">
          <label>بحث عام
            <input className="input" value={filters.search} onChange={(e) => setFilters((c) => ({ ...c, search: e.target.value }))} placeholder="الزبون، المشروع، الموقع..." />
          </label>
          <label>اسم الزبون
            <input className="input" value={filters.customerName} onChange={(e) => setFilters((c) => ({ ...c, customerName: e.target.value }))} />
          </label>
          <label>رقم المشروع
            <input className="input" value={filters.projectNumber} onChange={(e) => setFilters((c) => ({ ...c, projectNumber: e.target.value }))} />
          </label>
          <label>الموقع
            <input className="input" value={filters.location} onChange={(e) => setFilters((c) => ({ ...c, location: e.target.value }))} />
          </label>
          <label>نوع الصيانة
            <select className="select" value={filters.maintenanceType} onChange={(e) => setFilters((c) => ({ ...c, maintenanceType: e.target.value }))}>
              <option value="">الكل</option>
              {maintenanceTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>الحالة
            <select className="select" value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
              <option value="">الكل</option>
              {planStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>الفني المسؤول
            <select className="select" value={filters.assignedEmployeeId} onChange={(e) => setFilters((c) => ({ ...c, assignedEmployeeId: e.target.value }))}>
              <option value="">الكل</option>
              {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.fullName}</option>)}
            </select>
          </label>
          <label>التاريخ من
            <input className="input" type="date" value={filters.dateFrom} onChange={(e) => setFilters((c) => ({ ...c, dateFrom: e.target.value }))} />
          </label>
          <label>التاريخ إلى
            <input className="input" type="date" value={filters.dateTo} onChange={(e) => setFilters((c) => ({ ...c, dateTo: e.target.value }))} />
          </label>
          <label>فلترة الاستحقاق
            <select className="select" value={filters.dueFilter} onChange={(e) => setFilters((c) => ({ ...c, dueFilter: e.target.value }))}>
              <option value="">الكل</option>
              <option value="TODAY">مستحقة اليوم</option>
              <option value="UPCOMING">قريبة</option>
              <option value="OVERDUE">متأخرة</option>
              <option value="ENDED">منتهية</option>
            </select>
          </label>
        </div>
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-soft" onClick={() => setFilters(createEmptyFilters())}>إعادة ضبط</button>
          <button type="button" className="btn btn-soft" onClick={load}>تحديث النتائج</button>
        </div>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="tabs-bar">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`maintenance-tab ${activeTab === value ? 'maintenance-tab-active' : ''}`}
              onClick={() => setActiveTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'visits' ? (
          <div className="maintenance-card-grid">
            {filteredVisits.length ? filteredVisits.map((visit) => (
              <article key={visit.id} className="maintenance-plan-card" onClick={() => openVisitDetails(visit)}>
                <div className="maintenance-card-header">
                  <div>
                    <strong>{visit.maintenancePlan?.customerName || 'زيارة صيانة'}</strong>
                    <div className="maintenance-card-subtitle">{visit.maintenancePlan?.projectName || '-'} - {visit.maintenancePlan?.location || '-'}</div>
                  </div>
                  <span className={`status-pill ${visitStatusClassMap[visit.status] || 'status-approved'}`}>{visit.statusLabel}</span>
                </div>
                <div className="maintenance-mini-grid">
                  <div><span>التاريخ</span><strong>{formatDate(visit.visitDate)}</strong></div>
                  <div><span>الفني</span><strong>{visit.technicianName || '-'}</strong></div>
                  <div><span>النوع</span><strong>{visit.visitType || '-'}</strong></div>
                  <div><span>الإنجاز</span><strong>{visit.completionRate}%</strong></div>
                </div>
                <div className="maintenance-chip-row" style={{ marginTop: 10 }}>
                  <span className={`status-pill ${visit.maintenancePlan?.maintenanceType === 'FREE' ? 'status-approved' : 'status-submitted'}`}>
                    {visit.maintenancePlan?.maintenanceType === 'FREE' ? 'مجانية' : 'مدفوعة'}
                  </span>
                  {visit.technician?.phone ? <span className="status-pill status-todo">{visit.technician.phone}</span> : null}
                </div>
                {visit.notes ? <p className="maintenance-note">{visit.notes}</p> : null}
                <div className="form-actions maintenance-visit-actions">
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      openVisitDetails(visit);
                    }}
                  >
                    عرض التفاصيل
                  </button>
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleOpenVisitPdf(visit);
                    }}
                    disabled={visitActionId === `pdf:${visit.id}`}
                  >
                    {visitActionId === `pdf:${visit.id}` ? 'جارٍ فتح PDF...' : 'عرض PDF'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleVisitWhatsapp(visit);
                    }}
                    disabled={visitActionId === `whatsapp:${visit.id}`}
                  >
                    {visitActionId === `whatsapp:${visit.id}` ? 'جارٍ تجهيز واتساب...' : 'إرسال واتساب'}
                  </button>
                </div>
              </article>
            )) : <p className="maintenance-empty">لا توجد زيارات منجزة مطابقة للفلاتر الحالية.</p>}
          </div>
        ) : (
          <div className="maintenance-card-grid">
            {visiblePlans.length ? visiblePlans.map((plan) => (
              <article key={plan.id} className={`maintenance-plan-card ${selectedPlan?.id === plan.id ? 'maintenance-plan-card-active' : ''}`} onClick={() => setSelectedPlanId(plan.id)}>
                <div className="maintenance-card-header">
                  <div>
                    <strong>{plan.customerName}</strong>
                    <div className="maintenance-card-subtitle">{plan.projectName || 'بدون مشروع'} - {plan.location || '-'}</div>
                  </div>
                  <div className="maintenance-chip-row">
                    <span className={`status-pill ${planStatusClassMap[plan.status] || 'status-approved'}`}>{plan.statusLabel}</span>
                    <span className={`status-pill ${plan.maintenanceType === 'FREE' ? 'status-approved' : 'status-submitted'}`}>{plan.maintenanceTypeLabel}</span>
                  </div>
                </div>
                <div className="maintenance-mini-grid">
                  <div><span>البداية</span><strong>{formatDate(plan.startDate)}</strong></div>
                  <div><span>النهاية</span><strong>{formatDate(plan.endDate)}</strong></div>
                  <div><span>التكرار</span><strong>{plan.recurrenceLabel}</strong></div>
                  <div><span>الزيارات</span><strong>{plan.completedVisits}/{plan.expectedVisits}</strong></div>
                  <div><span>آخر زيارة</span><strong>{formatDate(plan.lastVisitDate)}</strong></div>
                  <div><span>الزيارة القادمة</span><strong>{formatDate(plan.nextVisitDate)}</strong></div>
                </div>
                <div className="maintenance-chip-row" style={{ marginTop: 10 }}>
                  <span className={`status-pill ${dueStateClassMap[plan.nextVisitState] || 'status-todo'}`}>{plan.nextVisitStateLabel || plan.dueCategoryLabel}</span>
                  <span className="status-pill status-todo">{plan.assignedEmployee?.fullName || 'غير معين'}</span>
                </div>
                <div className="form-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-soft btn-sm" onClick={(e) => { e.stopPropagation(); setSelectedPlanId(plan.id); }}>عرض التفاصيل</button>
                  {plan.canRegisterVisit && canRegister ? <button type="button" className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setVisitTarget(plan); }}>تسجيل زيارة</button> : null}
                  {plan.canEditPlan && canManage ? <button type="button" className="btn btn-soft btn-sm" onClick={(e) => { e.stopPropagation(); openEditPlan(plan); }}>تعديل</button> : null}
                </div>
              </article>
            )) : <p className="maintenance-empty">لا توجد خطط صيانة مطابقة للفلاتر الحالية.</p>}
          </div>
        )}
      </section>

      {selectedPlan && activeTab !== 'visits' ? (
        <section className="card section maintenance-detail" style={{ marginTop: 16 }}>
          <div className="section-header">
            <div>
              <h2 style={{ marginBottom: 6 }}>{selectedPlan.customerName}</h2>
              <p style={{ margin: 0, color: 'var(--text-soft)' }}>{selectedPlan.projectName || 'بدون مشروع'} - {selectedPlan.location || '-'} - {selectedPlan.assignedEmployee?.fullName || 'غير معين'}</p>
            </div>
            <div className="action-row">
              {selectedPlan.canRegisterVisit && canRegister ? <button type="button" className="btn btn-primary" onClick={() => setVisitTarget(selectedPlan)}>تسجيل زيارة صيانة</button> : null}
              {selectedPlan.canEditPlan && canManage ? <button type="button" className="btn btn-soft" onClick={() => openEditPlan(selectedPlan)}>تعديل</button> : null}
              {selectedPlan.canStopPlan && canManage ? <button type="button" className="btn btn-soft" onClick={() => handleChangeStatus(selectedPlan, 'PAUSED')}>إيقاف</button> : null}
              {selectedPlan.status === 'PAUSED' && canManage ? <button type="button" className="btn btn-soft" onClick={() => handleChangeStatus(selectedPlan, 'ACTIVE')}>استئناف</button> : null}
              {selectedPlan.canEndPlan && canManage ? <button type="button" className="btn btn-soft" onClick={() => handleChangeStatus(selectedPlan, 'ENDED')}>إنهاء</button> : null}
            </div>
          </div>

          <div className="grid-4">
            <div className="maintenance-info-box"><span>نوع الصيانة</span><strong>{selectedPlan.maintenanceTypeLabel}</strong></div>
            <div className="maintenance-info-box"><span>مدة الصيانة</span><strong>{selectedPlan.durationLabel}</strong></div>
            <div className="maintenance-info-box"><span>الحالة</span><strong>{selectedPlan.statusLabel}</strong></div>
            <div className="maintenance-info-box"><span>التنبيه</span><strong>{selectedPlan.reminderBeforeLabel}</strong></div>
          </div>

          {selectedPlan.notes ? <div className="maintenance-note" style={{ marginTop: 16 }}>{selectedPlan.notes}</div> : null}

          <h3 style={{ margin: '18px 0 10px' }}>جدول الزيارات</h3>
          <div className="maintenance-visit-list">
            {(selectedPlan.scheduledVisits || []).length ? selectedPlan.scheduledVisits.map((visit) => (
              <div key={visit.id} className="maintenance-visit-row">
                <div>
                  <strong>زيارة #{visit.sequence}</strong>
                  <div className="maintenance-card-subtitle">{formatDate(visit.scheduledDate)}</div>
                </div>
                <div className="maintenance-chip-row">
                  <span className={`status-pill ${dueStateClassMap[visit.state] || 'status-todo'}`}>{visit.stateLabel}</span>
                  {visit.completedAt ? <span className="status-pill status-approved">أُنجزت: {formatDate(visit.completedAt)}</span> : null}
                </div>
              </div>
            )) : <p className="maintenance-empty">لا يوجد جدول زيارات لهذه الخطة.</p>}
          </div>
        </section>
      ) : null}

      <MaintenancePlanModal
        open={!!editingPlan}
        title={editingPlan?.title || 'تعديل خطة الصيانة'}
        subtitle={editingPlan?.subtitle || ''}
        initialForm={editingPlan?.initialForm || buildPlanDefaultsFromExisting({})}
        technicians={technicians}
        saving={saving}
        onClose={() => setEditingPlan(null)}
        onSubmit={handleSavePlan}
      />

      <MaintenanceVisitDetailsModal
        open={!!selectedVisit}
        visit={selectedVisit}
        actionState={visitActionId}
        onClose={() => setSelectedVisit(null)}
        onOpenPdf={handleOpenVisitPdf}
        onSendWhatsapp={handleVisitWhatsapp}
      />

      <MaintenanceVisitModal
        open={!!visitTarget}
        plan={visitTarget}
        technicians={technicians}
        saving={saving}
        onClose={() => setVisitTarget(null)}
        onSubmit={handleSaveVisit}
      />
    </>
  );
}
