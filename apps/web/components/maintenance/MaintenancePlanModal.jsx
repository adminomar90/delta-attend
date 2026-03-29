'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  MaintenancePlanType,
  MaintenanceRecurrenceType,
  MaintenanceDurationUnit,
  buildPlanPayload,
  durationUnitOptions,
  estimateExpectedVisits,
  estimatePlanEndDate,
  freeDurationPresetOptions,
  maintenanceTypeOptions,
  planStatusOptions,
  recurrenceOptions,
  reminderBeforeOptions,
  resolveFreeDurationPreset,
  toDateInputValue,
} from '../../lib/maintenancePlans';

export default function MaintenancePlanModal({
  open,
  title,
  subtitle,
  initialForm,
  technicians = [],
  saving = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(initialForm);
  const [expectedManual, setExpectedManual] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(initialForm);
    setExpectedManual(false);
  }, [initialForm, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (form.maintenanceType === MaintenancePlanType.FREE && form.freeDurationPreset !== 'CUSTOM') {
      const preset = resolveFreeDurationPreset(form.freeDurationPreset);
      setForm((current) => ({
        ...current,
        freeDurationValue: preset.value,
        freeDurationUnit: preset.unit,
      }));
    }
  }, [form.freeDurationPreset, form.maintenanceType, open]);

  const computedEndDate = useMemo(() => estimatePlanEndDate(form), [form]);
  const computedExpectedVisits = useMemo(() => estimateExpectedVisits({
    ...form,
    endDate: form.maintenanceType === MaintenancePlanType.FREE
      ? toDateInputValue(computedEndDate)
      : form.endDate,
  }), [computedEndDate, form]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (form.maintenanceType === MaintenancePlanType.FREE) {
      const nextEndDate = toDateInputValue(computedEndDate);
      if (form.endDate !== nextEndDate) {
        setForm((current) => ({ ...current, endDate: nextEndDate }));
      }
    }
  }, [computedEndDate, form.endDate, form.maintenanceType, open]);

  useEffect(() => {
    if (!open || expectedManual) {
      return;
    }
    if (Number(form.expectedVisits || 0) !== Number(computedExpectedVisits || 0)) {
      setForm((current) => ({
        ...current,
        expectedVisits: computedExpectedVisits || 0,
      }));
    }
  }, [computedExpectedVisits, expectedManual, form.expectedVisits, open]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit(buildPlanPayload({
      ...form,
      endDate: form.maintenanceType === MaintenancePlanType.FREE
        ? toDateInputValue(computedEndDate)
        : form.endDate,
    }));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel maintenance-modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>{subtitle}</p> : null}
          </div>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="maintenance-form">
          <section className="maintenance-form-section">
            <div className="maintenance-section-head">
              <strong>بيانات الخطة الأساسية</strong>
              <span>يمكن تعديل القيم الناقصة قبل الحفظ</span>
            </div>
            <div className="grid-3">
              <label>اسم الزبون
                <input className="input" value={form.customerName} onChange={(e) => setForm((c) => ({ ...c, customerName: e.target.value }))} required />
              </label>
              <label>الموقع
                <input className="input" value={form.location} onChange={(e) => setForm((c) => ({ ...c, location: e.target.value }))} />
              </label>
              <label>رقم الهاتف
                <input className="input" value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} />
              </label>
              <label>رقم المشروع
                <input className="input" value={form.projectNumber} onChange={(e) => setForm((c) => ({ ...c, projectNumber: e.target.value }))} />
              </label>
              <label>اسم المشروع
                <input className="input" value={form.projectName} onChange={(e) => setForm((c) => ({ ...c, projectName: e.target.value }))} />
              </label>
              <label>الفريق المنفذ
                <input className="input" value={form.executorName} onChange={(e) => setForm((c) => ({ ...c, executorName: e.target.value }))} />
              </label>
              <label>تاريخ إكمال العمل
                <input className="input" type="date" value={form.completedWorkDate} onChange={(e) => setForm((c) => ({ ...c, completedWorkDate: e.target.value }))} />
              </label>
            </div>
          </section>

          <section className="maintenance-form-section">
            <div className="maintenance-section-head">
              <strong>إعدادات الصيانة الدورية</strong>
              <span>سيتم توليد جدول الزيارات تلقائيًا بعد الحفظ</span>
            </div>
            <div className="grid-3">
              <label>نوع الصيانة
                <select className="select" value={form.maintenanceType} onChange={(e) => { setExpectedManual(false); setForm((c) => ({ ...c, maintenanceType: e.target.value })); }}>
                  {maintenanceTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              {form.maintenanceType === MaintenancePlanType.FREE ? (
                <label>مدة الصيانة المجانية
                  <select className="select" value={form.freeDurationPreset} onChange={(e) => { setExpectedManual(false); setForm((c) => ({ ...c, freeDurationPreset: e.target.value })); }}>
                    {freeDurationPresetOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              ) : (
                <label>تاريخ نهاية الصيانة
                  <input className="input" type="date" value={form.endDate} onChange={(e) => { setExpectedManual(false); setForm((c) => ({ ...c, endDate: e.target.value })); }} required />
                </label>
              )}

              {form.maintenanceType === MaintenancePlanType.FREE && form.freeDurationPreset === 'CUSTOM' ? (
                <>
                  <label>قيمة المدة
                    <input className="input" type="number" min={1} value={form.freeDurationValue} onChange={(e) => { setExpectedManual(false); setForm((c) => ({ ...c, freeDurationValue: e.target.value })); }} />
                  </label>
                  <label>نوع المدة
                    <select className="select" value={form.freeDurationUnit} onChange={(e) => { setExpectedManual(false); setForm((c) => ({ ...c, freeDurationUnit: e.target.value })); }}>
                      {durationUnitOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </>
              ) : null}

              <label>بداية الصيانة
                <input className="input" type="date" value={form.startDate} onChange={(e) => { setExpectedManual(false); setForm((c) => ({ ...c, startDate: e.target.value })); }} required />
              </label>
              <label>تكرار الصيانة
                <select className="select" value={form.recurrenceType} onChange={(e) => { setExpectedManual(false); setForm((c) => ({ ...c, recurrenceType: e.target.value })); }}>
                  {recurrenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              {form.recurrenceType === MaintenanceRecurrenceType.CUSTOM ? (
                <>
                  <label>عدد مرات الزيارة
                    <input className="input" type="number" min={1} value={form.customVisitCount} onChange={(e) => { setExpectedManual(false); setForm((c) => ({ ...c, customVisitCount: e.target.value })); }} />
                  </label>
                  <label>الفاصل الزمني
                    <input className="input" type="number" min={1} value={form.customRecurrenceIntervalValue} onChange={(e) => { setExpectedManual(false); setForm((c) => ({ ...c, customRecurrenceIntervalValue: e.target.value })); }} />
                  </label>
                  <label>نوع الفاصل
                    <select className="select" value={form.customRecurrenceIntervalUnit} onChange={(e) => { setExpectedManual(false); setForm((c) => ({ ...c, customRecurrenceIntervalUnit: e.target.value })); }}>
                      {durationUnitOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </>
              ) : null}

              <label>عدد الزيارات المتوقعة
                <input className="input" type="number" min={1} value={form.expectedVisits} onChange={(e) => { setExpectedManual(true); setForm((c) => ({ ...c, expectedVisits: e.target.value })); }} />
                <span className="maintenance-helper">المقترح الآلي: {computedExpectedVisits || 0}</span>
              </label>
              <label>الفني المسؤول
                <select className="select" value={form.assignedEmployeeId} onChange={(e) => setForm((c) => ({ ...c, assignedEmployeeId: e.target.value }))} required>
                  <option value="">اختر الفني</option>
                  {technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.fullName}{technician.employeeCode ? ` - ${technician.employeeCode}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>حالة الخطة
                <select className="select" value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}>
                  {planStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>التنبيه قبل الموعد
                <select className="select" value={form.reminderBefore} onChange={(e) => setForm((c) => ({ ...c, reminderBefore: e.target.value }))}>
                  {reminderBeforeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>تاريخ نهاية الخطة
                <input className="input" type="date" value={toDateInputValue(computedEndDate) || form.endDate} disabled={form.maintenanceType === MaintenancePlanType.FREE} />
              </label>
              <label className="grid-span-full">ملاحظات
                <textarea className="textarea" rows={4} value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} />
              </label>
            </div>
          </section>

          <div className="form-actions form-actions-end maintenance-modal-actions">
            <button type="button" className="btn btn-soft" onClick={onClose} disabled={saving}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ الخطة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
