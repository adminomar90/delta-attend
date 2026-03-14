/**
 * Unified PDF Template — Delta Plus
 *
 * Shared design tokens, helpers, and drawing primitives used by every
 * PDF report in the system.  Individual builders import only what they
 * need and compose reports by calling these functions in order.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════════════════════════ */

export const COLORS = {
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

const FONT_REGULAR = path.resolve(__dirname, 'fonts', 'arial.ttf');
const FONT_BOLD    = path.resolve(__dirname, 'fonts', 'arialbd.ttf');

/* ═══════════════════════════════════════════════════════════════════════════
   TEXT HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('ar-IQ') : '-');

export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('ar-IQ') : '-');

export const safe = (v) => {
  const s = String(v ?? '').trim();
  return s || '-';
};

export const fmtPoints = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
};

export const resolveLocalImagePath = (publicUrl, root = '') => {
  if (!root) return '';
  const raw = String(publicUrl || '').trim();
  if (!raw.startsWith('/uploads/')) return '';
  const rel = raw.split('?')[0].split('#')[0].replace('/uploads/', '');
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(path.resolve(root))) return '';
  return fs.existsSync(abs) ? abs : '';
};

export const resolveImageUrl = (publicUrl, base = '') => {
  const url = String(publicUrl || '').trim();
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
};

/* ═══════════════════════════════════════════════════════════════════════════
   DOCUMENT CREATION
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Creates a pre-configured PDFDocument and returns a context object (`ctx`)
 * that every other draw helper expects.
 */
export const createDoc = ({ title = 'Delta Plus Report', author = 'Delta Plus' } = {}) => {
  const doc = new PDFDocument({
    margin: 36,
    size: 'A4',
    bufferPages: true,
    info: { Title: title, Author: author, Creator: 'Delta Plus System' },
  });

  const hasFont = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);
  if (hasFont) {
    doc.registerFont('Ar', FONT_REGULAR);
    doc.registerFont('ArB', FONT_BOLD);
  }

  const F  = hasFont ? 'Ar' : 'Helvetica';
  const FB = hasFont ? 'ArB' : 'Helvetica-Bold';

  const PW     = doc.page.width;
  const ML     = doc.page.margins.left;
  const CW     = PW - ML - doc.page.margins.right;
  const BOTTOM = doc.page.height - doc.page.margins.bottom - 30;

  return { doc, F, FB, PW, ML, CW, BOTTOM };
};

/* ═══════════════════════════════════════════════════════════════════════════
   DRAWING PRIMITIVES
   ═══════════════════════════════════════════════════════════════════════════ */

/** Check remaining space and add a page if needed. */
export const needPage = (ctx, h) => {
  if (ctx.doc.y + h > ctx.BOTTOM) ctx.doc.addPage();
};

/** Thin horizontal line. */
export const drawLine = (ctx, y, color = COLORS.border) => {
  ctx.doc.moveTo(ctx.ML, y).lineTo(ctx.ML + ctx.CW, y)
    .strokeColor(color).lineWidth(0.5).stroke();
};

/* ─── Header ──────────────────────────────────────────────────────────────── */

/**
 * Full-width navy banner with company name, report title, date, and ID.
 *
 * @param {object} ctx
 * @param {object} opts
 * @param {string} opts.title     — report title in Arabic
 * @param {string} [opts.subtitle] — optional subtitle
 * @param {string} [opts.reportId] — report/request number
 * @param {Date}   [opts.date]     — generation date
 */
export const drawHeader = (ctx, { title, subtitle, reportId = '', date } = {}) => {
  const { doc, F, FB, PW, ML, CW } = ctx;

  // Navy banner
  doc.rect(0, 0, PW, 80).fill(COLORS.navy);
  // Gold accent line
  doc.rect(0, 78, PW, 3).fill(COLORS.gold);

  // Company name
  doc.font(FB).fontSize(22).fillColor(COLORS.white);
  doc.text('DELTA PLUS', ML, 14, { width: CW, align: 'center' });

  // Title
  doc.font(F).fontSize(12).fillColor('#a0c4e8');
  doc.text(title || 'تقرير', ML, 42, { width: CW, align: 'center', features: ['arab'] });

  // Bottom-left: date
  const dateStr = fmtDateTime(date || new Date());
  doc.font(F).fontSize(7).fillColor('#8aafc8');
  doc.text(dateStr, ML, 62, { width: CW * 0.5, align: 'left' });

  // Bottom-right: ID
  if (reportId) {
    doc.text(reportId, ML + CW * 0.5, 62, { width: CW * 0.5, align: 'right' });
  }

  doc.y = 90;
  doc.fillColor(COLORS.text);

  // Subtitle (if provided)
  if (subtitle) {
    doc.font(F).fontSize(8).fillColor(COLORS.soft);
    doc.text(subtitle, ML, doc.y, { width: CW, align: 'center', features: ['arab'] });
    doc.y += 14;
  }
};

