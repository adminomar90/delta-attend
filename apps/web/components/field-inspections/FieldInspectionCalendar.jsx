'use client';

import { useMemo } from 'react';

const weekLabels = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];

const toDateKey = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

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
  return new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() + step, 1, 12, 0, 0, 0));
};

const formatDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ar-IQ');
};

const isClosedTicket = (ticket) => ticket.status === 'CLOSED';

const buildCalendarCells = ({ monthDate, ticketsByDay, selectedDate, statusClass }) => {
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
    const dayTickets = ticketsByDay.get(dateKey) || [];
    const completedCount = dayTickets.filter(isClosedTicket).length;
    const openCount = dayTickets.filter((ticket) => !isClosedTicket(ticket)).length;
    const statusClasses = [...new Set(dayTickets.map((ticket) => statusClass[ticket.status] || 'status-todo'))].slice(0, 4);

    cells.push({
      key: dateKey,
      dateKey,
      dayNumber: day,
      totalCount: dayTickets.length,
      completedCount,
      openCount,
      statusClasses,
      isSelected: dateKey === selectedDate,
      isToday: dateKey === todayKey,
      isPlaceholder: false,
    });
  }

  return cells;
};

export default function FieldInspectionCalendar({
  open,
  loading,
  monthDate,
  tickets,
  selectedDate,
  statusClass,
  statusLabels,
  saving,
  canManage,
  canHandle,
  onSelectDate,
  onChangeMonth,
  onOpenTicket,
  onSendAppointment,
  onStartInspection,
  onActivateDailyPlan,
}) {
  const monthAnchor = useMemo(() => createMonthAnchor(monthDate), [monthDate]);

  const ticketsByDay = useMemo(() => {
    const grouped = new Map();
    (tickets || []).forEach((ticket) => {
      const dateKey = toDateKey(ticket.appointmentAt);
      if (!dateKey) return;
      if (!grouped.has(dateKey)) grouped.set(dateKey, []);
      grouped.get(dateKey).push(ticket);
    });
    return grouped;
  }, [tickets]);

  const calendarCells = useMemo(
    () => buildCalendarCells({ monthDate: monthAnchor, ticketsByDay, selectedDate, statusClass }),
    [monthAnchor, selectedDate, statusClass, ticketsByDay],
  );

  const selectedDayTickets = useMemo(
    () => (selectedDate ? (ticketsByDay.get(selectedDate) || []) : []),
    [selectedDate, ticketsByDay],
  );

  const closedTickets = useMemo(
    () => selectedDayTickets.filter(isClosedTicket),
    [selectedDayTickets],
  );

  const openTickets = useMemo(
    () => selectedDayTickets.filter((ticket) => !isClosedTicket(ticket)),
    [selectedDayTickets],
  );

  const monthTitle = useMemo(
    () => monthAnchor.toLocaleDateString('ar-IQ', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    [monthAnchor],
  );

  const selectedDateLabel = selectedDate ? formatDate(selectedDate) : 'اختر يوما من التقويم';

  const renderTicketCard = (ticket, { closed = false } = {}) => (
    <article
      key={ticket.id}
      className={[
        'daily-plan-calendar-task',
        closed ? 'daily-plan-calendar-task-completed' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="daily-plan-calendar-task-head">
        <div>
          <strong>{ticket.ticketNo}</strong>
          <div className="daily-plan-card-subtitle">
            {ticket.customerSnapshot?.customerName || '-'} - {ticket.customerSnapshot?.phone || '-'}
          </div>
        </div>

        <div className="daily-plan-chip-row">
          <span className={`status-pill ${statusClass[ticket.status] || 'status-todo'}`}>
            {ticket.statusLabel || statusLabels[ticket.status] || ticket.status}
          </span>
          {ticket.linkedDailyWorkPlan ? <span className="status-pill status-submitted">مرتبط ببلان</span> : null}
        </div>
      </div>

      <div className="daily-plan-calendar-task-meta">
        <span>الخدمة: {ticket.serviceType || '-'}</span>
        <span>الموعد: {ticket.appointmentAt ? new Date(ticket.appointmentAt).toLocaleString('ar-IQ') : '-'}</span>
        <span>الفنيون: {(ticket.technicians || []).map((item) => item.fullName || item.user?.fullName).filter(Boolean).join('، ') || '-'}</span>
        <span>العنوان: {ticket.customerSnapshot?.address || '-'}</span>
      </div>

      <div className="daily-plan-calendar-task-footer">
        <span className="daily-plan-card-subtitle">{ticket.requestDescription || ticket.notes || 'لا توجد تفاصيل إضافية'}</span>
        <div className="form-actions daily-plan-actions">
          <button type="button" className="btn btn-soft btn-sm" onClick={() => onOpenTicket(ticket)}>
            فتح التذكرة
          </button>
          {canManage && ticket.appointmentAt ? (
            <button type="button" className="btn btn-soft btn-sm" onClick={() => onSendAppointment(ticket)} disabled={saving}>
              إرسال الموعد
            </button>
          ) : null}
          {canHandle && ['SCHEDULED', 'AWAITING_SCHEDULE'].includes(ticket.status) ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onStartInspection(ticket)} disabled={saving}>
              بدء الكشف
            </button>
          ) : null}
          {canManage && ['AWAITING_DAILY_PLAN', 'INSPECTION_COMPLETED'].includes(ticket.status) && !ticket.linkedDailyWorkPlan ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onActivateDailyPlan(ticket)} disabled={saving}>
              تفعيل بلان العمل اليومي
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );

  if (!open) return null;

  return (
    <section className="card section daily-plan-calendar-panel" style={{ marginTop: 16 }}>
      <div className="daily-plan-calendar-header">
        <div>
          <h2 style={{ margin: 0 }}>تقويم الكشف الميداني</h2>
          <p className="daily-plan-modal-subtitle">اختر اليوم المطلوب لعرض تذاكر الكشف ومواعيدها وحالتها وتفاصيل الزبون والفريق.</p>
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
            <span>{loading ? 'جار تحميل مواعيد الشهر...' : `${tickets.length} تذكرة ضمن هذا الشهر`}</span>
          </div>

          <div className="daily-plan-calendar-weekdays">
            {weekLabels.map((label) => <span key={label}>{label}</span>)}
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
                        <span className="daily-plan-calendar-completed">مغلقة {cell.completedCount}</span>
                        <span className="daily-plan-calendar-open">مفتوحة {cell.openCount}</span>
                      </div>

                      <div className="daily-plan-calendar-markers">
                        {cell.statusClasses.map((itemClass, index) => (
                          <span key={`${cell.dateKey}-${itemClass}-${index}`} className={`daily-plan-calendar-marker ${itemClass}`} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="daily-plan-calendar-day-empty-label">لا توجد كشوفات</div>
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
                {selectedDate ? `${selectedDayTickets.length} تذكرة لهذا اليوم` : 'اختر يوما من التقويم لعرض التفاصيل'}
              </div>
            </div>

            {selectedDate ? (
              <button type="button" className="btn btn-soft btn-sm" onClick={() => onSelectDate('')}>
                إلغاء اليوم
              </button>
            ) : null}
          </div>

          {!selectedDate ? (
            <p className="maintenance-empty">اختر يوما من التقويم لعرض جميع تذاكر الكشف الخاصة به.</p>
          ) : loading ? (
            <p className="maintenance-empty">جار تحميل تذاكر الكشف الخاصة بهذا اليوم...</p>
          ) : (
            <>
              <div className="daily-plan-calendar-summary-grid">
                <div className="daily-plan-info-box"><span>إجمالي التذاكر</span><strong>{selectedDayTickets.length}</strong></div>
                <div className="daily-plan-info-box"><span>مفتوحة</span><strong>{openTickets.length}</strong></div>
                <div className="daily-plan-info-box"><span>مغلقة</span><strong>{closedTickets.length}</strong></div>
                <div className="daily-plan-info-box"><span>مرتبطة ببلان</span><strong>{selectedDayTickets.filter((ticket) => ticket.linkedDailyWorkPlan).length}</strong></div>
              </div>

              <div className="daily-plan-calendar-day-lists">
                <div className="daily-plan-calendar-group">
                  <div className="daily-plan-calendar-group-head"><strong>التذاكر المفتوحة</strong><span>{openTickets.length}</span></div>
                  {openTickets.length ? openTickets.map((ticket) => renderTicketCard(ticket)) : <p className="maintenance-empty">لا توجد تذاكر مفتوحة في هذا اليوم.</p>}
                </div>

                <div className="daily-plan-calendar-group">
                  <div className="daily-plan-calendar-group-head"><strong>التذاكر المغلقة</strong><span>{closedTickets.length}</span></div>
                  {closedTickets.length ? closedTickets.map((ticket) => renderTicketCard(ticket, { closed: true })) : <p className="maintenance-empty">لا توجد تذاكر مغلقة في هذا اليوم.</p>}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
