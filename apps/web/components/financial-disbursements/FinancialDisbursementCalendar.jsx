'use client';

import { useMemo } from 'react';
import { toDateInputValue } from '../../lib/dailyWorkPlans';

const weekLabels = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];

const resolveDateKey = (request) =>
  toDateInputValue(request?.transactionDate || request?.createdAt || request?.submittedAt);

const createDateFromKey = (value) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return null;
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

const buildCalendarCells = ({ monthDate, requestsByDay, selectedDate, getStatusClass }) => {
  const monthAnchor = createMonthAnchor(monthDate);
  const year = monthAnchor.getUTCFullYear();
  const month = monthAnchor.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1, 12, 0, 0, 0));
  const firstWeekdayIndex = (firstDay.getUTCDay() + 1) % 7;
  const totalDays = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0, 0)).getUTCDate();
  const todayKey = toDateInputValue(new Date());
  const cells = [];

  for (let index = 0; index < firstWeekdayIndex; index += 1) {
    cells.push({ key: `empty-${index}`, isPlaceholder: true });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const currentDate = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
    const dateKey = toDateInputValue(currentDate);
    const dayRequests = requestsByDay.get(dateKey) || [];
    const archivedCount = dayRequests.filter((request) => request.archived).length;
    const totalAmount = dayRequests.reduce((sum, request) => sum + Number(request.amount || 0), 0);
    const currency = dayRequests[0]?.currency || 'IQD';
    const statusClasses = [...new Set(dayRequests.map(getStatusClass).filter(Boolean))].slice(0, 4);

    cells.push({
      key: dateKey,
      dateKey,
      dayNumber: day,
      totalCount: dayRequests.length,
      archivedCount,
      totalAmount,
      currency,
      statusClasses,
      isSelected: dateKey === selectedDate,
      isToday: dateKey === todayKey,
      isPlaceholder: false,
    });
  }

  return cells;
};

export default function FinancialDisbursementCalendar({
  requests,
  monthDate,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  renderRequestCard,
  getStatusClass,
  formatMoney,
  activeTab = 'active',
}) {
  const monthAnchor = useMemo(() => createMonthAnchor(monthDate), [monthDate]);
  const isArchiveTab = activeTab === 'archive';

  const requestsByDay = useMemo(() => {
    const grouped = new Map();
    (requests || []).forEach((request) => {
      const dateKey = resolveDateKey(request);
      if (!dateKey) return;
      if (!grouped.has(dateKey)) grouped.set(dateKey, []);
      grouped.get(dateKey).push(request);
    });
    return grouped;
  }, [requests]);

  const calendarCells = useMemo(
    () => buildCalendarCells({ monthDate: monthAnchor, requestsByDay, selectedDate, getStatusClass }),
    [monthAnchor, requestsByDay, selectedDate, getStatusClass],
  );

  const selectedDayRequests = useMemo(
    () => (selectedDate ? (requestsByDay.get(selectedDate) || []) : []),
    [requestsByDay, selectedDate],
  );

  const selectedDayTotal = useMemo(
    () => selectedDayRequests.reduce((sum, request) => sum + Number(request.amount || 0), 0),
    [selectedDayRequests],
  );

  const selectedDayApprovedTotal = useMemo(
    () => selectedDayRequests.reduce(
      (sum, request) => sum + Number(request.approvedAmount != null ? request.approvedAmount : request.amount || 0),
      0,
    ),
    [selectedDayRequests],
  );

  const selectedDayAttachments = useMemo(
    () => selectedDayRequests.reduce((sum, request) => sum + Number((request.attachments || []).length), 0),
    [selectedDayRequests],
  );

  const selectedDayCurrency = selectedDayRequests[0]?.currency || 'IQD';

  const monthTitle = useMemo(
    () => monthAnchor.toLocaleDateString('ar-IQ', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    [monthAnchor],
  );

  const selectedDateLabel = selectedDate
    ? new Date(`${selectedDate}T12:00:00.000Z`).toLocaleDateString('ar-IQ', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : 'اختر يومًا من التقويم';

  return (
    <section className="card section daily-plan-calendar-panel" style={{ marginTop: 16 }}>
      <div className="daily-plan-calendar-header">
        <div>
          <h2 style={{ margin: 0 }}>{isArchiveTab ? 'تقويم الأرشيف المالي' : 'تقويم الصرف المالي'}</h2>
          <p className="daily-plan-modal-subtitle">
            {isArchiveTab
              ? 'استعرض المعاملات المؤرشفة على شكل تقويم، ثم افتح يومًا محددًا لعرضها كبطاقات.'
              : 'استعرض المعاملات المالية حسب تاريخ المعاملة، ثم افتح أي يوم لعرض المعاملات كبطاقات مفصلة.'}
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
            <span>{`${requests.length} معاملة ضمن نتائج العرض الحالية`}</span>
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
                        <span className="daily-plan-calendar-completed">المبلغ {formatMoney(cell.totalAmount, cell.currency)}</span>
                        {cell.archivedCount ? <span className="status-pill status-archived">مؤرشف {cell.archivedCount}</span> : null}
                      </div>

                      <div className="daily-plan-calendar-markers">
                        {cell.statusClasses.map((statusClass, index) => (
                          <span
                            key={`${cell.dateKey}-${statusClass}-${index}`}
                            className={`daily-plan-calendar-marker ${statusClass}`}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="daily-plan-calendar-day-empty-label">لا توجد معاملات</div>
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
                  ? `${selectedDayRequests.length} معاملة لهذا اليوم`
                  : 'اختر يومًا من التقويم لعرض المعاملات الخاصة به'}
              </div>
            </div>

            {selectedDate ? (
              <button type="button" className="btn btn-soft btn-sm" onClick={() => onSelectDate('')}>
                إلغاء اليوم
              </button>
            ) : null}
          </div>

          {!selectedDate ? (
            <p className="maintenance-empty">اختر يومًا من التقويم لعرض المعاملات المالية الخاصة به.</p>
          ) : (
            <>
              <div className="daily-plan-calendar-summary-grid">
                <div className="daily-plan-info-box">
                  <span>عدد المعاملات</span>
                  <strong>{selectedDayRequests.length}</strong>
                </div>
                <div className="daily-plan-info-box">
                  <span>المرفقات</span>
                  <strong>{selectedDayAttachments}</strong>
                </div>
                <div className="daily-plan-info-box">
                  <span>إجمالي المبلغ</span>
                  <strong>{formatMoney(selectedDayTotal, selectedDayCurrency)}</strong>
                </div>
                <div className="daily-plan-info-box">
                  <span>إجمالي المعتمد</span>
                  <strong>{formatMoney(selectedDayApprovedTotal, selectedDayCurrency)}</strong>
                </div>
              </div>

              <div className="daily-plan-calendar-day-lists">
                <div className="daily-plan-calendar-group">
                  <div className="daily-plan-calendar-group-head">
                    <strong>{isArchiveTab ? 'معاملات اليوم المؤرشفة' : 'معاملات اليوم'}</strong>
                    <span>{selectedDayRequests.length}</span>
                  </div>

                  {selectedDayRequests.length ? selectedDayRequests.map((request) => renderRequestCard(request, { compact: true })) : (
                    <p className="maintenance-empty">لا توجد معاملات في هذا اليوم.</p>
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
