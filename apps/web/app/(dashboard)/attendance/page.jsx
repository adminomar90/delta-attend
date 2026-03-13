'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('ar-IQ');
};

const formatDuration = (minutes) => {
  const total = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (!hours) return `${mins} دقيقة`;
  if (!mins) return `${hours} ساعة`;
  return `${hours} ساعة و ${mins} دقيقة`;
};

const mapEmbedUrl = (latitude, longitude) =>
  `https://maps.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`;

const toBooleanFlag = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

const ATTENDANCE_DEBUG = toBooleanFlag(process.env.NEXT_PUBLIC_ATTENDANCE_DEBUG);

const generateVerificationCode = (att) => {
  const seed = `${att.employeeCode || ''}${att.checkInAt || ''}${att.id || ''}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const abs = Math.abs(hash);
  return abs.toString(36).toUpperCase().slice(0, 8).padStart(8, '0');
};

const buildWhatsAppReportUrl = (result) => {
  if (!result?.attendance) return '';
  const att = result.attendance;
  const checkInTime = att.checkInAt ? new Date(att.checkInAt).toLocaleString('ar-IQ') : '-';
  const checkOutTime = att.checkOutAt ? new Date(att.checkOutAt).toLocaleString('ar-IQ') : '-';
  const checkInMapUrl = att.checkInLocation
    ? `https://maps.google.com/?q=${att.checkInLocation.latitude},${att.checkInLocation.longitude}`
    : '-';
  const checkOutMapUrl = att.checkOutLocation
    ? `https://maps.google.com/?q=${att.checkOutLocation.latitude},${att.checkOutLocation.longitude}`
    : '-';
  const isCheckOut = att.status === 'CLOSED';
  const duration = isCheckOut ? formatDuration(att.durationMinutes) : '-';
  const verificationCode = generateVerificationCode(att);

  const lines = [
    `[ تقرير ${isCheckOut ? 'انصراف' : 'حضور'} - Delta Plus ]`,
    `----------------------------------`,
    `(i) الاسم    : ${att.employeeName || '-'}`,
    `(i) الرمز    : ${att.employeeCode || '-'}`,
    `----------------------------------`,
    `(+) وقت الدخول  : ${checkInTime}`,
    `(-) وقت الخروج  : ${isCheckOut ? checkOutTime : 'لم يتم بعد'}`,
    `(*) المدة       : ${duration}`,
    `----------------------------------`,
    `(map) موقع الدخول:`,
    checkInMapUrl,
    `(map) موقع الخروج:`,
    isCheckOut ? checkOutMapUrl : 'لم يتم بعد',
    `----------------------------------`,
    `(#) كود التحقق : ${verificationCode}`,
    `[ صادر تلقائيًا من نظام Delta Plus ]`,
  ];

  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
};

const logAttendanceDebug = (step, payload = {}) => {
  if (!ATTENDANCE_DEBUG) {
    return;
  }

  console.log(`[attendance-debug] ${step}`, payload);
};

const getCurrentGeoPosition = () =>
  new Promise((resolve, reject) => {
    const hasNavigator = typeof navigator !== 'undefined';
    const hasGeolocation = hasNavigator ? !!navigator.geolocation : false;

    logAttendanceDebug('geolocation:start', {
      hasNavigator,
      hasGeolocation,
    });

    if (!hasNavigator || !hasGeolocation) {
      logAttendanceDebug('geolocation:unsupported');
      reject(new Error('المتصفح لا يدعم تحديد الموقع الجغرافي'));
      return;
    }

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((permissionState) => {
          logAttendanceDebug('geolocation:permission-state', {
            state: permissionState.state,
          });
        })
        .catch((permissionError) => {
          logAttendanceDebug('geolocation:permission-check-error', {
            message: permissionError?.message || 'unknown',
          });
        });
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
          accuracyMeters: Number(position.coords.accuracy || 0),
        };

        logAttendanceDebug('geolocation:success', {
          location,
          timestamp: position.timestamp,
        });

        resolve(location);
      },
      (error) => {
        logAttendanceDebug('geolocation:error', {
          code: error?.code,
          message: error?.message,
        });

        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('يرجى السماح بالوصول إلى الموقع لإتمام البصمة'));
          return;
        }

        reject(new Error('تعذر قراءة الموقع الجغرافي. حاول مرة أخرى'));
      },
      options,
    );
  });

