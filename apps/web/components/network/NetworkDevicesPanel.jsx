'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import CameraExcelActions from './CameraExcelActions';

const categories = [['CAMERA', 'كاميرات مراقبة'], ['NVR', 'أجهزة تسجيل'], ['SWITCH', 'سويجات'], ['ROUTER', 'راوترات'], ['FIREWALL', 'جدار ناري'], ['ACCESS_POINT', 'أجهزة الإرسال WiFi'], ['IP_PBX', 'بدالات'], ['PRINTER', 'طابعات'], ['SERVER', 'سيرفرات'], ['UPS', 'معلومات منافذ السويجات'], ['OTHER', 'أجهزة أخرى']];
const portFields = [['patchPanelPort', 'رقم المنفذ في الباج بنل'], ['patchPanelNumber', 'رقم الباج بنل'], ['connectedDeviceType', 'نوع الجهاز'], ['switchPort', 'رقم المنفذ في السويج'], ['managementIp', 'عنوان الايبي'], ['username', 'اسم المستخدم'], ['password', 'كلمة المرور'], ['vlanNumber', 'رقم ال vlan'], ['model', 'مديل الجهاز']];
const portListFields = portFields.filter(([field]) => !['managementIp', 'username', 'password'].includes(field));
const labels = Object.fromEntries(categories);
const id = (value) => String(value?._id || value?.id || value || '');
const empty = (type) => ({ name: '', deviceType: type === 'ALL' ? 'CAMERA' : type, cameraNumber: '', switchNumber: '', switchPort: '', portNumber: '', patchPanelPort: '', patchPanelNumber: '', connectedDeviceType: '', vlanNumber: '', portCount: '', managementIp: '', username: '', extensionNumber: '', password: '', vendor: '', model: '', serialNumber: '', macAddress: '', physicalLocation: '', notes: '' });
const normalize = (value) => String(value || '').normalize('NFKD').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا');

