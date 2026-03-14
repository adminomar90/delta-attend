'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { api, assetUrl } from '../../../lib/api';
import KpiCard from '../../../components/KpiCard';
import { authStorage } from '../../../lib/auth';
import { useNotifications } from '../../../lib/notifications';
import { Permission, hasPermission } from '../../../lib/permissions';

const statusLabelMap = {
  TODO: 'جديدة',
  IN_PROGRESS: 'قيد التنفيذ',
  SUBMITTED: 'بانتظار الاعتماد',
  APPROVED: 'معتمدة',
  REJECTED: 'مرفوضة',
};

const roleLabelMap = {
  GENERAL_MANAGER: 'مدير عام',
  HR_MANAGER: 'مدير موارد بشرية',
  FINANCIAL_MANAGER: 'مدير مالي',
  PROJECT_MANAGER: 'مدير مشروع',
  ASSISTANT_PROJECT_MANAGER: 'مساعد مدير مشروع',
  TEAM_LEAD: 'قائد فريق',
  TECHNICAL_STAFF: 'موظف تقني',
};

const roleStyleMap = {
  GENERAL_MANAGER: 'fill:#1a2f10,stroke:#c4d743,stroke-width:2px,color:#e2e8f0',
  HR_MANAGER: 'fill:#0d1d3e,stroke:#4d91ff,stroke-width:2px,color:#e2e8f0',
  FINANCIAL_MANAGER: 'fill:#0d1d3e,stroke:#65eca2,stroke-width:2px,color:#e2e8f0',
  PROJECT_MANAGER: 'fill:#1a1f10,stroke:#ffb74d,stroke-width:2px,color:#e2e8f0',
  ASSISTANT_PROJECT_MANAGER: 'fill:#1a1030,stroke:#b288ff,stroke-width:2px,color:#e2e8f0',
  TEAM_LEAD: 'fill:#1a1015,stroke:#ff8a80,stroke-width:2px,color:#e2e8f0',
  TECHNICAL_STAFF: 'fill:#0d1d3e,stroke:#7a92bb,stroke-width:1px,color:#e2e8f0',
};

const roleColorMap = {
  GENERAL_MANAGER: '#c4d743',
  HR_MANAGER: '#4d91ff',
  FINANCIAL_MANAGER: '#65eca2',
  PROJECT_MANAGER: '#ffb74d',
  ASSISTANT_PROJECT_MANAGER: '#b288ff',
  TEAM_LEAD: '#ff8a80',
  TECHNICAL_STAFF: '#7a92bb',
};

const formatDuration = (minutes) => {
  const total = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (!hours) return `${mins} دقيقة`;
  if (!mins) return `${hours} ساعة`;
  return `${hours} ساعة و ${mins} دقيقة`;
};

let mermaidIdCounter = 0;

