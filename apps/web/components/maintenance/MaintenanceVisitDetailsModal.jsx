'use client';

import { assetUrl } from '../../lib/api';
import {
  formatDate,
  formatDateTime,
  visitStatusClassMap,
} from '../../lib/maintenancePlans';

const yesNo = (value) => (value ? 'نعم' : 'لا');
const safeValue = (value) => String(value || '').trim() || '-';
const maintenanceTypeLabel = (value) => (value === 'FREE' ? 'مجانية' : value === 'PAID' ? 'مدفوعة' : '-');

function DetailBlock({ title, value }) {
  if (!String(value || '').trim()) {
    return null;
  }

  return (
    <div className="maintenance-visit-detail-block">
      <strong>{title}</strong>
      <p>{value}</p>
    </div>
  );
}

export default function MaintenanceVisitDetailsModal({
  open,
  visit,
  actionState = '',
  onClose,
  onOpenPdf,
  onSendWhatsapp,
}) {
  if (!open || !visit) {
    return null;
  }

  const isOpeningPdf = actionState === `pdf:${visit.id}`;
  const isOpeningWhatsapp = actionState === `whatsapp:${visit.id}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel maintenance-modal-panel maintenance-visit-details-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>تفاصيل زيارة الصيانة</h3>
            <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
              {safeValue(visit.maintenancePlan?.customerName)} - {safeValue(visit.maintenancePlan?.projectName)}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>x</button>
        </div>

        <div className="maintenance-visit-detail-stack">
          <section className="maintenance-form-section">
            <div className="maintenance-card-header">
              <div>
                <strong>{safeValue(visit.maintenancePlan?.customerName)}</strong>
                <div className="maintenance-card-subtitle">
                  {safeValue(visit.maintenancePlan?.projectNumber)} - {safeValue(visit.maintenancePlan?.location)}
                </div>
              </div>
              <div className="maintenance-chip-row">
                <span className={`status-pill ${visitStatusClassMap[visit.status] || 'status-approved'}`}>
                  {safeValue(visit.statusLabel)}
                </span>
                <span className="status-pill status-todo">
                  {maintenanceTypeLabel(visit.maintenancePlan?.maintenanceType)}
                </span>
              </div>
            </div>

            <div className="maintenance-mini-grid maintenance-visit-detail-grid">
              <div><span>تاريخ الزيارة</span><strong>{formatDate(visit.visitDate)}</strong></div>
              <div><span>تاريخ التسجيل</span><strong>{formatDateTime(visit.createdAt)}</strong></div>
              <div><span>الفني أو المهندس</span><strong>{safeValue(visit.technicianName)}</strong></div>
              <div><span>رقم الفني</span><strong>{safeValue(visit.technician?.phone)}</strong></div>
              <div><span>نوع الزيارة</span><strong>{safeValue(visit.visitType)}</strong></div>
              <div><span>نسبة الإنجاز</span><strong>{Number(visit.completionRate || 0)}%</strong></div>
              <div><span>هاتف الزبون / الموقع</span><strong>{safeValue(visit.maintenancePlan?.phone)}</strong></div>
              <div><span>سجلت بواسطة</span><strong>{safeValue(visit.createdBy?.fullName)}</strong></div>
            </div>
          </section>

          <section className="maintenance-form-section">
            <div className="maintenance-section-head">
              <strong>حالة الزيارة</strong>
              <span>ملخص سريع لنتيجة الزيارة والمتابعة المطلوبة</span>
            </div>
            <div className="maintenance-chip-row maintenance-visit-badges">
              <span className={`status-pill ${visit.visitCompletedSuccessfully ? 'status-approved' : 'status-rejected'}`}>
                تمت بنجاح: {yesNo(visit.visitCompletedSuccessfully)}
              </span>
              <span className={`status-pill ${visit.followUpRequired ? 'status-inprogress' : 'status-approved'}`}>
                متابعة: {yesNo(visit.followUpRequired)}
              </span>
              <span className={`status-pill ${visit.paidRepairRequired ? 'status-rejected' : 'status-approved'}`}>
                صيانة مدفوعة: {yesNo(visit.paidRepairRequired)}
              </span>
            </div>
          </section>

          <section className="maintenance-form-section">
            <div className="maintenance-section-head">
              <strong>تقييم الفني أو المهندس</strong>
              <span>مستوى التقييم والنسبة المعتمدة داخل التقرير</span>
            </div>
            <div className="maintenance-mini-grid maintenance-visit-detail-grid">
              <div><span>درجة التقييم</span><strong>{safeValue(visit.technicianEvaluationGradeLabel)}</strong></div>
              <div><span>نسبة التقييم</span><strong>{visit.technicianEvaluationPercent ? `${Number(visit.technicianEvaluationPercent)}%` : '-'}</strong></div>
            </div>
            <div className="maintenance-evaluation-readonly" style={{ marginTop: 12 }}>
              <span className={`status-pill ${visit.technicianEvaluationGrade === 'GOOD' ? 'status-approved' : 'status-todo'}`}>جيد</span>
              <span className={`status-pill ${visit.technicianEvaluationGrade === 'ACCEPTABLE' ? 'status-submitted' : 'status-todo'}`}>مقبول</span>
              <span className={`status-pill ${visit.technicianEvaluationGrade === 'EXCELLENT' ? 'status-approved' : 'status-todo'}`}>ممتاز</span>
            </div>
          </section>

          <section className="maintenance-form-section">
            <div className="maintenance-section-head">
              <strong>التواقيع والاعتماد</strong>
              <span>التواقيع المسجلة داخل التقرير</span>
            </div>
            <div className="maintenance-mini-grid maintenance-visit-detail-grid">
              <div><span>توقيع الزبون</span><strong>{safeValue(visit.customerSignature)}</strong></div>
              <div><span>توقيع الفني أو المهندس</span><strong>{safeValue(visit.technicianSignature)}</strong></div>
              <div><span>توقيع مدير المشاريع</span><strong>{safeValue(visit.projectManagerSignature)}</strong></div>
              <div><span>اعتماد عام</span><strong>{safeValue(visit.signedBy)}</strong></div>
            </div>
            {visit.approvalText ? <DetailBlock title="نص الاعتماد" value={visit.approvalText} /> : null}
          </section>

          <DetailBlock title="حالة الأجهزة" value={visit.deviceStatus} />
          <DetailBlock title="الأعمال المنفذة" value={visit.workDone} />
          <DetailBlock title="الملاحظات" value={visit.notes} />
          <DetailBlock title="التوصيات" value={visit.recommendations} />

          <section className="maintenance-form-section">
            <div className="maintenance-section-head">
              <strong>الصور المرفقة</strong>
              <span>{(visit.images || []).length} صورة</span>
            </div>

            {(visit.images || []).length ? (
              <div className="maintenance-visit-gallery">
                {visit.images.map((image) => (
                  <a
                    key={image.id}
                    className="maintenance-visit-image-card"
                    href={assetUrl(image.url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img src={assetUrl(image.url)} alt={image.originalName || 'maintenance-visit'} />
                    <div className="maintenance-visit-image-meta">
                      <strong>{safeValue(image.originalName)}</strong>
                      {image.comment ? <span>{image.comment}</span> : null}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="maintenance-empty">لا توجد صور مرفقة لهذه الزيارة.</p>
            )}
          </section>

          <div className="form-actions maintenance-visit-actions">
            <button type="button" className="btn btn-soft" onClick={onClose}>إغلاق</button>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => onOpenPdf?.(visit)}
              disabled={isOpeningPdf}
            >
              {isOpeningPdf ? 'جارٍ فتح PDF...' : 'عرض PDF'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSendWhatsapp?.(visit)}
              disabled={isOpeningWhatsapp}
            >
              {isOpeningWhatsapp ? 'جارٍ تجهيز واتساب...' : 'إرسال واتساب'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
