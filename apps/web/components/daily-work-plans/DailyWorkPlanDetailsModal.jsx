'use client';

import { assetUrl } from '../../lib/api';
import ProgressGauge from '../ProgressGauge';
import {
  dailyWorkPlanPriorityClassMap,
  dailyWorkPlanStatusClassMap,
  formatDate,
  formatDateTime,
} from '../../lib/dailyWorkPlans';

export default function DailyWorkPlanDetailsModal({
  open,
  plan,
  onClose,
  onSendWhatsApp,
}) {
  if (!open || !plan) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel daily-plan-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{plan.title}</h3>
            <p className="daily-plan-modal-subtitle">
              {plan.customerName || plan.project?.name || 'بدون جهة'} - {plan.location || 'بدون موقع'}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="daily-plan-detail-grid">
          <div className="daily-plan-info-box">
            <span>الحالة</span>
            <strong className={`status-pill ${dailyWorkPlanStatusClassMap[plan.status] || 'status-todo'}`}>
              {plan.statusLabel || plan.status}
            </strong>
          </div>
          <div className="daily-plan-info-box">
            <span>الأولوية</span>
            <strong className={`status-pill ${dailyWorkPlanPriorityClassMap[plan.priority] || 'status-todo'}`}>
              {plan.priorityLabel || plan.priority}
            </strong>
          </div>
          <div className="daily-plan-info-box">
            <span>التاريخ</span>
            <strong>{formatDate(plan.planDate)}</strong>
          </div>
          <div className="daily-plan-info-box">
            <span>الوقت</span>
            <strong>{[plan.startTime, plan.expectedEndTime].filter(Boolean).join(' - ') || '-'}</strong>
          </div>
          {plan.isApproved ? (
            <div className="daily-plan-info-box">
              <span>إجمالي النقاط</span>
              <strong>{plan.pointsAwardedTotal || 0}</strong>
            </div>
          ) : null}
          {plan.postponedTo ? (
            <div className="daily-plan-info-box">
              <span>مؤجلة إلى</span>
              <strong>{formatDateTime(plan.postponedTo)}</strong>
            </div>
          ) : null}
          {plan.archivedAt ? (
            <div className="daily-plan-info-box">
              <span>تاريخ الأرشفة</span>
              <strong>{formatDateTime(plan.archivedAt)}</strong>
            </div>
          ) : null}
          {plan.archivedBy?.fullName ? (
            <div className="daily-plan-info-box">
              <span>تمت الأرشفة بواسطة</span>
              <strong>{plan.archivedBy.fullName}</strong>
            </div>
          ) : null}
        </div>

        <div className="daily-plan-note-block">
          <strong>وصف المهمة</strong>
          <p>{plan.description || 'لا يوجد وصف.'}</p>
        </div>

        <div className="daily-plan-note-block">
          <strong>قائد الفريق</strong>
          <p>{plan.teamLeader?.fullName || 'غير محدد'}</p>
        </div>

        <div className="daily-plan-note-block">
          <strong>ملاحظات الإدارة</strong>
          <p>{plan.adminNotes || 'لا توجد ملاحظات.'}</p>
        </div>

        <div className="daily-plan-progress-row">
          <span>{plan.displayProgressLabel || 'نسبة الإنجاز العامة'}</span>
          <ProgressGauge value={plan.displayProgressPercent || plan.progressPercent || 0} />
        </div>

        <h4 className="daily-plan-section-title">المكلفون</h4>
        <div className="daily-plan-assignee-list">
          {(plan.assignees || []).map((assignee) => (
            <div key={assignee.user?._id || assignee.user?.id || assignee.user} className="daily-plan-assignee-item">
              <div>
                <strong>{assignee.user?.fullName || 'موظف'}</strong>
                <div className="daily-plan-card-subtitle">{assignee.user?.jobTitle || assignee.user?.role || '-'}</div>
                {plan.isApproved ? (
                  <div className="daily-plan-card-subtitle">النقاط الممنوحة: {assignee.pointsAwarded || 0}</div>
                ) : null}
                {assignee.teamLeaderRating !== null && assignee.teamLeaderRating !== undefined ? (
                  <div className="daily-plan-card-subtitle">تقييم قائد الفريق: {assignee.teamLeaderRating}/100</div>
                ) : null}
              </div>
              <div className="daily-plan-chip-row">
                <span className={`status-pill ${dailyWorkPlanStatusClassMap[assignee.status] || 'status-todo'}`}>
                  {assignee.status}
                </span>
                <span className="status-pill status-approved">{assignee.progressPercent || 0}%</span>
              </div>
            </div>
          ))}
        </div>

        <h4 className="daily-plan-section-title">المرفقات</h4>
        {(plan.attachments || []).length ? (
          <div className="daily-plan-attachment-grid">
            {plan.attachments.map((attachment, index) => {
              const isImage = String(attachment.mimeType || '').startsWith('image/');
              const href = assetUrl(attachment.publicUrl || attachment.url || '');
              return (
                <a key={`${attachment.publicUrl || attachment.fileName || index}`} href={href} target="_blank" rel="noreferrer" className="daily-plan-attachment-card">
                  {isImage ? <img src={href} alt={attachment.originalName || attachment.fileName || 'attachment'} /> : <div className="daily-plan-attachment-file">ملف</div>}
                  <strong>{attachment.originalName || attachment.fileName || 'مرفق'}</strong>
                  <span>{attachment.uploadedByName || '-'}</span>
                </a>
              );
            })}
          </div>
        ) : (
          <p className="maintenance-empty">لا توجد مرفقات.</p>
        )}

        <h4 className="daily-plan-section-title">السجل الزمني</h4>
        <div className="daily-plan-timeline">
          {(plan.timeline || []).length ? plan.timeline.map((entry, index) => (
            <div key={`${entry.type}-${entry.createdAt || index}`} className="daily-plan-timeline-item">
              <div className="daily-plan-timeline-dot" />
              <div className="daily-plan-timeline-content">
                <strong>{entry.message || entry.type}</strong>
                <span>{entry.actorName || 'النظام'} - {formatDateTime(entry.createdAt)}</span>
              </div>
            </div>
          )) : <p className="maintenance-empty">لا يوجد سجل تحديثات بعد.</p>}
        </div>

        <div className="maintenance-modal-actions" style={{ marginTop: 18 }}>
          {onSendWhatsApp ? (
            <button type="button" className="btn btn-soft" onClick={() => onSendWhatsApp(plan)}>
              واتساب
            </button>
          ) : null}
          <button type="button" className="btn btn-soft" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}
