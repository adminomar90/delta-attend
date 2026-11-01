'use client';

import { useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';
import './photo-library.css';

const dateLabel = (value) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad' }) : '';

function PhotoViewer({ photos, index, onIndex, onClose }) {
  const dialog = useRef(null);
  const photo = photos[index];
  useEffect(() => {
    dialog.current.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  const move = (step) => onIndex((index + step + photos.length) % photos.length);
  return <dialog ref={dialog} className="photo-viewer" aria-label="معاينة صورة المشروع" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }} onKeyDown={(event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(-1); }
  }}>
    <div className="photo-viewer-content">
      <div className="photo-library-toolbar"><span>{index + 1} / {photos.length}</span><button className="btn btn-soft" onClick={onClose} autoFocus>إغلاق ✕</button></div>
      <img className="photo-full" src={assetUrl(photo.publicUrl)} alt={photo.comment || photo.originalName || 'صورة المشروع'} />
      <div className="photo-library-toolbar">
        <button className="btn btn-soft" onClick={() => move(-1)} disabled={photos.length < 2}>السابقة</button>
        <div className="photo-caption">{photo.comment || photo.originalName || 'صورة المشروع'}<small>{dateLabel(photo.date)}</small></div>
        <button className="btn btn-soft" onClick={() => move(1)} disabled={photos.length < 2}>التالية</button>
      </div>
      <a className="btn btn-primary" href={assetUrl(photo.publicUrl)} target="_blank" rel="noreferrer">فتح الصورة الأصلية</a>
    </div>
  </dialog>;
}