/* ─── Status Badge ────────────────────────────────────────────────────────── */

export const drawStatusBadge = (ctx, { label, color = COLORS.warning } = {}) => {
  const { doc, FB, ML, CW } = ctx;
  const badgeW = 130;
  const badgeX = ML + CW - badgeW;
  doc.roundedRect(badgeX, doc.y, badgeW, 20, 3).fill(color);
  doc.font(FB).fontSize(9).fillColor(COLORS.white);
  doc.text(label || '-', badgeX, doc.y + 5, { width: badgeW, align: 'center', features: ['arab'] });
  doc.y += 28;
  doc.fillColor(COLORS.text);
};

/* ─── Section Title ───────────────────────────────────────────────────────── */

export const drawSectionTitle = (ctx, text) => {
  needPage(ctx, 40);
  const { doc, FB, ML, CW } = ctx;
  const y = doc.y;
  // Right accent bar
  doc.rect(ML + CW - 4, y, 4, 20).fill(COLORS.accent);
  // Navy background
  doc.rect(ML, y, CW - 5, 20).fill(COLORS.navy);
  doc.font(FB).fontSize(10).fillColor(COLORS.white);
  doc.text(text, ML + 6, y + 4, { width: CW - 16, align: 'right', features: ['arab'] });
  doc.y = y + 24;
  doc.fillColor(COLORS.text);
};

/* ─── Table Row (label : value) ───────────────────────────────────────────── */

export const drawTableRow = (ctx, label, value, idx) => {
  const H = 20;
  const { doc, F, FB, ML, CW } = ctx;
  const y = doc.y;
  const bg = idx % 2 === 0 ? COLORS.rowEven : COLORS.rowOdd;
  const labelW = CW * 0.35;
  const valW   = CW * 0.63;

  doc.rect(ML, y, CW, H).fill(bg);
  doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor(COLORS.border).lineWidth(0.3).stroke();
  doc.moveTo(ML, y + H).lineTo(ML + CW, y + H).strokeColor(COLORS.border).lineWidth(0.3).stroke();

  const sepX = ML + valW + 4;
  doc.moveTo(sepX, y).lineTo(sepX, y + H).strokeColor(COLORS.border).lineWidth(0.3).stroke();

  doc.font(FB).fontSize(8.5).fillColor(COLORS.navy);
  doc.text(String(label), sepX + 4, y + 5, { width: labelW - 8, align: 'right', lineBreak: false, features: ['arab'] });
  doc.font(F).fontSize(8.5).fillColor(COLORS.text);
  doc.text(String(value), ML + 4, y + 5, { width: valW - 4, align: 'left', lineBreak: false, features: ['arab'] });

  doc.y = y + H;
  doc.fillColor(COLORS.text);
};

/* ─── KPI Cards ───────────────────────────────────────────────────────────── */

/**
 * @param {object} ctx
 * @param {Array<{label:string, value:string}>} cards — up to 4 cards
 */
