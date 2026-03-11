import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.resolve(__dirname, 'fonts', 'arial.ttf');
const FONT_BOLD    = path.resolve(__dirname, 'fonts', 'arialbd.ttf');

/* ── Design tokens ─────────────────────────────────────────────────────────── */
const C = {
  navy:      '#0d1f3c',
  blue:      '#1b4f8a',
  accent:    '#2980b9',
  lightBlue: '#eaf2fb',
  paleBlue:  '#f5f9fd',
  border:    '#c8d6e5',
  text:      '#1e272e',
  soft:      '#636e72',
  white:     '#ffffff',
  success:   '#27ae60',
  warning:   '#e67e22',
  danger:    '#c0392b',
  gold:      '#f1c40f',
  rowEven:   '#ffffff',
  rowOdd:    '#f0f5fb',
};

const STATUS = {
  SUBMITTED: { ar: 'بانتظار الاعتماد', bg: C.warning },
  APPROVED:  { ar: 'معتمد',            bg: C.success },
  REJECTED:  { ar: 'مرفوض',            bg: C.danger  },
};

/* ── Utilities ─────────────────────────────────────────────────────────────── */
const fmtDate     = (v) => (v ? new Date(v).toLocaleDateString('ar-IQ') : '-');
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('ar-IQ') : '-');
const safe        = (v) => String(v ?? '').trim() || '-';

const resolveLocalImagePath = (publicUrl, root = '') => {
  if (!root) return '';
  const raw = String(publicUrl || '').trim();
  if (!raw.startsWith('/uploads/')) return '';
  const rel = raw.split('?')[0].split('#')[0].replace('/uploads/', '');
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(path.resolve(root))) return '';
  return fs.existsSync(abs) ? abs : '';
};

const resolveImageUrl = (publicUrl, base = '') => {
  const url = String(publicUrl || '').trim();
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
};