function esc(str) {
  return (str || '').replace(/[<>"\\[\]]/g, '').trim();
}

function buildNodeHtml(node, nid) {
  const name = esc(node.fullName || '');
  const role = esc(roleLabelMap[node.role] || node.role || '');
  const color = roleColorMap[node.role] || '#7a92bb';
  const initials = (node.fullName || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  const avatarCircle = `<div data-nid='${nid}' style='width:54px;height:54px;border-radius:50%;border:2.5px solid ${color};display:flex;align-items:center;justify-content:center;background:#0a1628;color:${color};font-weight:700;font-size:17px;margin:0 auto 8px;box-shadow:0 0 14px ${color}30;overflow:hidden;'>${initials}</div>`;

  const details = [];
  if (node.jobTitle) details.push(`<span style='background:rgba(255,255,255,0.06);padding:2px 7px;border-radius:5px;white-space:nowrap;'>\uD83D\uDCBC ${esc(node.jobTitle)}</span>`);
  if (node.department) details.push(`<span style='background:rgba(255,255,255,0.06);padding:2px 7px;border-radius:5px;white-space:nowrap;'>\uD83C\uDFE2 ${esc(node.department)}</span>`);
  if (node.employeeCode) details.push(`<span style='background:rgba(255,255,255,0.06);padding:2px 7px;border-radius:5px;white-space:nowrap;'>\uD83D\uDD16 ${esc(node.employeeCode)}</span>`);

  const detailsRow = details.length
    ? `<div style='display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-top:6px;font-size:10px;color:#8899aa;'>${details.join('')}</div>`
    : '';

  return `<div style='text-align:center;min-width:190px;padding:6px 8px;direction:rtl;'>${avatarCircle}<div style='font-weight:700;font-size:14px;color:#e2e8f0;margin-bottom:3px;line-height:1.3;'>${name}</div><div style='font-size:10px;font-weight:600;border:1px solid ${color};border-radius:99px;padding:1px 9px;color:${color};display:inline-block;'>${role}</div>${detailsRow}</div>`;
}

function MermaidOrgChart({ roots }) {
  const containerRef = useRef(null);

  const renderChart = useCallback(async () => {
    if (!roots?.length || !containerRef.current) return;

    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#080f1e',
        primaryColor: '#0d1d3e',
        primaryTextColor: '#e2e8f0',
        primaryBorderColor: '#c4d743',
        lineColor: '#7a92bb',
        fontFamily: 'inherit',
        fontSize: '13px',
        nodeTextColor: '#e2e8f0',
      },
      flowchart: {
        htmlLabels: true,
        curve: 'basis',
        nodeSpacing: 60,
        rankSpacing: 100,
        padding: 16,
      },
    });

    let idx = 0;
    const idMap = {};
    const nodeData = {};
    const lines = ['graph TD'];
    const styleLines = [];

    function getId(nodeId) {
      if (!idMap[nodeId]) idMap[nodeId] = `n${idx++}`;
      return idMap[nodeId];
    }

    function traverse(node) {
      const nid = getId(node.id);
      const color = roleColorMap[node.role] || '#7a92bb';

      nodeData[nid] = {
        avatarUrl: node.avatarUrl ? assetUrl(node.avatarUrl) : null,
        initials: (node.fullName || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase(),
        color,
      };

      const html = buildNodeHtml(node, nid);
      lines.push(`  ${nid}["${html}"]`);
      styleLines.push(`  style ${nid} ${roleStyleMap[node.role] || roleStyleMap.TECHNICAL_STAFF}`);

      if (node.children) {
        for (const child of node.children) {
          lines.push(`  ${nid} --> ${getId(child.id)}`);
          traverse(child);
        }
      }
    }

    roots.forEach(traverse);
    const def = lines.join('\n') + '\n' + styleLines.join('\n') + '\n  linkStyle default stroke:#7a92bb,stroke-width:2px';

    try {
      const uniqueId = `orgchart_${++mermaidIdCounter}`;
      const { svg } = await mermaid.render(uniqueId, def);
      if (containerRef.current) containerRef.current.innerHTML = svg;

      // Post-process: inject real <img> elements into avatar placeholders
      Object.entries(nodeData).forEach(([nid, info]) => {
        if (!info.avatarUrl) return;
        const el = containerRef.current.querySelector(`[data-nid="${nid}"]`);
        if (!el) return;

        const img = document.createElement('img');
        img.src = info.avatarUrl;
        img.alt = '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;';
        img.onerror = () => img.remove(); // falls back to initials behind it
        el.textContent = '';
        el.appendChild(img);
      });
    } catch (e) {
      console.error('Mermaid render error:', e);
    }
  }, [roots]);

  useEffect(() => { renderChart(); }, [renderChart]);

  if (!roots?.length) return null;
  return <div ref={containerRef} className="org-mermaid-wrap" />;
}

export default function DashboardPage() {
  const currentUser = authStorage.getUser();
  const canSeeAttendanceMonitor = hasPermission(currentUser, Permission.VIEW_ATTENDANCE_MONITOR);
  const canSeeHierarchy = hasPermission(currentUser, Permission.VIEW_EMPLOYEES_HIERARCHY);
  const canSeeLeaderboard = hasPermission(currentUser, Permission.VIEW_LEADERBOARD);
  const { lastNotification, lastNotificationAt } = useNotifications();
  const [data, setData] = useState(null);
  const [me, setMe] = useState(null);
  const [attendanceMeta, setAttendanceMeta] = useState(null);
  const [orgChart, setOrgChart] = useState(null);
  const [attendanceOverview, setAttendanceOverview] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [summary, gamification, selfAttendance, chart, attendance] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/gamification/me'),
        api.get('/attendance/meta').catch(() => null),
        canSeeHierarchy
          ? api.get('/auth/org-chart').catch(() => ({ roots: [], totalEmployees: 0 }))
          : Promise.resolve({ roots: [], totalEmployees: 0 }),
        canSeeAttendanceMonitor
          ? api.get('/attendance/admin/overview').catch(() => null)
          : Promise.resolve(null),
      ]);
      setData(summary);
      setMe(gamification);
      setAttendanceMeta(selfAttendance);
      setOrgChart(chart);
      setAttendanceOverview(attendance);
    } catch (err) {
      setError(err.message || 'تعذر تحميل لوحة التحكم');
    }
  }, [canSeeAttendanceMonitor, canSeeHierarchy]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!lastNotificationAt || !lastNotification?.type) {
      return;
    }

    if (['ATTENDANCE_ACTIVITY', 'WORK_REPORT_CREATED', 'OPERATION_ACTIVITY'].includes(lastNotification.type)) {
      load();
    }
  }, [lastNotification?.type, lastNotificationAt, load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      load();
    }, 60000);

    return () => window.clearInterval(timer);
  }, [load]);

  if (error) {
    return <div className="card section">{error}</div>;
  }

  if (!data || !me) {
    return <div className="card section">جارٍ تحميل البيانات...</div>;
  }

  return (
    <>
      <section className="grid-4">
        <KpiCard label="إجمالي المهام" value={data.summary.totalTasks} hint="كل المهام ضمن نطاقك" tone="highlight" />
        <KpiCard label="بانتظار الاعتماد" value={data.summary.pendingApprovals} hint="تحتاج مراجعة مدير" />
        <KpiCard label="قيد التنفيذ" value={data.summary.inProgress} hint="مهام نشطة الآن" />
        <KpiCard label="مشاريع نشطة" value={data.summary.activeProjects} hint="على مستوى الشركة" tone="warn" />
      </section>

      {attendanceMeta ? (
        <section className="grid-3" style={{ marginTop: 16 }}>
          <article className="card section">
            <h2>حالتي في الحضور اليوم</h2>
            <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>
              {attendanceMeta.currentStatus === 'OPEN'
                ? 'تم تسجيل الحضور والموظف داخل الدوام الآن.'
                : attendanceMeta.currentStatus === 'CHECKED_OUT'
                  ? 'تم تسجيل الانصراف لهذا اليوم.'
                  : attendanceMeta.currentStatus === 'LOGGED_IN'
                    ? 'تم تسجيل الدخول اليوم — الموظف حاضر.'
                    : 'لا يوجد تسجيل حضور اليوم حتى الآن.'}
            </p>
            <p style={{ margin: '6px 0' }}>
              الحالة:{' '}
              <span
                className={`status-pill ${attendanceMeta.currentStatus === 'OPEN' || attendanceMeta.currentStatus === 'LOGGED_IN' ? 'status-inprogress' : attendanceMeta.currentStatus === 'CHECKED_OUT' ? 'status-approved' : 'status-rejected'}`}
              >
                {attendanceMeta.currentStatus === 'OPEN' || attendanceMeta.currentStatus === 'LOGGED_IN'
                  ? 'حاضر'
                  : attendanceMeta.currentStatus === 'CHECKED_OUT'
                    ? 'منصرف'
                    : 'غائب'}
              </span>
            </p>
            <p style={{ margin: '6px 0', color: 'var(--text-soft)' }}>
              ساعات اليوم: <strong>{attendanceMeta.todayWorkedHours || 0}</strong>
            </p>
            <p style={{ margin: '6px 0', color: 'var(--text-soft)' }}>
              آخر دخول:{' '}
              <strong>{attendanceMeta.openRecord?.checkInAt ? new Date(attendanceMeta.openRecord.checkInAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : attendanceMeta.lastLoginAt ? new Date(attendanceMeta.lastLoginAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : '-'}</strong>
            </p>
          </article>

          <article className="card section">
            <h2>جلسات اليوم</h2>
            <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>
              عدد السجلات: <strong>{attendanceMeta.todayRecords?.length || 0}</strong>
            </p>
            <p style={{ margin: '6px 0', color: 'var(--text-soft)' }}>
              آخر خروج:{' '}
              <strong>{attendanceMeta.todayRecords?.[0]?.checkOutAt ? new Date(attendanceMeta.todayRecords[0].checkOutAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : '-'}</strong>
            </p>
            <p style={{ margin: '6px 0', color: 'var(--text-soft)' }}>
              نمط التحقق: <strong>{attendanceMeta.policy?.mode === 'ANY_LOCATION' ? 'من أي موقع' : 'نطاق جغرافي'}</strong>
            </p>
          </article>

          <article className="card section">
            <h2>التحديث المباشر</h2>
            <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>
              يتم تحديث لوحة الحضور والعمليات تلقائيًا عند وصول إشعار جديد.
            </p>
            <p style={{ margin: '6px 0', color: 'var(--text-soft)' }}>
              آخر تحديث: <strong>{lastNotificationAt ? new Date(lastNotificationAt).toLocaleTimeString('ar-IQ') : '—'}</strong>
            </p>
            <p style={{ margin: '6px 0', color: 'var(--text-soft)' }}>
              آخر نوع إشعار: <strong>{lastNotification?.type || '—'}</strong>
            </p>
          </article>
        </section>
      ) : null}

      {canSeeAttendanceMonitor && attendanceOverview ? (
        <section className="card section" style={{ marginTop: 16 }}>
          <h2>الحضور اليومي (الإدارة)</h2>
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>
            التاريخ: <strong>{attendanceOverview.date}</strong>
          </p>
          <div className="grid-4">
            <KpiCard
              label="حاضرون"
              value={(attendanceOverview.totals?.checkedInNow || 0) + (attendanceOverview.totals?.loggedInToday || 0)}
              hint="داخل الدوام أو سجّلوا الدخول"
            />
            <KpiCard
              label="غادروا اليوم"
              value={attendanceOverview.totals?.checkedOutToday || 0}
              hint="أنهوا الدوام اليوم"
            />
            <KpiCard
              label="غائبون اليوم"
              value={attendanceOverview.totals?.absentToday || 0}
              hint="بدون أي تسجيل"
              tone="warn"
            />
            <KpiCard
              label="إجمالي ساعات اليوم"
              value={attendanceOverview.totals?.totalWorkedHours || 0}
              hint={formatDuration(attendanceOverview.totals?.totalWorkedMinutes || 0)}
              tone="highlight"
            />
          </div>

          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>الموظف</th>
                <th>الحالة</th>
                <th>ساعات اليوم</th>
                <th>آخر دخول</th>
                <th>آخر خروج</th>
              </tr>
            </thead>
            <tbody>
              {(attendanceOverview.employees || []).slice(0, 8).map((employee) => (
                <tr key={employee.userId}>
                  <td>{employee.fullName}</td>
                  <td>
                    <span className={`status-pill ${employee.status === 'OPEN' || employee.status === 'LOGGED_IN' ? 'status-inprogress' : employee.status === 'CHECKED_OUT' ? 'status-approved' : 'status-rejected'}`}>
                      {employee.status === 'OPEN'
                        ? 'داخل الدوام'
                        : employee.status === 'CHECKED_OUT'
                          ? 'منصرف'
                          : employee.status === 'LOGGED_IN'
                            ? 'حاضر'
                            : 'غائب'}
                    </span>
                  </td>
                  <td>{employee.todayWorkedHours}</td>
                  <td>{employee.lastCheckInAt ? new Date(employee.lastCheckInAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : '-'}</td>
                  <td>{employee.lastCheckOutAt ? new Date(employee.lastCheckOutAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="grid-3" style={{ marginTop: 16 }}>
        <article
          className={`card section ${canSeeLeaderboard ? '' : 'grid-span-2'}`}
          style={canSeeLeaderboard ? undefined : { gridColumn: '1 / -1' }}
        >
          <h2>تقدّمك في Gamification</h2>
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>المستوى الحالي: <strong>{me.user.level}</strong></p>
          <div className="progress" style={{ marginBottom: 8 }}>
            <span style={{ width: `${Math.min(100, (me.user.pointsTotal / ((me.nextLevel?.remainingPoints || me.user.pointsTotal) + me.user.pointsTotal)) * 100)}%` }} />
          </div>
          <p style={{ margin: 0 }}>النقاط الحالية: <strong>{me.user.pointsTotal}</strong></p>
          <p style={{ margin: '8px 0 0' }}>
            الرتبة الشهرية: <strong>{me.rank || '-'}</strong>
          </p>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {me.user.badges.length ? me.user.badges.map((badge) => <span key={badge} className="badge">{badge}</span>) : <span style={{ color: 'var(--text-soft)' }}>لا توجد شارات بعد</span>}
          </div>
        </article>

        {canSeeLeaderboard ? (
          <article className="card section grid-span-2">
            <h2>لوحة الصدارة الشهرية</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>الترتيب</th>
                  <th>الاسم</th>
                  <th>الدور</th>
                  <th>المستوى</th>
                  <th>النقاط</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((item) => (
                  <tr key={String(item.userId)}>
                    <td>#{item.rank}</td>
                    <td>{item.fullName}</td>
                    <td>{item.role}</td>
                    <td>{item.level}</td>
                    <td>{item.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ) : null}
      </section>

      <section className="split" style={{ marginTop: 16 }}>
        <article className="card section">
          <h2>تحليل الحالات</h2>
          {data.taskStatusBreakdown.map((item) => (
            <div key={item._id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{statusLabelMap[item._id] || item._id}</span>
                <span>{item.count}</span>
              </div>
              <div className="progress">
                <span style={{ width: `${Math.min(100, (item.count / Math.max(1, data.summary.totalTasks)) * 100)}%` }} />
              </div>
            </div>
          ))}
        </article>

        <article className="card section">
          <h2>الأهداف الحالية</h2>
          <table className="table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>الهدف</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.goals.map((goal) => (
                <tr key={goal._id}>
                  <td>{goal.user?.fullName || '-'}</td>
                  <td>{goal.title}</td>
                  <td>
                    <span className={`status-pill ${goal.achieved ? 'status-approved' : 'status-inprogress'}`}>
                      {goal.achieved ? 'متحقق' : `${goal.currentPoints}/${goal.targetPoints}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>

      {canSeeHierarchy ? (
        <section className="card section" style={{ marginTop: 16 }}>
          <h2>الهيكل الإداري الهرمي</h2>
          <p style={{ color: 'var(--text-soft)', marginTop: 0 }}>
            إجمالي الموظفين: <strong>{orgChart?.totalEmployees || 0}</strong>
          </p>

          {orgChart?.roots?.length ? (
            <MermaidOrgChart roots={orgChart.roots} />
          ) : (
            <p style={{ color: 'var(--text-soft)', margin: 0 }}>لا توجد بيانات هيكل إداري حالياً.</p>
          )}
        </section>
      ) : null}
    </>
  );
}