export const drawKpiCards = (ctx, cards = []) => {
  if (!cards.length) return;
  needPage(ctx, 70);

  const { doc, F, FB, ML, CW } = ctx;
  const count  = Math.min(cards.length, 4);
  const gap    = 8;
  const cardW  = (CW - gap * (count - 1)) / count;
  const cardH  = 50;
  const startY = doc.y + 2;

  cards.slice(0, 4).forEach((card, i) => {
    const x = ML + i * (cardW + gap);
    // shadow
    doc.rect(x + 1, startY + 1, cardW, cardH).fill('#dde6f0');
    // body
    doc.rect(x, startY, cardW, cardH).fillAndStroke(COLORS.white, COLORS.border);
    // top accent
    doc.rect(x, startY, cardW, 3).fill(COLORS.accent);
    // value
    doc.font(FB).fontSize(14).fillColor(COLORS.navy);
    doc.text(String(card.value), x, startY + 10, { width: cardW, align: 'center', features: ['arab'] });
    // label
    doc.font(F).fontSize(7.5).fillColor(COLORS.soft);
    doc.text(card.label, x, startY + 32, { width: cardW, align: 'center', features: ['arab'] });
  });

  doc.y = startY + cardH + 10;
  doc.fillColor(COLORS.text);
};

/* ─── Progress Bar ────────────────────────────────────────────────────────── */

export const drawProgressBar = (ctx, percent = 0) => {
  needPage(ctx, 20);
  const { doc, FB, ML, CW } = ctx;
  const barY = doc.y;
  const barH = 10;
  const pct  = Math.min(100, Math.max(0, Number(percent || 0)));

  doc.rect(ML, barY, CW, barH).fill('#e0e8f0');
  if (pct > 0) {
    const c = pct >= 80 ? COLORS.success : pct >= 50 ? COLORS.accent : COLORS.warning;
    doc.rect(ML, barY, CW * pct / 100, barH).fill(c);
  }
  doc.font(FB).fontSize(6.5).fillColor(COLORS.navy);
  doc.text(`${pct}%`, ML, barY + 1.5, { width: CW, align: 'center' });
  doc.y = barY + barH + 10;
};

/* ─── Text Block (labelled box) ───────────────────────────────────────────── */

export const drawTextBlock = (ctx, label, value) => {
  if (!value || value === '-') return;
  needPage(ctx, 50);

  const { doc, F, FB, ML, CW } = ctx;
  doc.moveDown(0.25);

  // Label
  doc.font(FB).fontSize(9).fillColor(COLORS.accent);
  doc.text(`■  ${label}`, ML, doc.y, { width: CW, align: 'right', features: ['arab'] });
  doc.moveDown(0.1);

  // Box
  const textY = doc.y;
  doc.font(F).fontSize(8.5).fillColor(COLORS.text);
  const textH = doc.heightOfString(String(value), { width: CW - 16, align: 'right' });
  const boxH  = Math.max(textH + 10, 18);
  doc.rect(ML, textY - 2, CW, boxH + 4).lineWidth(0.4)
    .strokeColor(COLORS.border).fillAndStroke(COLORS.paleBlue, COLORS.border);
  doc.fillColor(COLORS.text).font(F).fontSize(8.5);
  doc.text(String(value), ML + 8, textY + 3, { width: CW - 16, align: 'right', features: ['arab'] });
  doc.y = textY + boxH + 6;
};

/* ─── Data Table (multi-column) ───────────────────────────────────────────── */

/**
 * Professional multi-column table.
 *
 * @param {object} ctx
 * @param {object} opts
 * @param {string[]}   opts.headers   — column header labels
 * @param {string[][]} opts.rows      — rows of cell values
 * @param {number[]}   [opts.colWidths] — relative widths (sum to 1.0)
 */
