'use client';

import { useEffect, useState } from 'react';
import {
  buildVisitFormData,
  createEmptyVisitForm,
  formatDate,
  technicianEvaluationOptions,
} from '../../lib/maintenancePlans';

const evaluationDefaults = Object.fromEntries(
  technicianEvaluationOptions.map(([value, , percent]) => [value, percent]),
);

export default function MaintenanceVisitModal({
  open,
  plan,
  technicians = [],
  saving = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(createEmptyVisitForm(plan));

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(createEmptyVisitForm(plan));
  }, [open, plan]);

  if (!open || !plan) {
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit(buildVisitFormData(form));
  };

  const handleEvaluationChange = (grade) => {
    setForm((current) => ({
      ...current,
      technicianEvaluationGrade: current.technicianEvaluationGrade === grade ? '' : grade,
      technicianEvaluationPercent: current.technicianEvaluationGrade === grade ? '' : evaluationDefaults[grade],
    }));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel maintenance-modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>تسجيل زيارة صيانة</h3>
            <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
              {plan.customerName} - {plan.projectName || 'بدون مشروع'} - الزيارة القادمة: {formatDate(plan.nextVisitDate)}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>x</button>
        </div>

        <form onSubmit={handleSubmit} className="maintenance-form">
          <section className="maintenance-form-section">
            <div className="maintenance-section-head">
              <strong>تفاصيل الزيارة</strong>
              <span>سيتم تحديث آخر زيارة وموعد الزيارة القادمة تلقائيًا بعد الحفظ</span>
            </div>

            <div className="grid-3">
              <label>التاريخ
                <input
                  className="input"
                  type="date"
                  value={form.visitDate}
                  onChange={(event) => setForm((current) => ({ ...current, visitDate: event.target.value }))}
                  required
                />
              </label>

              <label>الفني أو المهندس
                <select
                  className="select"
                  value={form.technicianId}
                  onChange={(event) => setForm((current) => ({ ...current, technicianId: event.target.value }))}
                  required
                >
                  <option value="">اختر الفني</option>
                  {technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label>نوع الزيارة
                <input
                  className="input"
                  value={form.visitType}
                  onChange={(event) => setForm((current) => ({ ...current, visitType: event.target.value }))}
                  placeholder="فحص دوري، متابعة، طارئة..."
                />
              </label>

              <label>الزيارة المجدولة
                <select
                  className="select"
                  value={form.scheduledVisitId}
                  onChange={(event) => setForm((current) => ({ ...current, scheduledVisitId: event.target.value }))}
                >
                  <option value="">تحديد تلقائي</option>
                  {(plan.scheduledVisits || []).filter((item) => !item.completedAt).map((item) => (
                    <option key={item.id} value={item.id}>
                      زيارة #{item.sequence} - {formatDate(item.scheduledDate)}
                    </option>
                  ))}
                </select>
              </label>

              <label>حالة الأجهزة
                <input
                  className="input"
                  value={form.deviceStatus}
                  onChange={(event) => setForm((current) => ({ ...current, deviceStatus: event.target.value }))}
                />
              </label>

              <label>نسبة الإنجاز
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={form.completionRate}
                  onChange={(event) => setForm((current) => ({ ...current, completionRate: event.target.value }))}
                />
              </label>

              <label className="grid-span-full">الأعمال المنفذة
                <textarea
                  className="textarea"
                  rows={4}
                  value={form.workDone}
                  onChange={(event) => setForm((current) => ({ ...current, workDone: event.target.value }))}
                />
              </label>

              <label className="grid-span-full">الملاحظات
                <textarea
                  className="textarea"
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>

              <label className="grid-span-full">التوصيات
                <textarea
                  className="textarea"
                  rows={3}
                  value={form.recommendations}
                  onChange={(event) => setForm((current) => ({ ...current, recommendations: event.target.value }))}
                />
              </label>

              <label>اعتماد عام
                <input
                  className="input"
                  value={form.signedBy}
                  onChange={(event) => setForm((current) => ({ ...current, signedBy: event.target.value }))}
                  placeholder="اعتماد أو مرجع مختصر"
                />
              </label>

              <label>نص الاعتماد
                <input
                  className="input"
                  value={form.approvalText}
                  onChange={(event) => setForm((current) => ({ ...current, approvalText: event.target.value }))}
                  placeholder="تمت المراجعة والاعتماد"
                />
              </label>

              <label className="grid-span-full">صور مرفقة
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => setForm((current) => ({ ...current, images: Array.from(event.target.files || []) }))}
                />
              </label>
            </div>

            <div className="inline-checks" style={{ marginTop: 12 }}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={!!form.visitCompletedSuccessfully}
                  onChange={(event) => setForm((current) => ({ ...current, visitCompletedSuccessfully: event.target.checked }))}
                />
                هل تمت الزيارة بنجاح؟
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={!!form.followUpRequired}
                  onChange={(event) => setForm((current) => ({ ...current, followUpRequired: event.target.checked }))}
                />
                هل تحتاج متابعة؟
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={!!form.paidRepairRequired}
                  onChange={(event) => setForm((current) => ({ ...current, paidRepairRequired: event.target.checked }))}
                />
                هل تحتاج صيانة مدفوعة إضافية؟
              </label>
            </div>
          </section>

          <section className="maintenance-form-section">
            <div className="maintenance-section-head">
              <strong>التواقيع والاعتماد</strong>
              <span>تظهر هذه القيم داخل تقرير الـ PDF وتفاصيل الزيارة</span>
            </div>

            <div className="grid-3">
              <label>توقيع الزبون
                <input
                  className="input"
                  value={form.customerSignature}
                  onChange={(event) => setForm((current) => ({ ...current, customerSignature: event.target.value }))}
                  placeholder="اسم الزبون أو التوقيع المعتمد"
                />
              </label>

              <label>توقيع الفني أو المهندس
                <input
                  className="input"
                  value={form.technicianSignature}
                  onChange={(event) => setForm((current) => ({ ...current, technicianSignature: event.target.value }))}
                  placeholder="اسم الفني أو المهندس"
                />
              </label>

              <label>توقيع مدير المشاريع
                <input
                  className="input"
                  value={form.projectManagerSignature}
                  onChange={(event) => setForm((current) => ({ ...current, projectManagerSignature: event.target.value }))}
                  placeholder="اسم مدير المشاريع"
                />
              </label>
            </div>
          </section>

          <section className="maintenance-form-section">
            <div className="maintenance-section-head">
              <strong>تقييم الفني أو المهندس</strong>
              <span>اختر نقطة التقييم ثم عدل النسبة إذا احتجت</span>
            </div>

            <div className="maintenance-evaluation-options">
              {technicianEvaluationOptions.map(([value, label]) => (
                <label key={value} className="maintenance-evaluation-choice">
                  <input
                    type="checkbox"
                    checked={form.technicianEvaluationGrade === value}
                    onChange={() => handleEvaluationChange(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="grid-3" style={{ marginTop: 14 }}>
              <label>نسبة التقييم
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={form.technicianEvaluationPercent}
                  onChange={(event) => setForm((current) => ({ ...current, technicianEvaluationPercent: event.target.value }))}
                  placeholder="0 - 100"
                />
              </label>
            </div>
          </section>

          <div className="form-actions form-actions-end">
            <button type="button" className="btn btn-soft" onClick={onClose} disabled={saving}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ الزيارة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