/* ── PDF Builder ───────────────────────────────────────────────────────────── */
export const buildWorkReportPdfBuffer = async (
  report,
  { publicBaseUrl = '', uploadRootDir = '' } = {},
) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 36,
      size: 'A4',
      bufferPages: true,
      info: { Title: `تقرير العمل - ${safe(report?.title)}`, Author: 'Delta Plus', Creator: 'Delta Plus System' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    /* fonts */
    const hasFont = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);
    if (hasFont) {
      doc.registerFont('Ar', FONT_REGULAR);
      doc.registerFont('ArB', FONT_BOLD);
    }
    const F  = hasFont ? 'Ar' : 'Helvetica';
    const FB = hasFont ? 'ArB' : 'Helvetica-Bold';

    const PW = doc.page.width;           // page width
    const ML = doc.page.margins.left;
    const CW = PW - ML - doc.page.margins.right;
    const BOTTOM = doc.page.height - doc.page.margins.bottom - 30; // reserve footer

    /* ── reusable draw helpers ─────────────────────────────────────────────── */
    const needPage = (h) => { if (doc.y + h > BOTTOM) doc.addPage(); };

    const drawLine = (y, color = C.border) => {
      doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor(color).lineWidth(0.5).stroke();
    };

    const sectionTitle = (text) => {
      needPage(40);
      const y = doc.y;
      // left accent bar
      doc.rect(ML + CW - 4, y, 4, 20).fill(C.accent);
      // background
      doc.rect(ML, y, CW - 5, 20).fill(C.navy);
      doc.font(FB).fontSize(10).fillColor(C.white);
      doc.text(text, ML + 6, y + 4, { width: CW - 16, align: 'right', features: ['arab'] });
      doc.y = y + 24;
      doc.fillColor(C.text);
    };

    const tableRow = (label, value, idx) => {
      const H = 20;
      const y = doc.y;
      const bg = idx % 2 === 0 ? C.rowEven : C.rowOdd;
      const labelW = CW * 0.35;
      const valW   = CW * 0.63;

      // background
      doc.rect(ML, y, CW, H).fill(bg);
      // borders: top + bottom lines
      doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor(C.border).lineWidth(0.3).stroke();
      doc.moveTo(ML, y + H).lineTo(ML + CW, y + H).strokeColor(C.border).lineWidth(0.3).stroke();
      // vertical separator
      const sepX = ML + valW + 4;
      doc.moveTo(sepX, y).lineTo(sepX, y + H).strokeColor(C.border).lineWidth(0.3).stroke();

      // label (right side)
      doc.font(FB).fontSize(8.5).fillColor(C.navy);
      doc.text(String(label), sepX + 4, y + 5, { width: labelW - 8, align: 'right', lineBreak: false, features: ['arab'] });
      // value (left side)
      doc.font(F).fontSize(8.5).fillColor(C.text);
      doc.text(String(value), ML + 4, y + 5, { width: valW - 4, align: 'left', lineBreak: false, features: ['arab'] });

      doc.y = y + H;
      doc.fillColor(C.text);
    };

    const textSection = (label, value) => {
      if (!value || value === '-') return;
      needPage(50);
      doc.moveDown(0.25);
      // label with icon-like dot
      doc.font(FB).fontSize(9).fillColor(C.accent);
      doc.text(`■  ${label}`, ML, doc.y, { width: CW, align: 'right', features: ['arab'] });
      doc.moveDown(0.1);
      // bordered text box
      const textY = doc.y;
      doc.font(F).fontSize(8.5).fillColor(C.text);
      const textH = doc.heightOfString(String(value), { width: CW - 16, align: 'right' });
      const boxH = Math.max(textH + 10, 18);
      doc.rect(ML, textY - 2, CW, boxH + 4).lineWidth(0.4).strokeColor(C.border).fillAndStroke(C.paleBlue, C.border);
      doc.fillColor(C.text).font(F).fontSize(8.5);
      doc.text(String(value), ML + 8, textY + 3, { width: CW - 16, align: 'right', features: ['arab'] });
      doc.y = textY + boxH + 6;
    };

    /* ══════════════════════════════════════════════════════════════════════════
       PAGE 1 — HEADER
       ══════════════════════════════════════════════════════════════════════════ */

    // Full-width navy header banner
    doc.rect(0, 0, PW, 80).fill(C.navy);

    // Gold accent line
    doc.rect(0, 78, PW, 3).fill(C.gold);

    // Company name
    doc.font(FB).fontSize(22).fillColor(C.white);
    doc.text('DELTA PLUS', ML, 14, { width: CW, align: 'center' });

    // Report title
    doc.font(F).fontSize(12).fillColor('#a0c4e8');
    doc.text('تقرير العمل اليومي', ML, 42, { width: CW, align: 'center', features: ['arab'] });

    // Report date (bottom-left of header)
    doc.font(F).fontSize(7).fillColor('#8aafc8');
    doc.text(`${fmtDateTime(new Date())}`, ML, 62, { width: CW * 0.5, align: 'left' });

    // Report ID (bottom-right of header)
    doc.text(`#${String(report?._id || '').slice(-8).toUpperCase()}`, ML + CW * 0.5, 62,
      { width: CW * 0.5, align: 'right' });

    doc.y = 90;

    // ── Status badge (top-right below header) ──
    const st = STATUS[report?.status] || STATUS.SUBMITTED;
    const badgeW = 120;
    const badgeX = ML + CW - badgeW;
    doc.roundedRect(badgeX, doc.y, badgeW, 20, 3).fill(st.bg);
    doc.font(FB).fontSize(9).fillColor(C.white);
    doc.text(st.ar, badgeX, doc.y + 5, { width: badgeW, align: 'center', features: ['arab'] });
    doc.y += 28;

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 1 — بيانات الموظف والمشروع
       ══════════════════════════════════════════════════════════════════════════ */
    sectionTitle('بيانات الموظف والمشروع');

    const eName = safe(report?.employeeName || report?.user?.fullName);
    const eCode = safe(report?.employeeCode || report?.user?.employeeCode);
    const proj  = safe(report?.projectName  || report?.project?.name);
    const dept  = safe(report?.user?.department);

    tableRow('اسم الموظف',   eName, 0);
    tableRow('الرمز الوظيفي', eCode, 1);
    tableRow('القسم',         dept,  2);
    tableRow('المشروع',       proj,  3);
    tableRow('تاريخ العمل',   fmtDate(report?.workDate || report?.createdAt), 4);

    doc.moveDown(0.6);

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 2 — مؤشرات الأداء
       ══════════════════════════════════════════════════════════════════════════ */
    sectionTitle('مؤشرات الأداء');

    const kpis = [
      { label: 'نسبة الإنجاز',    value: `${Number(report?.progressPercent || 0)}%` },
      { label: 'ساعات العمل',      value: `${Number(report?.hoursSpent || 0)}` },
      { label: 'النقاط',           value: `${Number(report?.pointsAwarded || 0)}` },
      { label: 'النشاط',           value: safe(report?.activityType) },
    ];

    const cardGap = 8;
    const cardW   = (CW - cardGap * 3) / 4;
    const cardH   = 50;
    const cardsY  = doc.y + 2;

    kpis.forEach((kpi, i) => {
      const x = ML + i * (cardW + cardGap);
      // card shadow illusion
      doc.rect(x + 1, cardsY + 1, cardW, cardH).fill('#dde6f0');
      // card body
      doc.rect(x, cardsY, cardW, cardH).fillAndStroke(C.white, C.border);
      // top accent line
      doc.rect(x, cardsY, cardW, 3).fill(C.accent);
      // value
      doc.font(FB).fontSize(15).fillColor(C.navy);
      doc.text(kpi.value, x, cardsY + 10, { width: cardW, align: 'center', features: ['arab'] });
      // label
      doc.font(F).fontSize(7.5).fillColor(C.soft);
      doc.text(kpi.label, x, cardsY + 32, { width: cardW, align: 'center', features: ['arab'] });
    });

    doc.y = cardsY + cardH + 10;
    doc.fillColor(C.text);

    /* progress bar */
    needPage(20);
    const barY = doc.y;
    const barH = 10;
    const pct  = Math.min(100, Math.max(0, Number(report?.progressPercent || 0)));
    doc.rect(ML, barY, CW, barH).fill('#e0e8f0');
    if (pct > 0) {
      const fillColor = pct >= 80 ? C.success : pct >= 50 ? C.accent : C.warning;
      doc.rect(ML, barY, CW * pct / 100, barH).fill(fillColor);
    }
    doc.font(FB).fontSize(6.5).fillColor(C.navy);
    doc.text(`${pct}%`, ML, barY + 1.5, { width: CW, align: 'center' });
    doc.y = barY + barH + 10;

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 3 — تفاصيل العمل
       ══════════════════════════════════════════════════════════════════════════ */
    sectionTitle('تفاصيل العمل');

    // Title row
    doc.moveDown(0.15);
    doc.font(FB).fontSize(10).fillColor(C.navy);
    doc.text(safe(report?.title), ML, doc.y, { width: CW, align: 'right', features: ['arab'] });
    drawLine(doc.y + 2, C.accent);
    doc.moveDown(0.3);

    textSection('التفاصيل',          safe(report?.details));
    textSection('الإنجازات',         safe(report?.accomplishments));
    textSection('التحديات والعقبات', safe(report?.challenges));
    textSection('الخطوات القادمة',   safe(report?.nextSteps));

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 4 — مراجعة المدير
       ══════════════════════════════════════════════════════════════════════════ */
    doc.moveDown(0.4);
    sectionTitle('ملاحظات المدير والاعتماد');

    tableRow('تعليق المدير',   safe(report?.managerComment), 0);
    tableRow('سبب الرفض',      safe(report?.rejectionReason), 1);
    tableRow('تاريخ الاعتماد', fmtDateTime(report?.approvedAt), 2);

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 5 — المرفقات والصور
       ══════════════════════════════════════════════════════════════════════════ */
    const images = report?.images || [];
    if (images.length > 0) {
      doc.moveDown(0.6);
      needPage(60);
      sectionTitle(`المرفقات والصور  ( ${images.length} )`);
      doc.moveDown(0.3);

      images.forEach((image, idx) => {
        const localPath = resolveLocalImagePath(image?.publicUrl, uploadRootDir);
        const imgUrl    = resolveImageUrl(image?.publicUrl, publicBaseUrl);
        const imgName   = safe(image?.originalName || `صورة ${idx + 1}`);
        const imgCmt    = String(image?.comment || '').trim();

        /* ── image title bar ─── */
        needPage(280);
        const titleBarY = doc.y;
        doc.rect(ML, titleBarY, CW, 18).fill(C.navy);
        doc.font(FB).fontSize(8).fillColor(C.gold);
        doc.text(`${idx + 1}`, ML + 4, titleBarY + 4, { width: 20, align: 'center' });
        doc.fillColor(C.white).font(F).fontSize(8);
        doc.text(imgName, ML + 28, titleBarY + 4, { width: CW - 36, align: 'right', features: ['arab'] });
        doc.y = titleBarY + 18;

        /* ── image frame ─── */
        const frameY   = doc.y;
        const maxImgH  = 240;
        const imgPad   = 6;
        const innerW   = CW - imgPad * 2;

        // outer frame
        doc.rect(ML, frameY, CW, maxImgH + imgPad * 2)
          .fillAndStroke(C.lightBlue, C.border);

        if (localPath) {
          try {
            doc.image(localPath, ML + imgPad, frameY + imgPad, {
              fit: [innerW, maxImgH],
              align: 'center',
              valign: 'center',
            });
          } catch {
            doc.font(F).fontSize(9).fillColor(C.soft);
            doc.text('تعذر تحميل الصورة', ML, frameY + maxImgH / 2,
              { width: CW, align: 'center', features: ['arab'] });
          }
        } else {
          // no local file — show placeholder
          doc.rect(ML + imgPad, frameY + imgPad, innerW, maxImgH).fill('#e8eff8');
          doc.font(F).fontSize(9).fillColor(C.soft);
          doc.text('الصورة غير متوفرة محلياً', ML, frameY + maxImgH / 2 - 10,
            { width: CW, align: 'center', features: ['arab'] });
          if (imgUrl) {
            doc.fillColor(C.accent).fontSize(7);
            doc.text(imgUrl, ML + 10, frameY + maxImgH / 2 + 8,
              { width: CW - 20, align: 'center', link: imgUrl, underline: true });
          }
        }
        doc.y = frameY + maxImgH + imgPad * 2;

        /* ── caption bar ─── */
        if (imgCmt) {
          const capY = doc.y;
          const capH = 16;
          doc.rect(ML, capY, CW, capH).fill(C.paleBlue).stroke(C.border);
          doc.font(F).fontSize(7.5).fillColor(C.soft);
          doc.text(imgCmt, ML + 6, capY + 3, { width: CW - 12, align: 'right', features: ['arab'] });
          doc.y = capY + capH;
        }

        doc.moveDown(0.6);
        doc.fillColor(C.text);
      });
    }

    /* ══════════════════════════════════════════════════════════════════════════
       FOOTER — on every page
       ══════════════════════════════════════════════════════════════════════════ */
    const pages = doc.bufferedPageRange().count;
    for (let i = 0; i < pages; i++) {
      doc.switchToPage(i);
      const fy = doc.page.height - 26;
      // background
      doc.rect(0, fy, PW, 26).fill(C.navy);
      // gold line
      doc.rect(0, fy, PW, 1.5).fill(C.gold);
      // text
      doc.font(F).fontSize(7).fillColor('#8aafc8');
      doc.text(
        `DELTA PLUS   |   تقرير العمل الرسمي   |   صفحة  ${i + 1}  /  ${pages}`,
        ML, fy + 7, { width: CW, align: 'center', features: ['arab'] },
      );
    }

    doc.end();
  });