export default function NetworkDevicesPanel({ branchId, branchName, devices, canManage, canReveal, canExport = canManage, onReload }) {
  const [category, setCategory] = useState('ALL'), [search, setSearch] = useState('');
  const [modal, setModal] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [info, setInfo] = useState('');
  const [revealed, setRevealed] = useState({}), [revealing, setRevealing] = useState('');
  const [pingResults, setPingResults] = useState({}), [pinging, setPinging] = useState({});
  const visible = useMemo(() => devices.filter((device) => (category === 'ALL' || device.deviceType === category)
    && normalize([device.name, device.cameraNumber, device.switchNumber, device.switchPort, device.portNumber, device.patchPanelPort, device.patchPanelNumber, device.connectedDeviceType, device.vlanNumber, device.portCount, labels[device.deviceType], device.managementIp, device.username, device.extensionNumber, device.vendor, device.model, device.serialNumber, device.physicalLocation].join(' ')).includes(normalize(search).trim())), [devices, category, search]);
  const cameraView = category === 'CAMERA';
  const recorderView = category === 'NVR';
  const networkPortsView = ['ROUTER', 'FIREWALL'].includes(category);
  const portView = category === 'UPS';
  useEffect(() => {
    if (!Object.keys(revealed).length) return;
    const timeout = setTimeout(() => setRevealed({}), 60000); return () => clearTimeout(timeout);
  }, [revealed]);
  useEffect(() => {
    if (!modal) return;
    const close = (event) => { if (event.key === 'Escape' && !busy) setModal(null); };
    document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close);
  }, [modal, busy]);
  const edit = (device) => { setError(''); setModal({ mode: 'edit', device, form: { ...empty(device.deviceType), ...Object.fromEntries(Object.keys(empty(device.deviceType)).filter((key) => key !== 'password').map((key) => [key, device[key] || ''])), portNumber: device.portNumber || (device.deviceType === 'UPS' ? device.name : ''), cameraNumber: device.cameraNumber || (device.deviceType === 'CAMERA' ? device.name : ''), password: '' } }); };
  const setField = (key, value) => setModal((prev) => ({ ...prev, form: { ...prev.form, [key]: value } }));
  const submit = async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setInfo('');
    try {
      if (modal.mode === 'delete') {
        await api.delete(`/network-docs/devices/${id(modal.device)}`, {});
        setRevealed((prev) => { const next = { ...prev }; delete next[id(modal.device)]; return next; });
      } else {
        const payload = { ...modal.form };
        if (payload.deviceType === 'CAMERA') payload.name = `كاميرا ${payload.cameraNumber.trim()}`;
        if (payload.deviceType === 'UPS') { payload.name = `باج ${payload.patchPanelNumber.trim()} / منفذ ${payload.patchPanelPort.trim()}`; delete payload.portNumber; }
        if (!payload.password) delete payload.password;
        if (modal.mode === 'edit') await api.patch(`/network-docs/devices/${id(modal.device)}`, payload);
        else await api.post(`/network-docs/branches/${branchId}/devices`, payload);
        setRevealed({}); setPingResults({});
        if (category !== 'ALL') setCategory(payload.deviceType);
      }
      setInfo(modal.mode === 'delete' ? 'تم حذف الجهاز وتحرير ارتباطاته بعناوين IP.' : modal.mode === 'edit' ? 'تم تحديث معلومات الجهاز.' : 'تمت إضافة الجهاز.');
      setModal(null); await onReload();
    } catch (err) { setError(err.message || 'تعذر حفظ معلومات الجهاز'); setModal((prev) => prev?.form ? { ...prev, form: { ...prev.form, password: '' } } : prev); }
    finally { setBusy(false); }
  };
  const reveal = async (device) => {
    const deviceId = id(device);
    if (revealed[deviceId] !== undefined) { setRevealed((prev) => { const next = { ...prev }; delete next[deviceId]; return next; }); return; }
    setRevealing(deviceId); setError('');
    try { const response = await api.post(`/network-docs/secrets/${id(device.secret)}/reveal`, {}); setRevealed((prev) => ({ ...prev, [deviceId]: response.secret.value })); }
    catch (err) { setError(err.message || 'تعذر كشف كلمة المرور'); }
    finally { setRevealing(''); }
  };
  const ping = async (device) => {
    const deviceId = id(device); setPinging((prev) => ({ ...prev, [deviceId]: true }));
    setPingResults((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    try {
      const response = await api.request(`/network-docs/devices/${deviceId}/ping`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(12000) });
      setPingResults((prev) => ({ ...prev, [deviceId]: response.ping }));
    } catch (err) { setPingResults((prev) => ({ ...prev, [deviceId]: { error: ['TimeoutError', 'AbortError'].includes(err.name) ? 'انتهت مهلة الفحص؛ أعد المحاولة.' : err.message } })); }
    finally { setPinging((prev) => ({ ...prev, [deviceId]: false })); }
  };
  return <section className="devices-panel" dir="rtl">
    <div className="devices-heading"><div><h2>معلومات الأجهزة</h2><p>{branchName ? `أجهزة فرع ${branchName}` : 'اختر الفرع لعرض الأجهزة وإدارتها.'}</p></div><strong className="total-count">{devices.length} جهاز</strong></div>
    <div className="device-categories" role="group" aria-label="تصنيفات الأجهزة"><button type="button" className={`category-btn ${category === 'ALL' ? 'active' : ''}`} aria-pressed={category === 'ALL'} onClick={() => setCategory('ALL')}><span>جميع الأجهزة</span><b>{devices.length}</b></button>{categories.map(([type, label]) => <button type="button" key={type} className={`category-btn ${category === type ? 'active' : ''}`} aria-pressed={category === type} onClick={() => setCategory(type)}><span>{label}</span><b>{devices.filter((device) => device.deviceType === type).length}</b></button>)}</div>
    <div className="device-toolbar"><h3>{category === 'ALL' ? 'جميع الأجهزة' : labels[category]} <small>({visible.length})</small></h3><label className="device-search">بحث الأجهزة والمنافذ<input className="input" type="search" placeholder={portView ? 'رقم المنفذ، الباج بنل، نوع الجهاز أو VLAN' : 'الاسم، IP، النوع، الموديل أو اسم المستخدم'} value={search} onChange={(event) => setSearch(event.target.value)} /></label>{canManage ? <button type="button" className="btn btn-primary" disabled={!branchId || busy} onClick={() => { setError(''); setModal({ mode: 'add', form: empty(category) }); }}>{portView ? '+ إضافة منفذ' : '+ إضافة جهاز'}</button> : null}</div>
    {error && !modal ? <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p> : null}{info ? <p role="status" style={{ color: 'var(--accent)' }}>{info}</p> : null}
    {category !== 'ALL' && (canManage || canExport) ? <CameraExcelActions key={category} deviceType={category} branchId={branchId} branchName={branchName} canManage={canManage} canExport={canExport} canReveal={canReveal} onComplete={async () => { setRevealed({}); setPingResults({}); await onReload(); }} /> : null}
    {category === 'ALL' && (canManage || canExport) ? <p className="muted">اختر تصنيف الجهاز لإظهار الاستيراد والتصدير وقالب Excel الخاص به.</p> : null}
    <div className="device-table-wrap"><table className="table">
      <thead><tr>{portView ? portListFields.map(([field, label]) => <th key={field}>{label}</th>) : <>{cameraView ? <><th>رقم الكاميرا</th><th>عنوان IP</th><th>رقم السويج</th><th>رقم المنفذ في السويج</th></> : recorderView ? <><th>اسم الجهاز</th><th>موديل الجهاز</th><th>عدد المنافذ</th><th>عنوان IP</th></> : <><th>{category === 'PRINTER' ? 'اسم الطابعة' : 'الجهاز'}</th><th>النوع</th><th>IP</th></>}{networkPortsView ? <th>عدد المنافذ</th> : null}{category === 'IP_PBX' ? <th>رقم التحويلة</th> : null}<th>{cameraView ? 'اسم الدخول' : 'اسم المستخدم'}</th><th>كلمة المرور</th></>}<th>الإجراءات</th></tr></thead>
      <tbody>{visible.map((device) => <tr key={id(device)}>
        {portView ? portListFields.map(([field]) => <td key={field}><bdi>{device[field] || '-'}</bdi></td>) : <><td><strong>{cameraView ? device.cameraNumber || device.name : device.name}</strong>{!cameraView && !recorderView ? <small>{[device.vendor, device.model, device.physicalLocation].filter(Boolean).join(' / ')}</small> : null}</td>
        {recorderView ? <><td>{device.model || '-'}</td><td><bdi>{device.portCount ?? '-'}</bdi></td></> : !cameraView ? <td>{labels[device.deviceType] || device.deviceType}</td> : null}
        <td>{device.deviceType === 'UPS' ? 'ضمن التفاصيل' : device.managementIp ? <a className="device-ip-link" href={'http://' + device.managementIp} target="_blank" rel="noopener noreferrer" title="فتح واجهة الجهاز في تبويب جديد"><bdi>{device.managementIp}</bdi></a> : '-'}</td>
        {cameraView ? <><td><bdi>{device.switchNumber || '-'}</bdi></td><td><bdi>{device.switchPort || '-'}</bdi></td></> : null}
        {networkPortsView ? <td><bdi>{device.portCount ?? '-'}</bdi></td> : null}
        {category === 'IP_PBX' ? <td><bdi>{device.extensionNumber || '-'}</bdi></td> : null}
        <td><bdi>{device.deviceType === 'UPS' ? 'ضمن التفاصيل' : device.username || '-'}</bdi></td>
        <td>{device.deviceType === 'UPS' ? 'ضمن التفاصيل' : device.secret ? <div className="credential-cell"><code dir="ltr">{revealed[id(device)] ?? '••••••••'}</code>{canReveal ? <button type="button" className="btn btn-soft btn-sm" disabled={revealing === id(device)} onClick={() => reveal(device)}>{revealing === id(device) ? 'جار الكشف...' : revealed[id(device)] !== undefined ? 'إخفاء' : 'كشف'}</button> : null}</div> : <span className="muted">غير مسجلة</span>}</td></>}
        <td><div className="row-actions"><button type="button" className="btn btn-soft btn-sm" onClick={() => { setError(''); setModal({ mode: 'details', device }); }}>عرض التفاصيل</button><button type="button" className="btn btn-soft btn-sm" disabled={!device.managementIp || !!pinging[id(device)] || busy} title="فحص الاستجابة من خادم النظام" onClick={() => ping(device)}>{pinging[id(device)] ? 'جار الفحص...' : 'Ping'}</button>{canManage ? <><button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => edit(device)}>تعديل</button><button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => { setError(''); setModal({ mode: 'delete', device }); }}>حذف</button></> : null}</div>
          {pingResults[id(device)] ? <small role="status" aria-live="polite" style={{ color: pingResults[id(device)].error || !pingResults[id(device)].reachable ? 'var(--danger)' : '#67ddbd' }}>{pingResults[id(device)].error || <>{pingResults[id(device)].reachable ? 'استجاب' : 'لا توجد استجابة'}{pingResults[id(device)].roundTripMs !== null ? <> · <bdi>{pingResults[id(device)].lessThan ? '<' : ''}{pingResults[id(device)].roundTripMs} ms</bdi></> : null}<br />الحزم: <bdi>{pingResults[id(device)].receivedPackets}/{pingResults[id(device)].sentPackets}</bdi> · من خادم النظام</>}</small> : null}
        </td>
      </tr>)}</tbody>
    </table>{!visible.length ? <p className="device-empty">{!branchId ? 'اختر فرعاً أولاً.' : search ? 'لا توجد أجهزة مطابقة للبحث.' : 'لا توجد أجهزة ضمن هذا التصنيف. أضف الجهاز الأول من الزر أعلاه.'}</p> : null}</div>
    {modal && modal.mode !== 'details' && typeof document !== 'undefined' ? createPortal(<div className="modal-backdrop" dir="rtl" onClick={() => { if (!busy) setModal(null); }}><form className="modal-panel" style={{ width: 'min(820px, calc(100vw - 24px))' }} role="dialog" aria-modal="true" aria-labelledby="network-device-modal-title" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h3 id="network-device-modal-title">{(modal.form?.deviceType || modal.device?.deviceType) === 'UPS' ? modal.mode === 'delete' ? 'حذف المنفذ' : modal.mode === 'edit' ? 'تعديل معلومات المنفذ' : 'إضافة منفذ' : modal.mode === 'delete' ? 'حذف الجهاز' : modal.mode === 'edit' ? 'تعديل معلومات الجهاز' : 'إضافة جهاز'}</h3><button type="button" className="modal-close" aria-label="إغلاق" disabled={busy} onClick={() => setModal(null)}>&times;</button></div>
      {modal.mode === 'delete' ? <p>هل تريد حذف الجهاز «{modal.device.name}»؟ ستحذف بيانات دخوله، وتبقى عناوين IP في خطة الشبكة دون ربطها بهذا الجهاز.</p> : <>
        {category === 'ALL' && ['CAMERA', 'NVR', 'UPS'].includes(modal.form.deviceType) ? <label style={{ display: 'grid', gap: 7, marginBottom: 14 }}>تصنيف الجهاز<select className="select" disabled={busy} value={modal.form.deviceType} onChange={(event) => setField('deviceType', event.target.value)}>{categories.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label> : null}
        <div className="device-form-grid">
          {modal.form.deviceType === 'UPS' ? portFields.map(([field, label]) => <label key={field}>{label}{['patchPanelPort', 'patchPanelNumber'].includes(field) ? ' *' : ''}<input className="input" autoFocus={field === 'patchPanelPort'} required={['patchPanelPort', 'patchPanelNumber'].includes(field)} type={field === 'password' ? 'password' : 'text'} autoComplete={field === 'password' ? 'new-password' : 'off'} disabled={busy} value={modal.form[field]} onChange={(event) => setField(field, event.target.value)} placeholder={field === 'vlanNumber' ? '1 - 4094' : field === 'password' && modal.mode === 'edit' && modal.device.secret ? 'اتركها فارغة للإبقاء على الحالية' : undefined} /></label>) : modal.form.deviceType === 'CAMERA' ? <label>رقم الكاميرا *<input autoFocus required className="input" value={modal.form.cameraNumber} disabled={busy} onChange={(event) => setField('cameraNumber', event.target.value)} placeholder="مثال: CAM-01 أو 1" /></label> : <>
            <label>{modal.form.deviceType === 'PRINTER' ? 'اسم الطابعة' : 'اسم الجهاز'} *<input autoFocus required className="input" value={modal.form.name} disabled={busy} onChange={(event) => setField('name', event.target.value)} /></label>
            {modal.form.deviceType !== 'NVR' ? <label>نوع الجهاز *<select className="select" required disabled={busy} value={modal.form.deviceType} onChange={(event) => setField('deviceType', event.target.value)}>{categories.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label> : null}
          </>}
          {['ROUTER', 'FIREWALL'].includes(modal.form.deviceType) ? <label>عدد المنافذ<input className="input" type="number" min="1" step="1" dir="ltr" disabled={busy} value={modal.form.portCount} onChange={(event) => setField('portCount', event.target.value)} placeholder="مثال: 8 أو 24" /></label> : null}
          {modal.form.deviceType === 'NVR' ? <><label>موديل الجهاز<input className="input" disabled={busy} value={modal.form.model} onChange={(event) => setField('model', event.target.value)} /></label><label>عدد المنافذ<input className="input" type="number" min="1" step="1" dir="ltr" placeholder="مثال: 16 أو 32" disabled={busy} value={modal.form.portCount} onChange={(event) => setField('portCount', event.target.value)} /></label></> : null}
          {modal.form.deviceType !== 'UPS' ? <><label>عنوان IP<input className="input" dir="ltr" placeholder="192.168.1.10" disabled={busy} value={modal.form.managementIp} onChange={(event) => setField('managementIp', event.target.value)} /></label>
          {modal.form.deviceType === 'CAMERA' ? <>
            <label>رقم السويج<input className="input" dir="ltr" placeholder="مثال: SW-01" disabled={busy} value={modal.form.switchNumber} onChange={(event) => setField('switchNumber', event.target.value)} /></label>
            <label>رقم المنفذ في السويج<input className="input" dir="ltr" placeholder="مثال: 8 أو Gi1/0/8" disabled={busy} value={modal.form.switchPort} onChange={(event) => setField('switchPort', event.target.value)} /></label>
          </> : null}
          {modal.form.deviceType === 'IP_PBX' ? <label>رقم التحويلة<input className="input" dir="ltr" disabled={busy} value={modal.form.extensionNumber} onChange={(event) => setField('extensionNumber', event.target.value)} placeholder="مثال: 0101" /></label> : null}
          <label>{modal.form.deviceType === 'CAMERA' ? 'اسم الدخول' : 'اسم المستخدم'}<input className="input" dir="ltr" autoComplete="off" disabled={busy} value={modal.form.username} onChange={(event) => setField('username', event.target.value)} /></label>
          <label className={['CAMERA', 'NVR'].includes(modal.form.deviceType) ? undefined : 'device-form-wide'}>كلمة المرور<input className="input" type="password" dir="ltr" autoComplete="new-password" disabled={busy} value={modal.form.password} onChange={(event) => setField('password', event.target.value)} placeholder={modal.mode === 'edit' && modal.device.secret ? 'اتركها فارغة للإبقاء على كلمة المرور الحالية' : 'كلمة مرور الجهاز'} /></label></> : null}
        </div>
        {modal.form.deviceType !== 'UPS' ? <details style={{ marginTop: 18 }}><summary style={{ cursor: 'pointer' }}>تفاصيل إضافية للجهاز</summary><div className="device-form-grid" style={{ marginTop: 14 }}>{[['vendor', 'الشركة المصنعة'], ['model', 'الموديل'], ['serialNumber', 'الرقم التسلسلي'], ['macAddress', 'عنوان MAC'], ['physicalLocation', 'موقع الجهاز'], ['notes', 'ملاحظات'], ...(!['CAMERA', 'NVR', 'ROUTER', 'FIREWALL'].includes(modal.form.deviceType) ? [['portCount', 'عدد المنافذ']] : [])].filter(([field]) => field !== 'model' || modal.form.deviceType !== 'NVR').map(([field, label]) => <label key={field}>{label}<input className="input" type={field === 'portCount' ? 'number' : 'text'} min={field === 'portCount' ? 1 : undefined} step={field === 'portCount' ? 1 : undefined} disabled={busy} value={modal.form[field]} onChange={(event) => setField(field, event.target.value)} /></label>)}</div></details> : null}
      </>}
      {error ? <p role="alert" style={{ color: 'var(--danger)', marginTop: 14 }}>{error}</p> : null}
      <div className="form-actions" style={{ marginTop: 20, gap: 8 }}><button type="button" className="btn btn-soft" disabled={busy} onClick={() => setModal(null)}>إلغاء</button><button className={`btn ${modal.mode === 'delete' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>{busy ? 'جار الحفظ...' : modal.mode === 'delete' ? 'تأكيد الحذف' : 'حفظ الجهاز'}</button></div>
    </form></div>, document.body) : null}
    {modal?.mode === 'details' && typeof document !== 'undefined' ? createPortal(<div className="modal-backdrop" dir="rtl" onClick={() => setModal(null)}><section className="modal-panel" style={{ width: 'min(820px, calc(100vw - 24px))' }} role="dialog" aria-modal="true" aria-labelledby="network-details-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h3 id="network-details-title">{modal.device.deviceType === 'UPS' ? 'تفاصيل المنفذ' : 'تفاصيل الجهاز'}</h3><button type="button" className="modal-close" aria-label="إغلاق" onClick={() => setModal(null)}>&times;</button></div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 16 }}>
        {(modal.device.deviceType === 'UPS' ? portFields : [['name', modal.device.deviceType === 'PRINTER' ? 'اسم الطابعة' : 'اسم الجهاز'], ...(modal.device.deviceType === 'IP_PBX' ? [['extensionNumber', 'رقم التحويلة']] : []), ['deviceType', 'التصنيف'], ['model', 'الموديل'], ['vendor', 'الشركة المصنعة'], ['serialNumber', 'الرقم التسلسلي'], ['macAddress', 'عنوان MAC'], ['physicalLocation', 'الموقع'], ['cameraNumber', 'رقم الكاميرا'], ['switchNumber', 'رقم السويج'], ['switchPort', 'منفذ السويج'], ['portCount', 'عدد المنافذ'], ['notes', 'ملاحظات']]).map(([field, label]) => <div key={field}><dt style={{ color: 'var(--text-soft)', marginBottom: 6 }}>{label}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{field === 'password' ? modal.device.secret ? <><code dir="ltr">{revealed[id(modal.device)] ?? '••••••••'}</code>{canReveal ? <button type="button" className="btn btn-soft btn-sm" disabled={revealing === id(modal.device)} onClick={() => reveal(modal.device)}>{revealing === id(modal.device) ? 'جار الكشف...' : revealed[id(modal.device)] !== undefined ? 'إخفاء' : 'كشف'}</button> : null}</> : 'غير مسجلة' : field === 'managementIp' && modal.device.managementIp ? <a href={'http://' + modal.device.managementIp} target="_blank" rel="noopener noreferrer"><bdi>{modal.device.managementIp}</bdi></a> : field === 'deviceType' ? labels[modal.device.deviceType] : <bdi>{modal.device[field] || '-'}</bdi>}</dd></div>)}
        {modal.device.deviceType !== 'UPS' ? <><div><dt>عنوان IP</dt><dd style={{ margin: '6px 0' }}>{modal.device.managementIp ? <a href={'http://' + modal.device.managementIp} target="_blank" rel="noopener noreferrer"><bdi>{modal.device.managementIp}</bdi></a> : '-'}</dd></div>
        <div><dt>اسم المستخدم</dt><dd style={{ margin: '6px 0' }}><bdi>{modal.device.username || '-'}</bdi></dd></div>
        <div><dt>كلمة المرور</dt><dd style={{ margin: '6px 0', overflowWrap: 'anywhere' }}>{modal.device.secret ? <><code dir="ltr">{revealed[id(modal.device)] ?? '••••••••'}</code>{canReveal ? <button type="button" className="btn btn-soft btn-sm" disabled={revealing === id(modal.device)} onClick={() => reveal(modal.device)}>{revealing === id(modal.device) ? 'جار الكشف...' : revealed[id(modal.device)] !== undefined ? 'إخفاء' : 'كشف'}</button> : null}</> : 'غير مسجلة'}</dd></div></> : null}
      </dl>{error ? <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <div className="form-actions"><button type="button" className="btn btn-soft" onClick={() => { setRevealed({}); setModal(null); }}>إغلاق</button>{canManage ? <button type="button" className="btn btn-primary" onClick={() => edit(modal.device)}>تعديل</button> : null}</div>
    </section></div>, document.body) : null}
    <style jsx>{`.devices-heading,.device-toolbar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px}.devices-heading h2{margin:0}.devices-heading p,.muted{color:var(--text-soft)}.devices-heading p{margin:7px 0 0}.total-count{padding:8px 14px;background:var(--surface-soft);border:1px solid var(--border);border-radius:10px}.device-categories{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:22px 0}.category-btn{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:14px 12px;color:var(--text);background:var(--surface-soft);border:1px solid var(--border);border-radius:12px;cursor:pointer;text-align:start;font:inherit;font-size:13px}.category-btn b{font-size:12px;color:var(--text-soft)}.category-btn.active{border-color:var(--primary);background:rgba(14,130,200,.18)}.category-btn.active b{color:var(--accent)}.device-toolbar{margin:20px 0}.device-toolbar h3{margin:0}.device-toolbar small{color:var(--text-soft)}.device-search{display:grid;gap:6px;font-size:12px;flex:1;max-width:400px;min-width:200px;color:var(--text-soft)}.device-search input{width:100%}.device-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px}.device-table-wrap table{min-width:760px;margin:0}.device-table-wrap td{vertical-align:middle;padding-block:16px}.device-table-wrap small{display:block;margin-top:5px;color:var(--text-soft);max-width:240px;overflow-wrap:anywhere}.row-actions,.credential-cell{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.device-ip-link{color:var(--accent);text-decoration:underline;text-underline-offset:4px}.device-ip-link:hover{color:var(--text)}.credential-cell code{overflow-wrap:anywhere;max-width:240px;white-space:pre-wrap}.device-empty{padding:24px;text-align:center;color:var(--text-soft)}.device-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.device-form-grid label{display:grid;gap:7px;min-width:0}.device-form-grid .input,.device-form-grid .select{width:100%;min-width:0}.device-form-wide{grid-column:1/-1}@media(max-width:900px){.device-categories{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.device-categories{grid-template-columns:repeat(2,minmax(0,1fr))}.device-form-grid{grid-template-columns:1fr}.device-search{max-width:none;min-width:100%}.category-btn{font-size:12px;padding:12px 10px}}`}</style>
  </section>;
}