export default function AttendancePage() {
  const currentUser = authStorage.getUser();
  const canViewAttendanceMonitor = hasPermission(currentUser, Permission.VIEW_ATTENDANCE_MONITOR);
  const [meta, setMeta] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState('');
  const [lastActionResult, setLastActionResult] = useState(null);
  const [adminOverview, setAdminOverview] = useState(null);
  const [exportingReport, setExportingReport] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState('');

  const load = async () => {
    setError('');
    logAttendanceDebug('load:start');

    try {
      const [metaRes, historyRes, adminRes] = await Promise.all([
        api.get('/attendance/meta'),
        api.get('/attendance/history?limit=20'),
        canViewAttendanceMonitor
          ? api.get('/attendance/admin/overview').catch(() => null)
          : Promise.resolve(null),
      ]);

      setMeta(metaRes);
      setHistory(historyRes.items || []);
      setAdminOverview(adminRes);

      logAttendanceDebug('load:success', {
        policy: metaRes?.policy,
        openRecordId: metaRes?.openRecord?.id || null,
        historyCount: (historyRes.items || []).length,
      });
    } catch (err) {
      logAttendanceDebug('load:error', {
        message: err?.message || 'unknown',
      });
      setError(err.message || 'تعذر تحميل بيانات الحضور والانصراف');
    }
  };

  useEffect(() => {
    load();
  }, [canViewAttendanceMonitor]);

  const openRecord = meta?.openRecord || null;
  const canCheckIn = !openRecord;
  const canCheckOut = !!openRecord;

  const latestLocation = useMemo(() => {
    if (openRecord?.checkInLocation) {
      return openRecord.checkInLocation;
    }

    const latest = history[0];
    if (!latest) {
      return null;
    }

    return latest.checkOutLocation || latest.checkInLocation || null;
  }, [history, openRecord]);

  const runAttendanceAction = async (mode) => {
    setError('');
    setInfo('');
    setBusy(mode);
    logAttendanceDebug('action:start', { mode });

    try {
      const location = await getCurrentGeoPosition();
      const endpoint = mode === 'CHECK_IN' ? '/attendance/check-in' : '/attendance/check-out';
      const response = await api.post(endpoint, location);

      logAttendanceDebug('action:api-success', {
        mode,
        endpoint,
        verification: response?.verification || null,
        whatsapp: response?.whatsapp || null,
      });

      setLastActionResult(response || null);

      const delivery = response?.whatsapp?.delivery || response?.whatsapp?.autoDelivery || null;
      const fallbackUrl = response?.whatsapp?.url || '';

      if (delivery?.sent) {
        setInfo(
          mode === 'CHECK_IN'
            ? 'تم تسجيل الحضور وإرسال إشعار واتساب تلقائيًا للإدارة.'
            : 'تم تسجيل الانصراف وإرسال إشعار واتساب تلقائيًا للإدارة.',
        );
      } else if (fallbackUrl) {
        setInfo(
          mode === 'CHECK_IN'
            ? 'تم تسجيل الحضور. سيتم فتح واتساب لإرسال الإشعار يدويًا.'
            : 'تم تسجيل الانصراف. سيتم فتح واتساب لإرسال الإشعار يدويًا.',
        );
        window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      } else {
        setInfo(
          mode === 'CHECK_IN'
            ? 'تم تسجيل الحضور بنجاح، لكن لم يتم إرسال إشعار واتساب (راجع الإعدادات).'
            : 'تم تسجيل الانصراف بنجاح، لكن لم يتم إرسال إشعار واتساب (راجع الإعدادات).',
        );
      }

      await load();
    } catch (err) {
      logAttendanceDebug('action:error', {
        mode,
        message: err?.message || 'unknown',
      });
      setError(err.message || 'فشل تنفيذ بصمة الحضور/الانصراف');
    } finally {
      setBusy('');
      logAttendanceDebug('action:done', { mode });
    }
  };

  const handleVerifyCode = () => {
    setVerifyError('');
    setVerifyResult(null);
    const trimmed = verifyCode.trim().toUpperCase();
    if (!trimmed) {
      setVerifyError('يرجى إدخال كود التحقق');
      return;
    }
    const allRecords = [
      ...(meta?.todayRecords || []),
      ...history,
    ];
    const seen = new Set();
    const unique = allRecords.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    const found = unique.find((r) => generateVerificationCode(r) === trimmed);
    if (!found) {
      setVerifyError('كود التحقق غير صحيح أو لا يوجد سجل مطابق في البيانات المحملة');
      return;
    }
    setVerifyResult(found);
  };

  const downloadAdminReport = async (type) => {
    setExportingReport(type);
    setError('');

    try {
      const blob = await api.get(`/attendance/admin/export/${type}`);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `attendance-report.${type === 'excel' ? 'xlsx' : 'pdf'}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'تعذر تنزيل تقرير الحضور');
    } finally {
      setExportingReport('');
    }
  };

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: '#9bc8ff' }}>{info}</section> : null}

      <section className="grid-3" style={{ marginBottom: 16 }}>
        <article className="card section">
          <h2>الحالة الحالية</h2>
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>
            {openRecord ? 'لديك جلسة حضور مفتوحة' : 'لا توجد جلسة حضور مفتوحة'}
          </p>
          <p style={{ margin: '6px 0' }}>
            وقت الدخول: <strong>{formatDateTime(openRecord?.checkInAt)}</strong>
          </p>
          <p style={{ margin: '6px 0' }}>
            وقت الخروج: <strong>{formatDateTime(openRecord?.checkOutAt)}</strong>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canCheckIn || !!busy}
              onClick={() => runAttendanceAction('CHECK_IN')}
            >
              {busy === 'CHECK_IN' ? 'جارٍ تسجيل الدخول...' : 'تسجيل حضور (Check-in)'}
            </button>
            <button
              type="button"
              className="btn btn-soft"
              disabled={!canCheckOut || !!busy}
              onClick={() => runAttendanceAction('CHECK_OUT')}
            >
              {busy === 'CHECK_OUT' ? 'جارٍ تسجيل الخروج...' : 'تسجيل انصراف (Check-out)'}
            </button>
          </div>
        </article>

        <article className="card section">
          <h2>سياسة الحضور</h2>
          <p style={{ marginTop: 0 }}>
            الوضع: <strong>{meta?.policy?.mode === 'ANY_LOCATION' ? 'من أي مكان' : 'نطاق جغرافي'}</strong>
          </p>
          <p style={{ color: 'var(--text-soft)', marginTop: 4 }}>
            إجمالي وقت العمل اليوم: {formatDuration(meta?.todayWorkedMinutes || 0)}
          </p>
          <p style={{ color: 'var(--text-soft)', marginTop: 4 }}>
            حالة إرسال واتساب للإدارة: {meta?.whatsappAdminConfigured ? 'مفعل' : 'غير مفعل'}
          </p>
          <p style={{ color: 'var(--text-soft)', marginTop: 4 }}>
            عدد سجلات اليوم: {meta?.todayRecords?.length || 0}
          </p>
        </article>

        <article className="card section">
          <h2>آخر نتيجة</h2>
          {lastActionResult ? (
            <>
              <p style={{ marginTop: 0 }}>
                حالة الجلسة: <strong>{lastActionResult?.attendance?.status === 'OPEN' ? 'مفتوحة' : 'مغلقة'}</strong>
              </p>
              <p style={{ margin: '6px 0' }}>
                تم التقاط الموقع: <strong>{lastActionResult?.verification?.locationCaptured ? 'نعم' : 'لا'}</strong>
              </p>
              {lastActionResult?.workSummary ? (
                <p style={{ margin: '6px 0', color: 'var(--text-soft)' }}>
                  مدة الجلسة: {formatDuration(lastActionResult.workSummary.sessionMinutes)}
                </p>
              ) : null}
              <p style={{ margin: '6px 0', color: 'var(--text-soft)' }}>
                حالة واتساب: <strong>{lastActionResult?.whatsapp?.delivery?.sent ? 'تم الإرسال تلقائيًا' : 'إرسال يدوي/غير متاح'}</strong>
              </p>
              <a
                href={buildWhatsAppReportUrl(lastActionResult)}
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 10,
                  padding: '8px 16px',
                  background: '#25d366',
                  color: '#fff',
                  borderRadius: 8,
                  fontWeight: 600,
                  textDecoration: 'none',
                  fontSize: 14,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                إرسال تقرير واتساب
              </a>
              {lastActionResult?.attendance ? (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-soft)', letterSpacing: 1 }}>
                  كود التحقق:{' '}
                  <strong style={{ fontFamily: 'monospace', color: '#c4d743', fontSize: 13 }}>
                    {generateVerificationCode(lastActionResult.attendance)}
                  </strong>
                </p>
              ) : null}
            </>
          ) : (
            <p style={{ color: 'var(--text-soft)', marginTop: 0 }}>
              لا توجد عملية حديثة بعد.
            </p>
          )}

          {latestLocation ? (
            <div className="map-frame-wrap">
              <iframe
                title="Last Employee Location"
                src={mapEmbedUrl(latestLocation.latitude, latestLocation.longitude)}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          ) : null}
        </article>
      </section>

      <section className="card section">
        <h2>سجل الحضور والانصراف</h2>
        <table className="table">
          <thead>
            <tr>
              <th>تاريخ الدخول</th>
              <th>تاريخ الخروج</th>
              <th>المدة</th>
              <th>حالة الجلسة</th>
              <th>موقع الدخول</th>
              <th>موقع الخروج</th>
            </tr>
          </thead>
          <tbody>
            {history.length ? history.map((item) => (
              <tr key={item.id}>
                <td>{formatDateTime(item.checkInAt)}</td>
                <td>{formatDateTime(item.checkOutAt)}</td>
                <td>{formatDuration(item.durationMinutes)}</td>
                <td>
                  <span className={`status-pill ${item.status === 'OPEN' ? 'status-inprogress' : 'status-approved'}`}>
                    {item.status === 'OPEN' ? 'مفتوحة' : 'مغلقة'}
                  </span>
                </td>
                <td>
                  <a
                    href={`https://maps.google.com/?q=${item.checkInLocation?.latitude},${item.checkInLocation?.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#9bc8ff' }}
                  >
                    فتح الموقع
                  </a>
                </td>
                <td>
                  {item.checkOutLocation ? (
                    <a
                      href={`https://maps.google.com/?q=${item.checkOutLocation?.latitude},${item.checkOutLocation?.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#9bc8ff' }}
                    >
                      فتح الموقع
                    </a>
                  ) : '-'}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} style={{ color: 'var(--text-soft)' }}>
                  لا يوجد سجل حضور حتى الآن.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {adminOverview ? (
        <section className="card section" style={{ marginTop: 16 }}>
          <h2>متابعة الإدارة للحضور اليومي</h2>
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>
            التاريخ: <strong>{adminOverview.date}</strong>
          </p>
          <p style={{ margin: '6px 0', color: 'var(--text-soft)' }}>
            داخل الدوام الآن: <strong>{adminOverview.totals?.checkedInNow || 0}</strong> | منصرفون اليوم:{' '}
            <strong>{adminOverview.totals?.checkedOutToday || 0}</strong> | إجمالي ساعات اليوم:{' '}
            <strong>{adminOverview.totals?.totalWorkedHours || 0}</strong>
          </p>
          <div className="action-row" style={{ margin: '10px 0 14px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadAdminReport('excel')}
              disabled={!!exportingReport}
            >
              {exportingReport === 'excel' ? 'جارٍ التصدير...' : 'تصدير حضور Excel'}
            </button>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => downloadAdminReport('pdf')}
              disabled={!!exportingReport}
            >
              {exportingReport === 'pdf' ? 'جارٍ التصدير...' : 'تصدير حضور PDF'}
            </button>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>الحالة</th>
                <th>ساعات اليوم</th>
                <th>آخر دخول</th>
                <th>آخر خروج</th>
                <th>الموقع</th>
              </tr>
            </thead>
            <tbody>
              {(adminOverview.employees || []).map((item) => (
                <tr key={item.userId}>
                  <td>{item.fullName}</td>
                  <td>
                    <span className={`status-pill ${item.status === 'OPEN' ? 'status-inprogress' : 'status-approved'}`}>
                      {item.status === 'OPEN'
                        ? 'داخل الدوام'
                        : item.status === 'CHECKED_OUT'
                          ? 'منصرف'
                          : 'غائب'}
                    </span>
                  </td>
                  <td>{item.todayWorkedHours}</td>
                  <td>{formatDateTime(item.lastCheckInAt)}</td>
                  <td>{formatDateTime(item.lastCheckOutAt)}</td>
                  <td>
                    {item.lastLocation ? (
                      <a
                        href={`https://maps.google.com/?q=${item.lastLocation.latitude},${item.lastLocation.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#9bc8ff' }}
                      >
                        فتح الموقع
                      </a>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="card section" style={{ marginTop: 16 }}>
        <h2>التحقق من كود الحضور</h2>
        <p style={{ marginTop: 0, color: 'var(--text-soft)', fontSize: 14 }}>
          أدخل كود التحقق الموجود في رسالة الواتساب للتحقق من صحتها وعرض تفاصيل السجل.
        </p>
        <div className="action-row" style={{ marginBottom: 12 }}>
          <input
            className="input verify-code-input"
            type="text"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
            placeholder="أدخل كود التحقق (مثال: K7X2M9QA)"
            maxLength={8}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleVerifyCode}
          >
            تحقق
          </button>
          {(verifyResult || verifyError) ? (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => { setVerifyCode(''); setVerifyResult(null); setVerifyError(''); }}
            >
              مسح
            </button>
          ) : null}
        </div>

        {verifyError ? (
          <p style={{ color: 'var(--danger)', margin: '8px 0', fontSize: 14 }}>{verifyError}</p>
        ) : null}

        {verifyResult ? (
          <div className="verify-panel">
            <p style={{ margin: '0 0 10px', color: '#c4d743', fontWeight: 700, fontSize: 15 }}>
              ✓ كود التحقق صحيح — السجل موثوق
            </p>
            <table className="verify-table">
              <tbody>
                {[
                  ['اسم الموظف', verifyResult.employeeName || '-'],
                  ['رمز الموظف', verifyResult.employeeCode || '-'],
                  ['حالة الجلسة', verifyResult.status === 'OPEN' ? 'مفتوحة (حضور)' : 'مغلقة (انصراف)'],
                  ['وقت الدخول', formatDateTime(verifyResult.checkInAt)],
                  ['وقت الخروج', formatDateTime(verifyResult.checkOutAt)],
                  ['المدة', formatDuration(verifyResult.durationMinutes)],
                  ['كود التحقق', generateVerificationCode(verifyResult)],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td className="verify-label">{label}</td>
                    <td style={{ padding: '5px 0', fontWeight: 600, fontFamily: label === 'كود التحقق' ? 'monospace' : 'inherit', color: label === 'كود التحقق' ? '#c4d743' : 'inherit' }}>{value}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '5px 0', color: 'var(--text-soft)', verticalAlign: 'top' }}>موقع الدخول</td>
                  <td style={{ padding: '5px 0' }}>
                    {verifyResult.checkInLocation ? (
                      <a
                        href={`https://maps.google.com/?q=${verifyResult.checkInLocation.latitude},${verifyResult.checkInLocation.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#9bc8ff' }}
                      >
                        فتح في الخريطة
                      </a>
                    ) : '-'}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '5px 0', color: 'var(--text-soft)', verticalAlign: 'top' }}>موقع الخروج</td>
                  <td style={{ padding: '5px 0' }}>
                    {verifyResult.checkOutLocation ? (
                      <a
                        href={`https://maps.google.com/?q=${verifyResult.checkOutLocation.latitude},${verifyResult.checkOutLocation.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#9bc8ff' }}
                      >
                        فتح في الخريطة
                      </a>
                    ) : '-'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
