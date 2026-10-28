'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';

const download = (blob, filename) => {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function CameraExcelActions({ branchId, branchName, canManage, canExport, canReveal, onComplete, deviceType = 'CAMERA' }) {
  const recorder = deviceType === 'NVR', camera = deviceType === 'CAMERA', port = deviceType === 'UPS';
  const resource = `device-excel/${deviceType}`;
  const title = ({ CAMERA: 'كاميرات المراقبة', NVR: 'أجهزة التسجيل', SWITCH: 'السويجات', ROUTER: 'الراوترات', FIREWALL: 'الجدار الناري', ACCESS_POINT: 'أجهزة الإرسال WiFi', IP_PBX: 'البدالات', PRINTER: 'الطابعات', SERVER: 'السيرفرات', UPS: 'معلومات منافذ السويجات', OTHER: 'الأجهزة الأخرى' })[deviceType];
  const columns = port ? [['patchPanelPort', 'رقم المنفذ في الباج بنل'], ['patchPanelNumber', 'رقم الباج بنل'], ['connectedDeviceType', 'نوع الجهاز'], ['switchPort', 'رقم المنفذ في السويج'], ['managementIp', 'عنوان الايبي'], ['username', 'اسم المستخدم'], ['password', 'كلمة المرور'], ['vlanNumber', 'رقم ال vlan'], ['model', 'مديل الجهاز']] : recorder ? [['name', 'اسم الجهاز'], ['model', 'موديل الجهاز'], ['portCount', 'عدد المنافذ'], ['managementIp', 'عنوان IP'], ['username', 'اسم المستخدم']]
    : camera ? [['cameraNumber', 'رقم الكاميرا'], ['managementIp', 'IP'], ['switchNumber', 'السويج'], ['switchPort', 'المنفذ'], ['username', 'اسم الدخول']]
    : [['name', 'اسم الجهاز'], ['model', 'موديل الجهاز'], ['managementIp', 'عنوان IP'], ['username', 'اسم المستخدم'], ['vendor', 'الشركة المصنعة'], ['serialNumber', 'الرقم التسلسلي'], ['macAddress', 'عنوان MAC'], ['physicalLocation', 'موقع الجهاز'], ['notes', 'ملاحظات'], ['portCount', 'عدد المنافذ']];
  if (deviceType === 'PRINTER') columns[0] = ['name', 'اسم الطابعة'];
  if (deviceType === 'IP_PBX') columns.push(['extensionNumber', 'رقم التحويلة']);
  const [open, setOpen] = useState(false), [file, setFile] = useState(null), [preview, setPreview] = useState(null), [result, setResult] = useState(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [includePasswords, setIncludePasswords] = useState(false);
  const excel = async (template = false) => {
    setBusy(template ? 'template' : 'export'); setError('');
    try {
      const blob = await api.downloadBlob(`/network-docs/branches/${branchId}/${resource}/excel?template=${template ? '1' : '0'}&includePasswords=${!template && canReveal && includePasswords ? '1' : '0'}`);
      download(blob, template ? `قالب ${title}.xlsx` : `${title}-${String(branchName || branchId).replace(/[\\/:*?"<>|]/g, '-')}.xlsx`);
    } catch (err) { setError(err.message || 'تعذر تنزيل ملف Excel'); }
    finally { setBusy(''); }
  };
  const importFile = async (apply = false) => {
    if (!file || busy) return;
    setBusy(apply ? 'import' : 'preview'); setError(''); setResult(null);
    try {
      const form = new FormData(); form.append('file', file); if (apply) form.append('previewToken', preview.previewToken);
      const response = await api.post(`/network-docs/branches/${branchId}/${resource}/${apply ? 'import' : 'import-preview'}`, form);
      if (apply) { setResult(response); setPreview(null); await onComplete(); }
      else setPreview(response);
    } catch (err) { setError(err.message || 'تعذر استيراد الملف'); if (apply) setPreview(null); }
    finally { setBusy(''); }
  };
  const close = () => { if (!busy) { setOpen(false); setFile(null); setPreview(null); setResult(null); setError(''); } };
  return <div className="camera-excel">
    <div className="excel-buttons">
      {canExport ? <button type="button" className="btn btn-soft" disabled={!branchId || !!busy} onClick={() => excel()}>{busy === 'export' ? 'جار التصدير...' : 'تصدير Excel'}</button> : null}
      {canManage ? <button type="button" className="btn btn-soft" disabled={!branchId || !!busy} onClick={() => { setError(''); setOpen(true); }}>استيراد Excel</button> : null}
      {canManage || canExport ? <button type="button" className="btn btn-soft btn-sm" disabled={!branchId || !!busy} onClick={() => excel(true)}>{busy === 'template' ? 'جار التنزيل...' : 'تحميل قالب الاستيراد'}</button> : null}
      {canExport && canReveal ? <label className="password-option"><input type="checkbox" checked={includePasswords} disabled={!!busy} onChange={(event) => setIncludePasswords(event.target.checked)} />تضمين كلمات المرور في التصدير</label> : null}
    </div>
    {error && !open ? <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p> : null}
    {canManage && open && typeof document !== 'undefined' ? createPortal(<div className="modal-backdrop" dir="rtl" onClick={close}><section className="modal-panel camera-import-dialog" role="dialog" aria-modal="true" aria-labelledby="camera-import-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h3 id="camera-import-title">استيراد {title} — {branchName}</h3><button type="button" className="modal-close" disabled={!!busy} aria-label="إغلاق" onClick={close}>&times;</button></div>
      <p>الحقول: {columns.map(([, label]) => label).join('، ')}{!port ? '، كلمة المرور' : ''}.</p>
      <p className="import-note">{port ? 'يُضاف المنفذ الجديد ويُحدّث الموجود حسب رقم الباج بنل ورقم المنفذ فيه داخل الفرع. هذان الحقلان مطلوبان وبقية القيم اختيارية.' : !camera ? 'يُضاف الجهاز الجديد ويُحدّث الموجود حسب اسمه ونوعه في هذا الفرع. اسم الجهاز مطلوب وبقية القيم اختيارية.' : 'يُضاف الرقم الجديد وتُحدَّث الكاميرا الموجودة حسب رقمها في هذا الفرع.'} ترك كلمة المرور فارغة يبقي الحالية عند التحديث. استخدم القالب الخاص بهذا التصنيف.</p>
      <div className="file-controls"><label>ملف Excel (.xlsx) — حتى 1000 جهاز<input className="input" type="file" accept=".xlsx" disabled={!!busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setResult(null); setError(''); }} /></label><button type="button" className="btn btn-primary" disabled={!file || !!busy} onClick={() => importFile(false)}>{busy === 'preview' ? 'جار فحص الملف...' : 'معاينة الملف'}</button></div>
      {preview ? <div style={{ marginTop: 18 }}><p role="status"><strong>إضافة: {preview.createCount}</strong> · <strong>تحديث: {preview.updateCount}</strong> · <strong>أخطاء: {preview.errors.length}</strong></p>
        {preview.errors.length ? <div className="import-errors" role="alert"><strong>صحح الأخطاء التالية ثم أعد المعاينة. لم يُحفظ أي صف.</strong>{preview.errors.map((item, index) => <p key={index}>الصف {item.rowNumber}: {item.message}</p>)}</div> : null}
        <div className="import-preview-table"><table className="table"><thead><tr><th>الصف</th>{columns.map(([field, label]) => <th key={field}>{label}</th>)}{!port ? <th>كلمة المرور</th> : null}<th>الإجراء</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td>{columns.map(([field]) => <td key={field}><bdi>{field === 'password' ? row.passwordProvided ? 'محددة في الملف' : row.action === 'UPDATE' ? 'الإبقاء على الحالية' : 'فارغة' : row[field] ?? '-'}</bdi></td>)}{!port ? <td>{row.passwordProvided ? 'محددة في الملف' : row.action === 'UPDATE' ? 'الإبقاء على الحالية' : 'فارغة'}</td> : null}<td>{row.action === 'CREATE' ? 'إضافة' : 'تحديث'}</td></tr>)}</tbody></table></div>
      </div> : null}
      {result ? <div role="status" style={{ marginTop: 18 }}><p>تمت إضافة {result.createdCount} وتحديث {result.updatedCount}. الصفوف المتعذرة: {result.failedCount}.</p>{result.failures.map((item, index) => <p key={index}>الصف {item.rowNumber}: {item.message}</p>)}</div> : null}
      {error ? <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <div className="form-actions" style={{ marginTop: 20, gap: 8 }}><button type="button" className="btn btn-soft" disabled={!!busy} onClick={close}>إغلاق</button>{preview?.canImport ? <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => importFile(true)}>{busy === 'import' ? 'جار استيراد الأجهزة...' : 'تأكيد الاستيراد'}</button> : null}</div>
    </section></div>, document.body) : null}
    <style jsx>{`.camera-excel{margin:12px 0 18px}.excel-buttons{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.password-option{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-soft)}.camera-import-dialog{width:min(1080px,calc(100vw - 24px));max-height:92dvh}.import-note{color:var(--text-soft);font-size:13px;line-height:1.8}.file-controls{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-top:18px}.file-controls label{display:grid;gap:8px;flex:1;min-width:220px}.import-preview-table{overflow:auto;max-height:42vh;border:1px solid var(--border);border-radius:10px}.import-preview-table table{min-width:850px;margin:0}.import-preview-table th{white-space:nowrap}.import-errors{padding:12px;background:rgba(220,38,38,.08);border:1px solid var(--danger);border-radius:8px;margin-bottom:14px;max-height:180px;overflow:auto}.import-errors p{margin:8px 0;font-size:13px}`}</style>
  </div>;
}
