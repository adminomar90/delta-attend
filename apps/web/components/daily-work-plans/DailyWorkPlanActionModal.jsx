'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildApprovePayload,
  buildFinishPayload,
  buildPostponePayload,
  buildProgressFormData,
  buildStatusPayload,
  createApproveFormDefaults,
  createFinishFormDefaults,
  createPostponeFormDefaults,
  createProgressFormDefaults,
  createStatusFormDefaults,
  dailyWorkPlanStatusOptions,
  sanitizeIntegerInput,
} from '../../lib/dailyWorkPlans';

const modeConfig = {
  progress: {
    title: 'تحديث نسبة الإنجاز',
    submitLabel: 'حفظ التحديث',
  },
  status: {
    title: 'تحديث الحالة',
    submitLabel: 'تحديث الحالة',
  },
  postpone: {
    title: 'تأجيل المهمة',
    submitLabel: 'تأكيد التأجيل',
  },
  finish: {
    title: 'إنهاء البلان وإرسال للاعتماد',
    submitLabel: 'إرسال للاعتماد',
  },
  approve: {
    title: 'اعتماد البلان',
    submitLabel: 'اعتماد',
  },
};

export default function DailyWorkPlanActionModal({
  open,
  mode,
  plan,
  users,
  currentUserId,
  canManage,
  saving,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (!open) return;

    if (mode === 'progress') {
      const fallbackAssigneeId = plan?.assignees?.[0]?.user?._id || plan?.assignees?.[0]?.user?.id || '';
      const selectedAssigneeId = canManage ? fallbackAssigneeId : currentUserId;
      const progressDefaults = createProgressFormDefaults(plan, canManage ? fallbackAssigneeId : currentUserId);
      const assigneeProgress = (plan?.assignees || []).find((assignee) => {
        const userId = assignee.user?._id || assignee.user?.id || assignee.user;
        return String(userId || '') === String(selectedAssigneeId || '');
      })?.progressPercent;

      setForm({
        ...progressDefaults,
        progressPercent: assigneeProgress ?? progressDefaults.progressPercent,
      });
      return;
    }

    if (mode === 'status') {
      setForm(createStatusFormDefaults());
      return;
    }

    if (mode === 'postpone') {
      setForm(createPostponeFormDefaults(plan));
      return;
    }

    if (mode === 'approve') {
      setForm(createApproveFormDefaults(plan));
    }

    if (mode === 'finish') {
      setForm(createFinishFormDefaults(plan));
    }
  }, [canManage, currentUserId, mode, open, plan]);

  const visibleStatusOptions = canManage
    ? dailyWorkPlanStatusOptions
    : dailyWorkPlanStatusOptions.filter(([value]) => ['IN_PROGRESS', 'PENDING_APPROVAL', 'STOPPED'].includes(value));

  const approveAssignees = useMemo(
    () => {
      const list = (plan?.assignees || []).map((assignee) => {
        const userId = assignee.user?._id || assignee.user?.id || assignee.user || '';
        const fallbackUser = users.find((item) => item.id === userId) || {};

        return {
          userId,
          fullName: assignee.user?.fullName || fallbackUser.fullName || 'موظف',
          roleLabel: assignee.user?.jobTitle || assignee.user?.role || fallbackUser.jobTitle || fallbackUser.role || '-',
          status: assignee.status || '-',
          progressPercent: assignee.progressPercent || 0,
          currentPoints: Number(assignee.user?.pointsTotal || 0),
          teamLeaderRating: assignee.teamLeaderRating ?? null,
          isTeamLeader: false,
        };
      });

      const teamLeaderId = plan?.teamLeader?._id || plan?.teamLeader?.id || plan?.teamLeader || '';
      const assigneeIds = new Set(list.map((a) => String(a.userId)));
      if (teamLeaderId && !assigneeIds.has(String(teamLeaderId))) {
        const tlUser = users.find((item) => item.id === String(teamLeaderId)) || {};
        list.push({
          userId: String(teamLeaderId),
          fullName: plan?.teamLeader?.fullName || tlUser.fullName || 'قائد الفريق',
          roleLabel: plan?.teamLeader?.jobTitle || plan?.teamLeader?.role || tlUser.jobTitle || tlUser.role || '-',
          status: '-',
          progressPercent: '-',
          currentPoints: Number(plan?.teamLeader?.pointsTotal || tlUser.pointsTotal || 0),
          teamLeaderRating: null,
          isTeamLeader: true,
        });
      }

      return list;
    },
    [plan?.assignees, plan?.teamLeader, users],
  );

  const approvalTotalPoints = useMemo(
    () => Object.values(form.pointsByAssignee || {}).reduce((sum, value) => {
      const parsed = Number(value);
      return sum + (Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0);
    }, 0),
    [form.pointsByAssignee],
  );

  const updateAssigneePoints = (userId, value) => {
    setForm((prev) => ({
      ...prev,
      pointsByAssignee: {
        ...(prev.pointsByAssignee || {}),
        [userId]: value,
      },
    }));
  };

  const updateAssigneeRating = (userId, value) => {
    setForm((prev) => ({
      ...prev,
      ratingsByAssignee: {
        ...(prev.ratingsByAssignee || {}),
        [userId]: value,
      },
    }));
  };

  if (!open || !mode) return null;

  const submitPayload = () => {
    if (mode === 'progress') return onSubmit(buildProgressFormData(form));
    if (mode === 'status') return onSubmit(buildStatusPayload(form));
    if (mode === 'postpone') return onSubmit(buildPostponePayload(form));
    if (mode === 'approve') return onSubmit(buildApprovePayload(form));
    if (mode === 'finish') return onSubmit(buildFinishPayload(form));
    return null;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{modeConfig[mode]?.title || 'إجراء على البلان'}</h3>
            <p className="daily-plan-modal-subtitle">{plan?.title || ''}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {mode === 'progress' ? (
          <div className="daily-plan-form-grid">
            {canManage ? (
              <label>
                الموظف
                <select
                  className="select"
                  value={form.assigneeId || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, assigneeId: event.target.value }))}
                >
                  <option value="">التحديث لنفسي</option>
                  {(plan?.assignees || []).map((assignee) => {
                    const userId = assignee.user?._id || assignee.user?.id || assignee.user;
                    const userName = assignee.user?.fullName || users.find((item) => item.id === userId)?.fullName || 'موظف';
                    return <option key={userId} value={userId}>{userName}</option>;
                  })}
                </select>
              </label>
            ) : null}

            <label>
              نسبة الإنجاز %
              <input
                className="input"
                type="text"
                inputMode="numeric"
                value={form.progressPercent ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, progressPercent: sanitizeIntegerInput(event.target.value) }))}
              />
            </label>

            <label className="grid-span-full">
              ملاحظة
              <textarea
                className="textarea"
                rows={3}
                value={form.note || ''}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </label>

            <label className="grid-span-full">
              رفع صور أو مرفقات
              <input
                className="input"
                type="file"
                multiple
                onChange={(event) => setForm((prev) => ({ ...prev, attachments: Array.from(event.target.files || []) }))}
              />
            </label>
          </div>
        ) : null}

        {mode === 'status' ? (
          <div className="daily-plan-form-grid">
            {canManage ? (
              <label>
                الموظف
                <select
                  className="select"
                  value={form.assigneeId || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, assigneeId: event.target.value }))}
                >
                  <option value="">على مستوى البلان</option>
                  {(plan?.assignees || []).map((assignee) => {
                    const userId = assignee.user?._id || assignee.user?.id || assignee.user;
                    const userName = assignee.user?.fullName || users.find((item) => item.id === userId)?.fullName || 'موظف';
                    return <option key={userId} value={userId}>{userName}</option>;
                  })}
                </select>
              </label>
            ) : null}

            <label>
              الحالة
              <select
                className="select"
                value={form.status || ''}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                {visibleStatusOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="grid-span-full">
              ملاحظة
              <textarea
                className="textarea"
                rows={3}
                value={form.note || ''}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </label>
          </div>
        ) : null}

        {mode === 'postpone' ? (
          <div className="daily-plan-form-grid">
            <label>
              التاريخ الجديد
              <input
                className="input"
                type="date"
                value={form.targetDate || ''}
                onChange={(event) => setForm((prev) => ({ ...prev, targetDate: event.target.value }))}
              />
            </label>
            <label>
              وقت التأجيل
              <input
                className="input"
                type="time"
                value={form.targetTime || ''}
                onChange={(event) => setForm((prev) => ({ ...prev, targetTime: event.target.value }))}
              />
            </label>
            <label className="grid-span-full">
              سبب التأجيل
              <textarea
                className="textarea"
                rows={3}
                value={form.reason || ''}
                onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
              />
            </label>
          </div>
        ) : null}

        {mode === 'finish' ? (
          <div className="daily-plan-form-grid">
            <div className="grid-span-full daily-plan-approval-panel">
              <div className="daily-plan-approval-head">
                <div>
                  <strong>تقييم المشاركين</strong>
                  <p className="daily-plan-picker-hint">قيّم كل موظف مشارك من 100 قبل إرسال البلان للاعتماد.</p>
                </div>
              </div>

              <div className="daily-plan-approval-list">
                {approveAssignees.length ? approveAssignees.map((assignee) => (
                  <div key={assignee.userId} className="daily-plan-approval-row">
                    <div className="daily-plan-approval-meta">
                      <strong>{assignee.fullName}</strong>
                      <span>{assignee.roleLabel}</span>
                      <small>
                        الحالة: {assignee.status} | الإنجاز: {assignee.progressPercent}%
                      </small>
                    </div>

                    <label className="daily-plan-approval-input">
                      <span>التقييم (من 100)</span>
                      <input
                        className="input"
                        type="text"
                        inputMode="numeric"
                        placeholder="0 - 100"
                        value={form.ratingsByAssignee?.[assignee.userId] ?? ''}
                        onChange={(event) => updateAssigneeRating(assignee.userId, sanitizeIntegerInput(event.target.value))}
                      />
                    </label>
                  </div>
                )) : <p className="maintenance-empty">لا يوجد كادر مشارك داخل هذا البلان.</p>}
              </div>
            </div>

            <label className="grid-span-full">
              ملاحظة
              <textarea
                className="textarea"
                rows={3}
                value={form.note || ''}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </label>
          </div>
        ) : null}

        {mode === 'approve' ? (
          <div className="daily-plan-form-grid">
            <div className="grid-span-full daily-plan-approval-panel">
              <div className="daily-plan-approval-head">
                <div>
                  <strong>الكادر المشارك وقائد الفريق</strong>
                  <p className="daily-plan-picker-hint">امنح نقاطًا مستقلة لكل موظف مشارك وقائد الفريق داخل البلان عند الاعتماد النهائي.</p>
                </div>
                <div className="daily-plan-approval-total">
                  <span>إجمالي النقاط الممنوحة</span>
                  <strong>{approvalTotalPoints}</strong>
                </div>
              </div>

              <div className="daily-plan-approval-list">
                {approveAssignees.length ? approveAssignees.map((assignee) => (
                  <div key={assignee.userId} className="daily-plan-approval-row">
                    <div className="daily-plan-approval-meta">
                      <strong>{assignee.fullName}{assignee.isTeamLeader ? ' (قائد الفريق)' : ''}</strong>
                      <span>{assignee.roleLabel}</span>
                      <small>
                        {assignee.isTeamLeader
                          ? `رصيد الموظف الحالي: ${assignee.currentPoints}`
                          : <>الحالة: {assignee.status} | الإنجاز: {assignee.progressPercent}% | رصيد الموظف الحالي: {assignee.currentPoints}
                            {assignee.teamLeaderRating !== null && assignee.teamLeaderRating !== undefined ? ` | تقييم قائد الفريق: ${assignee.teamLeaderRating}/100` : ''}</>
                        }
                      </small>
                    </div>

                    <label className="daily-plan-approval-input">
                      <span>النقاط</span>
                      <input
                        className="input"
                        type="text"
                        inputMode="numeric"
                        value={form.pointsByAssignee?.[assignee.userId] ?? ''}
                        onChange={(event) => updateAssigneePoints(assignee.userId, sanitizeIntegerInput(event.target.value))}
                      />
                    </label>
                  </div>
                )) : <p className="maintenance-empty">لا يوجد كادر مشارك داخل هذا البلان.</p>}
              </div>
            </div>

            <label className="grid-span-full">
              ملاحظة الاعتماد
              <textarea
                className="textarea"
                rows={3}
                value={form.note || ''}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </label>
          </div>
        ) : null}

        <div className="maintenance-modal-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-soft" onClick={onClose}>إلغاء</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submitPayload}>
            {saving ? 'جارٍ التنفيذ...' : modeConfig[mode]?.submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