export const drawDataTable = (ctx, { headers = [], rows = [], colWidths } = {}) => {
  if (!headers.length) return;
  needPage(ctx, 40);

  const { doc, F, FB, ML, CW } = ctx;
  const colCount = headers.length;
  const widths = colWidths || headers.map(() => 1 / colCount);
  const ROW_H = 20;

  // ── Header row ──
  const hy = doc.y;
  doc.rect(ML, hy, CW, ROW_H).fill(COLORS.navy);
  let xOffset = ML;
  headers.forEach((header, i) => {
    const w = CW * widths[i];
    doc.font(FB).fontSize(7.5).fillColor(COLORS.white);
    doc.text(header, xOffset + 3, hy + 5, { width: w - 6, align: 'center', lineBreak: false, features: ['arab'] });
    xOffset += w;
  });
  doc.y = hy + ROW_H;

  // ── Data rows ──
  rows.forEach((row, rowIdx) => {
    needPage(ctx, ROW_H + 2);
    const ry = doc.y;
    const bg = rowIdx % 2 === 0 ? COLORS.rowEven : COLORS.rowOdd;
    doc.rect(ML, ry, CW, ROW_H).fill(bg);
    // borders
    doc.moveTo(ML, ry + ROW_H).lineTo(ML + CW, ry + ROW_H).strokeColor(COLORS.border).lineWidth(0.3).stroke();

    let rx = ML;
    row.forEach((cell, i) => {
      const w = CW * (widths[i] || widths[0]);
      doc.font(F).fontSize(7.5).fillColor(COLORS.text);
      doc.text(String(cell ?? '-'), rx + 3, ry + 5, { width: w - 6, align: 'center', lineBreak: false, features: ['arab'] });
      rx += w;
    });
    doc.y = ry + ROW_H;
  });

  // Bottom border
  doc.moveTo(ML, doc.y).lineTo(ML + CW, doc.y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
  doc.y += 8;
  doc.fillColor(COLORS.text);
};

/* ─── Timeline Entry (workflow) ───────────────────────────────────────────── */

/**
 * Renders one workflow/approval step as a styled card.
 */
export const drawTimelineEntry = (ctx, { index, action, actor, role, date, beforeStatus, afterStatus, notes } = {}) => {
  needPage(ctx, 60);
  const { doc, F, FB, ML, CW } = ctx;
  const y = doc.y;
  const cardH = 48 + (notes ? 14 : 0);

  // Left accent bar
  doc.rect(ML + CW - 3, y, 3, cardH).fill(COLORS.accent);
  // Card background
  doc.rect(ML, y, CW - 4, cardH).fillAndStroke(COLORS.paleBlue, COLORS.border);

  // Index circle
  const circleX = ML + CW - 20;
  const circleY = y + 12;
  doc.circle(circleX, circleY, 9).fill(COLORS.navy);
  doc.font(FB).fontSize(8).fillColor(COLORS.white);
  doc.text(String(index ?? ''), circleX - 9, circleY - 4, { width: 18, align: 'center' });

  // Action + Actor
  doc.font(FB).fontSize(8.5).fillColor(COLORS.navy);
  doc.text(safe(action), ML + 8, y + 6, { width: CW - 50, align: 'right', features: ['arab'] });
  doc.font(F).fontSize(7.5).fillColor(COLORS.soft);
  doc.text(`${safe(actor)}${role ? ` (${role})` : ''}   |   ${fmtDateTime(date)}`, ML + 8, y + 20, { width: CW - 50, align: 'right', features: ['arab'] });

  // Status transition
  doc.font(F).fontSize(7.5).fillColor(COLORS.text);
  doc.text(`${safe(beforeStatus)}  ←  ${safe(afterStatus)}`, ML + 8, y + 33, { width: CW - 50, align: 'right', features: ['arab'] });

  // Notes
  if (notes) {
    doc.font(F).fontSize(7).fillColor(COLORS.soft);
    doc.text(`ملاحظات: ${safe(notes)}`, ML + 8, y + 45, { width: CW - 50, align: 'right', features: ['arab'] });
  }

  doc.y = y + cardH + 6;
  doc.fillColor(COLORS.text);
};

/* ─── Image Frame ─────────────────────────────────────────────────────────── */

export const drawImageFrame = (ctx, { localPath, fallbackUrl, name, comment, index = 0 } = {}) => {
  needPage(ctx, 290);
  const { doc, F, FB, ML, CW } = ctx;

  // Title bar
  const titleBarY = doc.y;
  doc.rect(ML, titleBarY, CW, 18).fill(COLORS.navy);
  doc.font(FB).fontSize(8).fillColor(COLORS.gold);
  doc.text(`${index + 1}`, ML + 4, titleBarY + 4, { width: 20, align: 'center' });
  doc.fillColor(COLORS.white).font(F).fontSize(8);
  doc.text(safe(name || `صورة ${index + 1}`), ML + 28, titleBarY + 4, { width: CW - 36, align: 'right', features: ['arab'] });
  doc.y = titleBarY + 18;

  // Image frame
  const frameY  = doc.y;
  const maxImgH = 240;
  const imgPad  = 6;
  const innerW  = CW - imgPad * 2;

  doc.rect(ML, frameY, CW, maxImgH + imgPad * 2).fillAndStroke(COLORS.lightBlue, COLORS.border);

  if (localPath && fs.existsSync(localPath)) {
    try {
      doc.image(localPath, ML + imgPad, frameY + imgPad, {
        fit: [innerW, maxImgH], align: 'center', valign: 'center',
      });
    } catch {
      doc.font(F).fontSize(9).fillColor(COLORS.soft);
      doc.text('تعذر تحميل الصورة', ML, frameY + maxImgH / 2, { width: CW, align: 'center', features: ['arab'] });
    }
  } else {
    doc.rect(ML + imgPad, frameY + imgPad, innerW, maxImgH).fill('#e8eff8');
    doc.font(F).fontSize(9).fillColor(COLORS.soft);
    doc.text('الصورة غير متوفرة محلياً', ML, frameY + maxImgH / 2 - 10, { width: CW, align: 'center', features: ['arab'] });
    if (fallbackUrl) {
      doc.fillColor(COLORS.accent).fontSize(7);
      doc.text(fallbackUrl, ML + 10, frameY + maxImgH / 2 + 8, { width: CW - 20, align: 'center', link: fallbackUrl, underline: true });
    }
  }
  doc.y = frameY + maxImgH + imgPad * 2;

  // Caption
  if (comment) {
    const capY = doc.y;
    const capH = 16;
    doc.rect(ML, capY, CW, capH).fill(COLORS.paleBlue).stroke(COLORS.border);
    doc.font(F).fontSize(7.5).fillColor(COLORS.soft);
    doc.text(comment, ML + 6, capY + 3, { width: CW - 12, align: 'right', features: ['arab'] });
    doc.y = capY + capH;
  }

  doc.moveDown(0.6);
  doc.fillColor(COLORS.text);
};

/* ─── Bulleted List ───────────────────────────────────────────────────────── */

export const drawBulletList = (ctx, items = [], emptyText = 'لا توجد بيانات') => {
  const { doc, F, ML, CW } = ctx;
  if (!items.length) {
    doc.font(F).fontSize(8.5).fillColor(COLORS.soft);
    doc.text(emptyText, ML, doc.y, { width: CW, align: 'right', features: ['arab'] });
    doc.moveDown(0.3);
    return;
  }
  items.forEach((item, i) => {
    needPage(ctx, 16);
    doc.font(F).fontSize(8.5).fillColor(COLORS.text);
    doc.text(`${i + 1}.  ${safe(item)}`, ML + 4, doc.y, { width: CW - 8, align: 'right', features: ['arab'] });
    doc.moveDown(0.15);
  });
  doc.moveDown(0.3);
};

/* ═══════════════════════════════════════════════════════════════════════════
   FOOTER — drawn on every page at the end
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Adds a navy footer bar with gold accent to every page.
 *
 * **Must be called after all content is rendered and before `doc.end()`.**
 *
 * @param {string} label — e.g. "تقرير العمل الرسمي"
 */
export const drawFooters = (ctx, { label = 'تقرير رسمي' } = {}) => {
  const { doc, F, ML, CW, PW } = ctx;
  const pages = doc.bufferedPageRange().count;
  for (let i = 0; i < pages; i++) {
    doc.switchToPage(i);
    const fy = doc.page.height - 26;
    doc.rect(0, fy, PW, 26).fill(COLORS.navy);
    doc.rect(0, fy, PW, 1.5).fill(COLORS.gold);
    doc.font(F).fontSize(7).fillColor('#8aafc8');
    doc.text(
      `DELTA PLUS   |   ${label}   |   صفحة  ${i + 1}  /  ${pages}`,
      ML, fy + 7, { width: CW, align: 'center', features: ['arab'] },
    );
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   FINALIZE — collect buffer and end
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Draws footers, ends the document, and returns the complete PDF buffer.
 */
export const finalize = (ctx, { footerLabel = 'تقرير رسمي' } = {}) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    ctx.doc.on('data', (c) => chunks.push(c));
    ctx.doc.on('end', () => resolve(Buffer.concat(chunks)));
    ctx.doc.on('error', reject);

    drawFooters(ctx, { label: footerLabel });
    ctx.doc.end();
  });
