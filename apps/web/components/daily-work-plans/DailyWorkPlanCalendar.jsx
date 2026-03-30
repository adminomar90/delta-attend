'use client';

import { useMemo } from 'react';
import ProgressGauge from '../ProgressGauge';
import {
  DailyWorkPlanStatus,
  dailyWorkPlanPriorityClassMap,
  dailyWorkPlanStatusClassMap,
  formatAssigneesSummary,
  formatDate,
  toDateInputValue,
} from '../../lib/dailyWorkPlans';

const weekLabels = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];

const toDateKey = (value) => toDateInputValue(value);

const createDateFromKey = (value) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
};

const createMonthAnchor = (value = new Date()) => {
  const date = value instanceof Date ? value : createDateFromKey(value);
  const safeDate = date && !Number.isNaN(date.getTime()) ? date : new Date();
  return new Date(Date.UTC(safeDate.getUTCFullYear(), safeDate.getUTCMonth(), 1, 12, 0, 0, 0));
};

const shiftMonth = (value, step) => {
  const monthAnchor = createMonthAnchor(value);
  return new Date(Date.UTC(
    monthAnchor.getUTCFullYear(),
    monthAnchor.getUTCMonth() + step,
    1,
    12,
    0,
    0,
    0,
  ));
};

const buildCalendarCells = ({ monthDate, plansByDay, selectedDate }) => {
  const monthAnchor = createMonthAnchor(monthDate);
  const year = monthAnchor.getUTCFullYear();
  const month = monthAnchor.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1, 12, 0, 0, 0));
  const firstWeekdayIndex = (firstDay.getUTCDay() + 1) % 7;
  const totalDays = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0, 0)).getUTCDate();
  const todayKey = toDateKey(new Date());
  const cells = [];

  for (let index = 0; index < firstWeekdayIndex; index += 1) {
    cells.push({ key: `empty-${index}`, isPlaceholder: true });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const currentDate = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
    const dateKey = toDateKey(currentDate);
    const dayPlans = plansByDay.get(dateKey) || [];
    const completedCount = dayPlans.filter((plan) => plan.status === DailyWorkPlanStatus.COMPLETED).length;
    const openCount = Math.max(0, dayPlans.length - completedCount);
    const statuses = [...new Set(dayPlans.map((plan) => plan.status).filter(Boolean))].slice(0, 4);

    cells.push({
      key: dateKey,
      dateKey,
      dayNumber: day,
      totalCount: dayPlans.length,
      completedCount,
      openCount,
      statuses,
      isSelected: dateKey === selectedDate,
      isToday: dateKey === todayKey,
      isPlaceholder: false,
    });
  }

  return cells;
};

const isCompletedPlan = (plan) => plan.status === DailyWorkPlanStatus.COMPLETED;

