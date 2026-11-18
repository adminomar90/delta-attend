'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import {
  badgeHeader, badgePng, badgeTemplateForDepartment, badgeTemplates, drawEmployeeBadge, loadBadgeImage,
} from '../../../lib/employeeBadgeCard.mjs';
import { suggestBadgeName, suggestBadgeJob } from '../../../lib/employeeBadgeSuggestions.mjs';
import { printEmployeeBadge } from '../../../lib/employeeBadgePrint.mjs';

const initialCrop = { zoom: 1, x: 0, y: 0 };
const initialEnglish = { name: '', job: '' };
const todayInBaghdad = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const newBadgeId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, '0')).join('');

async function encodePhoto(image) {
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#f6f7fb';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const src = canvas.toDataURL('image/jpeg', 0.9);
  return loadBadgeImage(src);
}

export default function BadgeEditor({ initialBadge }) {
  const [employees, setEmployees] = useState(null);
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState(initialBadge?.employeeId || '');
  const [templateChoice, setTemplateChoice] = useState(initialBadge?.template.choice || 'auto');
  const [face, setFace] = useState('front');
  const [english, setEnglish] = useState(initialBadge ? { name: initialBadge.nameEn, job: initialBadge.jobEn } : initialEnglish);
  const [issuedOn, setIssuedOn] = useState(initialBadge?.issuedOn || todayInBaghdad);
  const [expiresOn, setExpiresOn] = useState(initialBadge?.expiresOn || '');
  const [photo, setPhoto] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [crop, setCrop] = useState(initialBadge?.crop || initialCrop);
  const [artwork, setArtwork] = useState(null);
  const [saved, setSaved] = useState(initialBadge);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [printMode, setPrintMode] = useState('a4');
  const canvas = useRef(null);
  const templateCanvases = useRef({});
  const drag = useRef(null);
  const photoRequest = useRef(0);
  const draftId = useRef(null);
  const inFlight = useRef(false);

  const selected = employees?.find((item) => item.id === employeeId);
  const employee = selected?.employeeCode ? selected : saved?.employee || selected;
  const department = employee?.department || '';
  const departmentTemplate = useMemo(() => badgeTemplateForDepartment(department), [department]);
  const templateOptions = { auto: departmentTemplate, ...badgeTemplates };
  const invalidDates = issuedOn && expiresOn && expiresOn < issuedOn;
  const nameEn = english.name.trim();
  const jobEn = english.job.trim();
  const hasChanges = !saved || saved.template.choice !== templateChoice || saved.nameEn !== nameEn
    || saved.jobEn !== jobEn || saved.issuedOn !== issuedOn || saved.expiresOn !== expiresOn
    || saved.photo !== photo?.src || ['zoom', 'x', 'y'].some((key) => saved.crop[key] !== crop[key]);
  const canSave = Boolean(employee?.employeeCode && issuedOn && expiresOn && !invalidDates && nameEn && jobEn && photo && !photoLoading);
  const canOutput = Boolean(saved?.active && selected?.employeeCode && artwork && photo && !hasChanges && !photoLoading);
  const shownEmployee = saved && !hasChanges ? saved.employee : employee;
  const options = {
    header: artwork, employee: shownEmployee, nameEn, jobEn,
    template: saved && !hasChanges ? saved.template : templateOptions[templateChoice],
    photo, crop, issuedOn, expiresOn, qr: saved?.qr,
  };

  useEffect(() => {
    let live = true;
    api.get('/employee-badges/employees').then(({ employees: list }) => {
      if (live) setEmployees(list);
    }).catch(() => {
      if (live) setError('تعذّر فتح هويات الموظفين. تحقّق من صلاحية الوصول واتصال النظام.');
    });
    loadBadgeImage(badgeHeader).then(async (header) => {
      await document.fonts.load('800 36px Cairo', 'هوية الكادر الفني والإداري والصيانة').catch(() => []);
      if (live) setArtwork(header);
    }).catch(() => {
      if (live) setError('تعذّر تحميل قالب البطاقة.');
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!initialBadge) return undefined;
    const request = ++photoRequest.current;
    loadBadgeImage(initialBadge.photo).then((image) => {
      if (request === photoRequest.current) setPhoto(image);
    }).catch(() => {
      if (request === photoRequest.current) setError('تعذّر تحميل الصورة المحفوظة. يمكنك رفع صورة بديلة.');
    });
    return () => { photoRequest.current += 1; };
  }, [initialBadge]);

  useEffect(() => {
    if (canvas.current && options.header) drawEmployeeBadge(canvas.current, face, options);
  });

  useEffect(() => {
    if (!artwork || !employees) return;
    for (const [key, thumbnail] of Object.entries(templateCanvases.current)) {
      const option = key === 'auto' ? departmentTemplate : badgeTemplates[key];
      if (thumbnail) drawEmployeeBadge(thumbnail, 'front', { header: artwork, template: option });
    }
  }, [artwork, employees, departmentTemplate]);

  function chooseEmployee(id) {
    const next = employees.find((item) => item.id === id);
    setEmployeeId(id);
    setTemplateChoice('auto');
    setFace('front');
    setEnglish(next ? { name: suggestBadgeName(next.fullName), job: suggestBadgeJob(next.jobTitle) } : initialEnglish);
    photoRequest.current += 1;
    setPhoto(null);
    setPhotoLoading(false);
    setCrop(initialCrop);
    draftId.current = null;
    setError('');
  }

  async function choosePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const request = ++photoRequest.current;
    const url = URL.createObjectURL(file);
    setPhotoLoading(true);
    setError('');
    try {
      const image = await encodePhoto(await loadBadgeImage(url));
      if (request === photoRequest.current) {
        setPhoto(image);
        setCrop(initialCrop);
        setFace('front');
      }
    } catch {
      if (request === photoRequest.current) setError('تعذّر قراءة الصورة. اختر صورة PNG أو JPEG أو WebP.');
    } finally {
      if (request === photoRequest.current) setPhotoLoading(false);
      URL.revokeObjectURL(url);
    }
  }

  function startDrag(event) {
    if (!photo || face !== 'front' || busy || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    if (x < 0.285 || x > 0.715 || y < 0.343 || y > 0.605) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { clientX: event.clientX, clientY: event.clientY, width: bounds.width, x: crop.x, y: crop.y };
  }

  function moveDrag(event) {
    if (!drag.current || busy) return;
    const start = drag.current;
    const limit = (value) => Math.max(-100, Math.min(100, Math.round(value)));
    const factor = 400 / start.width;
    setCrop((previous) => ({
      ...previous,
      x: limit(start.x + (event.clientX - start.clientX) * factor),
      y: limit(start.y + (event.clientY - start.clientY) * factor),
    }));
  }

  async function save() {
    if (!canSave || !hasChanges || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const fields = {
        nameEn, jobEn, issuedOn, expiresOn, templateChoice, crop,
        ...(saved?.photo !== photo.src ? { photo: photo.src } : {}),
      };
      draftId.current ||= newBadgeId();
      const { badge } = saved
        ? await api.patch(`/employee-badges/${saved.id}`, { ...fields, revision: saved.revision })
        : await api.post('/employee-badges', { ...fields, id: draftId.current, employeeId });
      setSaved(badge);
      setSuccess(saved ? 'تم حفظ تعديلات الهوية.' : 'تم حفظ الهوية وإضافتها إلى سجل الهويات الصادرة.');
    } catch (err) {
      setError(err.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function output(action) {
    if (!canOutput || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      // Recheck the operator and employee before every new print or export.
      const result = await api.post(`/employee-badges/${saved.id}/prepare`, { revision: saved.revision });
      const render = (side) => {
        const image = document.createElement('canvas');
        drawEmployeeBadge(image, side, { ...options, employee: result.employee, qr: result.qr });
        return image;
      };
      if (action === 'print') {
        await printEmployeeBadge(['front', 'back'].map(render), printMode);
      } else {
        const blob = await badgePng(render(action));
        const url = URL.createObjectURL(blob);
        const download = document.createElement('a');
        download.href = url;
        download.download = `DeltaPlus-${result.employee.employeeCode.replace(/[^\p{L}\p{N}_.-]/gu, '-')}-${action}-300dpi.png`;
        download.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!employees) return <div className="card" role={error ? 'alert' : 'status'}>{error || 'جارٍ تحميل الموظفين…'}</div>;

  const needle = search.trim().toLocaleLowerCase('ar');
  const filtered = employees.filter((item) => item.id === employeeId || (
    `${item.fullName} ${item.employeeCode} ${item.department || ''}`.toLocaleLowerCase('ar').includes(needle)
  ));
  const stopDrag = () => { drag.current = null; };

  return (
    <div className="badge-studio" dir="rtl">
      <section className="card badge-editor" aria-label="بيانات الهوية">
        <fieldset disabled={busy}>
          <legend>قالب الهوية</legend>
          <div className="badge-templates">
            {Object.entries(templateOptions).map(([key, value]) => (
              <button key={key} type="button" className="badge-template btn btn-soft"
                aria-pressed={templateChoice === key} onClick={() => {
                  setTemplateChoice(key);
                  setFace('front');
                }}>
                <canvas className="badge-template-thumb" aria-hidden="true"
                  ref={(element) => { templateCanvases.current[key] = element; }} />
                <span>{key === 'auto' ? <>حسب قسم الموظف<small>{value.title}</small></> : value.title}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={busy}>
          <legend>الموظف وبيانات الطباعة</legend>
          {!saved && <label className="badge-field">البحث في قائمة الموظفين
            <input className="input" type="search" value={search} placeholder="الاسم أو الرقم أو القسم"
              onChange={(e) => setSearch(e.target.value)} />
          </label>}
          {!saved && <label className="badge-field">الموظف
            <select className="input" value={employeeId} onChange={(e) => chooseEmployee(e.target.value)}>
              <option value="">{filtered.length ? 'اختر موظفًا مفعّلًا' : 'لا يوجد موظفون مطابقون'}</option>
              {filtered.map((item) => <option key={item.id} value={item.id}>
                {[item.fullName, item.employeeCode, item.department].filter(Boolean).join(' · ')}
              </option>)}
            </select>
          </label>}
          {shownEmployee && <>
            <dl className="badge-record">
              <div><dt>الاسم بالعربية</dt><dd>{shownEmployee.fullName}</dd></div>
              <div><dt>المسمى بالعربية</dt><dd>{shownEmployee.jobTitle}</dd></div>
              <div><dt>رقم الموظف</dt><dd dir="ltr">{shownEmployee.employeeCode || '—'}</dd></div>
            </dl>
            {!employee.employeeCode && <p role="alert" className="badge-error">أضف رقم الموظف من شاشة الموظفين قبل إصدار هويته.</p>}
          </>}
          <div className="badge-fields">
            <label className="badge-field">الاسم بالإنجليزية
              <input className="input" dir="ltr" value={english.name} maxLength={240} disabled={!employee}
                autoComplete="off" onChange={(e) => setEnglish({ ...english, name: e.target.value })} />
            </label>
            <label className="badge-field">المسمى بالإنجليزية
              <input className="input" dir="ltr" value={english.job} maxLength={160} disabled={!employee}
                autoComplete="off" onChange={(e) => setEnglish({ ...english, job: e.target.value })} />
            </label>
            <label className="badge-field">تاريخ الإصدار
              <input className="input" type="date" value={issuedOn} max="9999-12-31" onChange={(e) => setIssuedOn(e.target.value)} />
            </label>
            <label className="badge-field">تاريخ الانتهاء
              <input className="input" type="date" value={expiresOn} min={issuedOn} max="9999-12-31"
                aria-invalid={Boolean(invalidDates)} onChange={(e) => setExpiresOn(e.target.value)} />
            </label>
          </div>
          {invalidDates && <p className="badge-error" role="alert">يجب أن يوافق تاريخ الانتهاء تاريخ الإصدار أو يأتي بعده.</p>}
        </fieldset>

        <fieldset disabled={busy || !employee}>
          <legend>الصورة الشخصية</legend>
          <label className="badge-field">رفع صورة
            <input key={employeeId} type="file" className="input" accept="image/png,image/jpeg,image/webp"
              onChange={choosePhoto} />
          </label>
          {photoLoading && <p role="status" className="badge-help">جارٍ تجهيز الصورة…</p>}
          {photo && <div className="badge-crop">
            {[
              ['zoom', 'تكبير الصورة', 1, 3, 0.05],
              ['x', 'تحريك أفقي', -100, 100, 1],
              ['y', 'تحريك عمودي', -100, 100, 1],
            ].map(([key, label, min, max, step]) => (
              <label key={key} className="badge-field">{label}
                <input type="range" dir="ltr" min={min} max={max} step={step} value={crop[key]}
                  onChange={(e) => { setFace('front'); setCrop({ ...crop, [key]: Number(e.target.value) }); }} />
              </label>
            ))}
            <button className="btn btn-soft btn-sm" type="button" onClick={() => setCrop(initialCrop)}>إعادة ضبط الصورة</button>
          </div>}
        </fieldset>
      </section>

      <section className="card badge-preview" aria-label="معاينة الهوية">
        <div className="badge-preview-heading">
          <h2>معاينة البطاقة</h2>
          <span dir="ltr">53.98 × 85.60 mm</span>
        </div>
        <div className="badge-face-switch" role="group" aria-label="وجه البطاقة">
          <button type="button" className="btn btn-soft" aria-pressed={face === 'front'} onClick={() => setFace('front')}>الوجه الأمامي</button>
          <button type="button" className="btn btn-soft" aria-pressed={face === 'back'} onClick={() => setFace('back')}>الوجه الخلفي</button>
        </div>
        <div className="badge-preview-board">
          {artwork && <canvas ref={canvas} role="img" aria-label={face === 'front' ? 'الوجه الأمامي للبطاقة' : 'الوجه الخلفي للبطاقة'}
            className={photo && face === 'front' ? 'badge-draggable' : undefined} onPointerDown={startDrag}
            onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag} />}
        </div>
        {error && <p className="badge-error" role="alert">{error}</p>}
        {success && !hasChanges && <p className="badge-success" role="status">{success}</p>}
        {!canSave && <p className="badge-help">أكمل بيانات الموظف والحقول الإنجليزية والتواريخ والصورة لحفظ الهوية.</p>}
        {canSave && hasChanges && <p className="badge-help">احفظ الهوية قبل الطباعة أو التصدير.</p>}
        {saved && !saved.active && <p className="badge-help">هذه الهوية موقوفة. يمكنك إعادة تفعيلها من سجل الهويات الصادرة.</p>}
        {saved && !selected?.employeeCode && <p className="badge-help">تتطلب الطباعة والتصدير موظفًا مفعّلًا برقم مسجّل.</p>}
        <div className="badge-export">
          <button className="btn btn-primary" type="button" disabled={!canSave || !hasChanges || busy} onClick={save}>
            {saved ? 'حفظ التعديلات' : 'حفظ الهوية'}
          </button>
          <label className="badge-field">مقاس الطباعة
            <select className="input" value={printMode} disabled={busy} onChange={(e) => setPrintMode(e.target.value)}>
              <option value="a4">الوجهان على ورقة A4 بالحجم الفعلي</option>
              <option value="card">كل وجه في صفحة بمقاس البطاقة</option>
            </select>
          </label>
          <button className="btn btn-primary" type="button" disabled={!canOutput || busy} onClick={() => output('print')}>طباعة الوجهين</button>
          <div className="badge-fields">
            <button className="btn btn-soft" type="button" disabled={!canOutput || busy} onClick={() => output('front')}>تنزيل الأمامي PNG</button>
            <button className="btn btn-soft" type="button" disabled={!canOutput || busy} onClick={() => output('back')}>تنزيل الخلفي PNG</button>
          </div>
        </div>
      </section>
    </div>
  );
}