function OrganizeDialog({ action, count, folders, folder, busy, error, onClose, onConfirm }) {
  const dialog = useRef(null);
  const [target, setTarget] = useState('');
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="photo-organize-dialog" aria-labelledby="photo-organize-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <h3 id="photo-organize-title">{action === 'MOVE' ? 'نقل الصور إلى مشروع آخر' : 'حذف الصور من المكتبة'}</h3>
    <p>عدد الصور المحددة: {count}</p>
    {action === 'MOVE' ? <label className="photo-target-label">المجلد المطلوب<select aria-label="المجلد المطلوب" value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)} autoFocus>
      <option value="">اختر مجلد المشروع</option>{folders.filter((item) => item.key !== folder).map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
    </select></label> : null}
    <p className="photo-muted">{action === 'MOVE' ? 'ستُنقل الصور المحددة بين مجلدات المكتبة.' : 'ستُحذف الصور المحددة من المكتبة ولن تظهر مجددًا عند التحديث.'} تبقى الصور الأصلية محفوظة داخل تقارير العمل.</p>
    {error ? <p role="alert" className="photo-action-error">{error}</p> : null}
    <div className="photo-library-toolbar"><button className="btn btn-soft" disabled={busy} onClick={onClose}>إلغاء</button><button className={`btn ${action === 'DELETE' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || (action === 'MOVE' && !target)} onClick={() => onConfirm(target)}>{busy ? 'جارٍ التنفيذ…' : action === 'MOVE' ? 'تأكيد النقل' : 'تأكيد الحذف'}</button></div>
  </dialog>;
}

function FolderDialog({ value, busy, error, onClose, onSubmit }) {
  const dialog = useRef(null);
  const [name, setName] = useState('');
  const creating = value.type === 'CREATE';
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="photo-organize-dialog" aria-labelledby="folder-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(name); }}>
      <h3 id="folder-dialog-title">{creating ? 'إضافة مجلد جديد' : 'حذف المجلد'}</h3>
      {creating ? <label className="photo-target-label">اسم المجلد<input aria-label="اسم المجلد" value={name} maxLength={120} required autoFocus disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="اكتب اسم المشروع أو المجلد" /></label>
        : <><p>هل تريد حذف مجلد «{value.name}» وجميع صوره من المكتبة؟</p><p>عدد الصور: {value.photoCount}</p><p className="photo-muted">تبقى صور تقارير العمل الأصلية محفوظة. لن يعود المجلد تلقائيًا عند تحديث المكتبة؛ يمكنك إعادة إنشائه بالاسم نفسه عند الحاجة.</p></>}
      {error ? <p role="alert" className="photo-action-error">{error}</p> : null}
      <div className="photo-library-toolbar"><button type="button" className="btn btn-soft" disabled={busy} onClick={onClose}>إلغاء</button><button type="submit" className={`btn ${creating ? 'btn-primary' : 'btn-danger'}`} disabled={busy || (creating && !name.trim())}>{busy ? 'جارٍ التنفيذ…' : creating ? 'إنشاء المجلد' : 'تأكيد حذف المجلد'}</button></div>
    </form>
  </dialog>;
}

export default function WorkPhotoLibrary() {
  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState('');
  const [album, setAlbum] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [folderDialog, setFolderDialog] = useState(null);
  const allCheckbox = useRef(null);
  const canManage = hasPermission(authStorage.getUser(), Permission.MANAGE_WORK_PHOTO_LIBRARY);
  const count = all ? Math.max(0, (album?.photoCount || 0) - checked.size) : checked.size;
  useEffect(() => { if (allCheckbox.current) allCheckbox.current.indeterminate = count > 0 && count < (album?.photoCount || 0); }, [count, album, loading]);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(''); setSelected(null);
    api.get(`/work-reports/photo-library${folder ? `?folder=${encodeURIComponent(folder)}&page=${page}` : ''}`)
      .then((data) => { if (alive) { setFolders(data.folders); setAlbum(data.album); } })
      .catch((err) => { if (alive) setError(err.message || 'تعذر تحميل مكتبة الصور'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [folder, page, refresh]);
  useEffect(() => {
    const update = () => setRefresh((value) => value + 1);
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, []);
  const normalize = (value) => value.normalize('NFKC').replace(/[\u064B-\u065F\u0670ـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase();
  const words = normalize(search.trim()).split(/\s+/).filter(Boolean);
  const visible = folders.filter((item) => words.every((word) => normalize(item.name).includes(word)));
  const clearSelection = () => { setChecked(new Set()); setAll(false); };
  const openFolder = (key) => { clearSelection(); setMessage(''); setActionError(''); setPage(1); setAlbum(null); setFolder(key); };
  const togglePhoto = (id) => setChecked((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectionPayload = () => ({ folder, all, ...(all ? { excludedIds: [...checked] } : { ids: [...checked] }) });
  const download = async () => {
    setBusy(true); setActionError(''); setMessage('');
    try {
      const blob = await api.post('/work-reports/photo-library/download', selectionPayload());
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${album.name.replace(/[\\/<>:"|?*]/g, '_')}-photos.zip`; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000); setMessage('تم تجهيز ملف ZIP للصور المحددة.');
    } catch (err) { setActionError(err.message); } finally { setBusy(false); }
  };
  const organize = async (targetFolder) => {
    setBusy(true); setActionError('');
    try {
      const result = await api.post('/work-reports/photo-library/organize', { ...selectionPayload(), action, targetFolder });
      setMessage(action === 'MOVE' ? `تم نقل ${result.count} صورة.` : `تم حذف ${result.count} صورة من المكتبة.`);
      setAction(''); clearSelection(); setPage(1); setRefresh((value) => value + 1);
    } catch (err) { setActionError(err.message); } finally { setBusy(false); }
  };
  const manageFolder = async (name) => {
    setBusy(true); setActionError('');
    try {
      const creating = folderDialog.type === 'CREATE';
      const data = await api.post(`/work-reports/photo-library/folders${creating ? '' : '/delete'}`, creating ? { name } : { folder: folderDialog.key });
      if (creating) { setSearch(''); openFolder(data.folder.key); }
      else if (folder === folderDialog.key) openFolder('');
      setMessage(creating ? 'تم إنشاء المجلد.' : 'تم حذف المجلد وصوره من المكتبة.');
      setFolderDialog(null); clearSelection(); setRefresh((value) => value + 1);
    } catch (err) { setActionError(err.message); } finally { setBusy(false); }
  };
  const showFolderDialog = (value) => { setActionError(''); setFolderDialog(value); };
  return <div className="work-photo-library" dir="rtl">
    <section className="card">
      <div className="photo-library-toolbar">
        <div><h2>مكتبة صور الأعمال</h2><p className="photo-muted">صور تقارير العمل مرتبة تلقائيًا داخل مجلد خاص لكل مشروع.</p></div>
        <div className="photo-library-toolbar">{canManage ? <button className="btn btn-primary" disabled={loading || busy} onClick={() => showFolderDialog({ type: 'CREATE' })}>+ إضافة مجلد</button> : null}<button className="btn btn-soft" disabled={loading || busy} onClick={() => { clearSelection(); setRefresh((value) => value + 1); }}>تحديث</button></div>
      </div>
      <div className="photo-library-toolbar">
        {folder ? <button className="btn btn-soft" onClick={() => openFolder('')}>← جميع المشاريع</button> : <label className="photo-search">البحث عن مشروع<input aria-label="البحث عن مشروع" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="اكتب اسم المشروع…" /></label>}
        <span className="photo-muted">{folders.length} مشروع · {folders.reduce((total, item) => total + item.photoCount, 0)} صورة</span>
      </div>
    </section>
    {message ? <section className="card photo-operation-message" role="status">{message}</section> : null}
    {actionError && !action && !folderDialog ? <section className="card photo-action-error" role="alert">{actionError}</section> : null}
    {error ? <section className="card" role="alert"><p>{error}</p><button className="btn btn-primary" onClick={() => setRefresh((value) => value + 1)}>إعادة المحاولة</button></section> : null}
    {loading ? <section className="card" role="status">جارٍ تحميل الصور…</section> : !error && (folder ? <section className="card">
      <div className="photo-library-toolbar"><h3>📁 {album?.name}</h3><span className="photo-muted">{album?.photoCount || 0} صورة</span>{canManage ? <button className="btn btn-danger" disabled={busy || !album} onClick={() => showFolderDialog({ type: 'DELETE', ...album })}>حذف المجلد</button> : null}</div>
      <div className="photo-selection-toolbar">
        <label className="photo-select-all"><input ref={allCheckbox} type="checkbox" aria-label="تحديد كل صور المجلد" disabled={busy || !album?.photoCount} checked={count > 0 && count === album?.photoCount} onChange={(event) => { setAll(event.target.checked); setChecked(new Set()); }} />تحديد الكل ({album?.photoCount || 0})</label>
        <span aria-live="polite">المحدد: {count}</span>
        <button className="btn btn-soft" disabled={busy || !count} onClick={clearSelection}>إلغاء التحديد</button>
        <button className="btn btn-primary" disabled={busy || !count} onClick={download}>{busy && !action ? 'جارٍ التحميل…' : 'تحميل المحدد ZIP'}</button>
        {canManage ? <><button className="btn btn-soft" disabled={busy || !count || folders.length < 2} onClick={() => { setActionError(''); setAction('MOVE'); }}>نقل المحدد</button><button className="btn btn-danger" disabled={busy || !count} onClick={() => { setActionError(''); setAction('DELETE'); }}>حذف المحدد</button></> : null}
      </div>
      <p className="photo-muted">تحديد الكل يشمل جميع صفحات هذا المجلد. يمكنك استثناء صور بإلغاء تحديدها.</p>
      <div className="project-photo-grid">
        {(album?.photos || []).map((photo, index) => <div key={photo.id} className={`project-photo-item ${(all ? !checked.has(photo.id) : checked.has(photo.id)) ? 'is-selected' : ''}`}>
          <label className="photo-item-checkbox"><input type="checkbox" aria-label={`تحديد الصورة ${index + 1}`} disabled={busy} checked={all ? !checked.has(photo.id) : checked.has(photo.id)} onChange={() => togglePhoto(photo.id)} /></label>
          <button className="project-photo" aria-label={`عرض الصورة ${index + 1}`} onClick={() => setSelected(index)}>
          <img loading="lazy" decoding="async" src={assetUrl(photo.publicUrl)} alt={photo.comment || `صورة ${index + 1}`} />
          <span className="photo-fallback" aria-hidden="true">اضغط لعرض الصورة</span>
        </button></div>)}
      </div>
      {!album?.photoCount ? <p className="photo-empty">هذا المجلد فارغ حاليًا.</p> : null}
      {(album?.pages || 0) > 1 ? <div className="photo-library-toolbar photo-pagination"><button className="btn btn-soft" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button><span>الصفحة {page} من {album.pages}</span><button className="btn btn-soft" disabled={page >= album.pages} onClick={() => setPage(page + 1)}>التالي</button></div> : null}
    </section> : <section className="card">
      {visible.length ? <div className="project-album-grid">{visible.map((item) => <div className="project-album-wrapper" key={item.key}><button className="project-album" disabled={busy} onClick={() => openFolder(item.key)}>
        <div className="project-album-cover">{item.cover ? <img loading="lazy" decoding="async" src={assetUrl(item.cover)} alt="" /> : null}<span>📁</span></div>
        <div className="project-album-info"><h3>{item.name}</h3><p>{item.photoCount} صورة · {item.reportCount} تقرير</p><small>آخر تحديث: {dateLabel(item.updatedAt)}</small></div>
      </button>{canManage ? <button className="btn btn-danger photo-folder-delete" disabled={busy} aria-label={`حذف مجلد ${item.name}`} onClick={() => showFolderDialog({ type: 'DELETE', ...item })}>حذف المجلد</button> : null}</div>)}</div> : <p className="photo-empty">{search ? 'لا توجد مشاريع تطابق البحث.' : 'لا توجد صور حاليًا. ستظهر صور تقارير العمل هنا تلقائيًا عند إضافتها.'}</p>}
    </section>)}
    {selected !== null && album?.photos?.[selected] ? <PhotoViewer photos={album.photos} index={selected} onIndex={setSelected} onClose={() => setSelected(null)} /> : null}
    {action ? <OrganizeDialog action={action} count={count} folders={folders} folder={folder} busy={busy} error={actionError} onClose={() => { setAction(''); setActionError(''); }} onConfirm={organize} /> : null}
    {folderDialog ? <FolderDialog value={folderDialog} busy={busy} error={actionError} onClose={() => { setFolderDialog(null); setActionError(''); }} onSubmit={manageFolder} /> : null}
  </div>;
}