export default function DailyWorkPlanCalendar({
  open,
  loading,
  monthDate,
  plans,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  onOpenDetails,
}) {
  const monthAnchor = useMemo(() => createMonthAnchor(monthDate), [monthDate]);

  const plansByDay = useMemo(() => {
    const grouped = new Map();
    (plans || []).forEach((plan) => {
      const dateKey = toDateKey(plan.planDate);
      if (!dateKey) return;
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey).push(plan);
    });
    return grouped;
  }, [plans]);

  const calendarCells = useMemo(
    () => buildCalendarCells({ monthDate: monthAnchor, plansByDay, selectedDate }),
    [monthAnchor, plansByDay, selectedDate],
  );

  const selectedDayPlans = useMemo(
    () => (selectedDate ? (plansByDay.get(selectedDate) || []) : []),
    [plansByDay, selectedDate],
  );

  const completedPlans = useMemo(
    () => selectedDayPlans.filter((plan) => isCompletedPlan(plan)),
    [selectedDayPlans],
  );

  const pendingPlans = useMemo(
    () => selectedDayPlans.filter((plan) => !isCompletedPlan(plan)),
    [selectedDayPlans],
  );

  const monthTitle = useMemo(
    () => monthAnchor.toLocaleDateString('ar-IQ', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    [monthAnchor],
  );

  const selectedDateLabel = selectedDate ? formatDate(selectedDate) : 'اختر يوما من التقويم';

  if (!open) return null;

  return (
    <section className="card section daily-plan-calendar-panel" style={{ marginTop: 16 }}>
      <div className="daily-plan-calendar-header">
        <div>
          <h2 style={{ margin: 0 }}>تقويم البلان اليومي</h2>
          <p className="daily-plan-modal-subtitle">
            اختر اليوم المطلوب لعرض جميع الأعمال المنجزة وغير المنجزة مع تلوين الحالات.
          </p>
        </div>

        <div className="daily-plan-calendar-actions">
          <button type="button" className="btn btn-soft btn-sm" onClick={() => onChangeMonth(shiftMonth(monthAnchor, -1))}>
            الشهر السابق
          </button>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => onChangeMonth(createMonthAnchor(new Date()))}>
            هذا الشهر
          </button>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => onChangeMonth(shiftMonth(monthAnchor, 1))}>
            الشهر التالي
          </button>
        </div>
      </div>

      <div className="daily-plan-calendar-layout">
        <div className="daily-plan-calendar-board">
          <div className="daily-plan-calendar-month-row">
            <strong>{monthTitle}</strong>
            <span>{loading ? 'جار تحميل بيانات الشهر...' : `${plans.length} بلان ضمن هذا الشهر`}</span>
          </div>

          <div className="daily-plan-calendar-weekdays">
            {weekLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="daily-plan-calendar-grid">
            {calendarCells.map((cell) => {
              if (cell.isPlaceholder) {
                return <div key={cell.key} className="daily-plan-calendar-day daily-plan-calendar-day-empty" aria-hidden="true" />;
              }

              return (
                <button
                  key={cell.key}
                  type="button"
                  className={[
                    'daily-plan-calendar-day',
                    cell.isSelected ? 'daily-plan-calendar-day-active' : '',
                    cell.isToday ? 'daily-plan-calendar-day-today' : '',
                    cell.totalCount ? 'daily-plan-calendar-day-busy' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => onSelectDate(cell.dateKey)}
                >
                  <div className="daily-plan-calendar-day-head">
                    <strong>{cell.dayNumber}</strong>
                    {cell.totalCount ? <small>{cell.totalCount}</small> : null}
                  </div>

                  {cell.totalCount ? (
                    <>
                      <div className="daily-plan-calendar-day-counts">
                        <span className="daily-plan-calendar-completed">منجز {cell.completedCount}</span>
                        <span className="daily-plan-calendar-open">غير منجز {cell.openCount}</span>
                      </div>

                      <div className="daily-plan-calendar-markers">
                        {cell.statuses.map((status) => (
                          <span
                            key={`${cell.dateKey}-${status}`}
                            className={`daily-plan-calendar-marker ${dailyWorkPlanStatusClassMap[status] || 'status-todo'}`}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="daily-plan-calendar-day-empty-label">لا توجد أعمال</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="daily-plan-calendar-sidebar">
          <div className="daily-plan-calendar-selected-head">
            <div>
              <strong>{selectedDateLabel}</strong>
              <div className="daily-plan-card-subtitle">
                {selectedDate
                  ? `${selectedDayPlans.length} عمل لهذا اليوم`
                  : 'اختر يوما من التقويم لعرض تفاصيل الأعمال'}
              </div>
            </div>

            {selectedDate ? (
              <button type="button" className="btn btn-soft btn-sm" onClick={() => onSelectDate('')}>
                إلغاء اليوم
              </button>
            ) : null}
          </div>

          {!selectedDate ? (
            <p className="maintenance-empty">اختر يوما من التقويم لعرض جميع الأعمال الخاصة به.</p>
          ) : loading ? (
            <p className="maintenance-empty">جار تحميل الأعمال الخاصة بهذا اليوم...</p>
          ) : (
            <>
              <div className="daily-plan-calendar-summary-grid">
                <div className="daily-plan-info-box">
                  <span>إجمالي الأعمال</span>
                  <strong>{selectedDayPlans.length}</strong>
                </div>
                <div className="daily-plan-info-box">
                  <span>منجزة</span>
                  <strong>{completedPlans.length}</strong>
                </div>
                <div className="daily-plan-info-box">
                  <span>غير منجزة</span>
                  <strong>{pendingPlans.length}</strong>
                </div>
              </div>

              <div className="daily-plan-calendar-day-lists">
                <div className="daily-plan-calendar-group">
                  <div className="daily-plan-calendar-group-head">
                    <strong>الأعمال غير المنجزة</strong>
                    <span>{pendingPlans.length}</span>
                  </div>

                  {pendingPlans.length ? pendingPlans.map((plan) => (
                    <article key={plan._id || plan.id} className="daily-plan-calendar-task">
                      <div className="daily-plan-calendar-task-head">
                        <div>
                          <strong>{plan.title}</strong>
                          <div className="daily-plan-card-subtitle">
                            {plan.customerName || plan.project?.name || 'بدون جهة'} - {plan.location || 'بدون موقع'}
                          </div>
                        </div>

                        <div className="daily-plan-chip-row">
                          <span className={`status-pill ${dailyWorkPlanStatusClassMap[plan.status] || 'status-todo'}`}>
                            {plan.statusLabel || plan.status}
                          </span>
                          <span className={`status-pill ${dailyWorkPlanPriorityClassMap[plan.priority] || 'status-todo'}`}>
                            {plan.priorityLabel || plan.priority}
                          </span>
                        </div>
                      </div>

                      <div className="daily-plan-calendar-task-meta">
                        <span>المكلفون: {formatAssigneesSummary(plan.assignees, { maxVisible: 3 })}</span>
                        <span>الوقت: {[plan.startTime, plan.expectedEndTime].filter(Boolean).join(' - ') || '-'}</span>
                      </div>

                      <div className="daily-plan-calendar-task-footer">
                        <ProgressGauge value={plan.displayProgressPercent || plan.progressPercent || 0} />
                        <button type="button" className="btn btn-soft btn-sm" onClick={() => onOpenDetails(plan)}>
                          التفاصيل
                        </button>
                      </div>
                    </article>
                  )) : (
                    <p className="maintenance-empty">لا توجد أعمال غير منجزة في هذا اليوم.</p>
                  )}
                </div>

                <div className="daily-plan-calendar-group">
                  <div className="daily-plan-calendar-group-head">
                    <strong>الأعمال المنجزة</strong>
                    <span>{completedPlans.length}</span>
                  </div>

                  {completedPlans.length ? completedPlans.map((plan) => (
                    <article key={plan._id || plan.id} className="daily-plan-calendar-task daily-plan-calendar-task-completed">
                      <div className="daily-plan-calendar-task-head">
                        <div>
                          <strong>{plan.title}</strong>
                          <div className="daily-plan-card-subtitle">
                            {plan.customerName || plan.project?.name || 'بدون جهة'} - {plan.location || 'بدون موقع'}
                          </div>
                        </div>

                        <div className="daily-plan-chip-row">
                          <span className={`status-pill ${dailyWorkPlanStatusClassMap[plan.status] || 'status-approved'}`}>
                            {plan.statusLabel || plan.status}
                          </span>
                          <span className={`status-pill ${dailyWorkPlanPriorityClassMap[plan.priority] || 'status-todo'}`}>
                            {plan.priorityLabel || plan.priority}
                          </span>
                        </div>
                      </div>

                      <div className="daily-plan-calendar-task-meta">
                        <span>المكلفون: {formatAssigneesSummary(plan.assignees, { maxVisible: 3 })}</span>
                        <span>الوقت: {[plan.startTime, plan.expectedEndTime].filter(Boolean).join(' - ') || '-'}</span>
                      </div>

                      <div className="daily-plan-calendar-task-footer">
                        <ProgressGauge value={plan.displayProgressPercent || plan.progressPercent || 0} />
                        <button type="button" className="btn btn-soft btn-sm" onClick={() => onOpenDetails(plan)}>
                          التفاصيل
                        </button>
                      </div>
                    </article>
                  )) : (
                    <p className="maintenance-empty">لا توجد أعمال منجزة في هذا اليوم.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
