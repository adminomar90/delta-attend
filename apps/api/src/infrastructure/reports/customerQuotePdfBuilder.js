import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDoc } from './pdfTemplate.js';
import { loadQuoteImage } from '../../application/services/customerQuoteImages.js';
import { companyContact } from '../../../../../shared/companyContact.mjs';

const C = { navy: '#13457f', dark: '#1d3264', lime: '#d7e024', soft: '#f7f9fc', border: '#c4d2e2', text: '#1e272e' };
const money = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const date = (v) => new Date(v).toLocaleDateString('en-GB', { timeZone: 'Asia/Baghdad' });
const units = { PIECE: 'قطعة', METER: 'متر', BOX: 'علبة', ROLL: 'لفة', SET: 'طقم', KG: 'كغم', UNIT: 'وحدة' };
const profiles = [
  { name: 'comfortable', font: 9.5, noteFont: 9, titleFont: 11, row: 52, image: 40, pad: 7, meta: 54, section: 26, tableHeader: 26, summaryRow: 19, grand: 36, footer: 88, footerFont: 8 },
  { name: 'compact', font: 9, noteFont: 8.5, titleFont: 10, row: 39, image: 29, pad: 5, meta: 45, section: 21, tableHeader: 23, summaryRow: 16, grand: 32, footer: 88, footerFont: 8 },
  { name: 'dense', font: 8.5, noteFont: 8, titleFont: 9.5, row: 31, image: 25, pad: 3, meta: 40, section: 19, tableHeader: 21, summaryRow: 14, grand: 28, footer: 88, footerFont: 8 },
];

export const buildCustomerQuotePdf = async (quote, { uploadRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../uploads') } = {}) => {
  const images = new Map();
  for (const line of quote.items) if (line.imageUrl && !images.has(line.imageUrl)) images.set(line.imageUrl, await loadQuoteImage(line.imageUrl, uploadRootDir));
  const { doc, F, FB, PW } = createDoc({ title: `${quote.quoteNo} - عرض أسعار`, englishDigits: true });
  const ML = 24, CW = PW - ML * 2;
  const artwork = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../apps/web/public/brand');
  const headerImage = path.join(artwork, 'quote-template-header.png'), watermark = path.join(artwork, 'quote-template-watermark.png'), qrPanel = path.join(artwork, 'quote-template-qr-panel.png');
  const brandHeight = PW * 478 / 3000, continuationY = brandHeight + 42;
  const widths = [.17, .16, .09, .09, .31, .13, .05].map((w) => w * CW);
  const headers = ['الإجمالي', 'سعر البيع', 'الكمية', 'الوحدة', 'المنتج', 'الصورة', '#'];
  const summaryRows = [
    ['مجموع المنتجات', `${money(quote.productsTotal)} ${quote.currency}`],
    ['أجور التركيب', `${money(quote.installationFee)} ${quote.currency}`],
    ['أجور البرمجة', `${money(quote.programmingFee)} ${quote.currency}`],
    ...(Number(quote.discount || 0) > 0 ? [
      ['الإجمالي قبل الخصم', `${money(Number(quote.productsTotal) + Number(quote.installationFee || 0) + Number(quote.programmingFee || 0))} ${quote.currency}`],
      ['الخصم', `-${money(quote.discount)} ${quote.currency}`],
    ] : []),
  ];
  const sections = [['ملاحظات العرض', quote.notes], ['الشروط والأحكام', quote.terms]].filter(([, text]) => text?.trim());
  const arabic = (text) => /[\u0621-\u064a]/.test(text);

  // Measure all text using the real font. Long words wrap without clipping.
  const measure = (value, width, size, bold = false) => {
    doc.font(bold ? FB : F).fontSize(size);
    const lineHeight = doc.currentLineHeight(true);
    const text = String(value ?? '').replace(/([\u0621-\u064a])([A-Za-z0-9])/g, '$1 $2').replace(/([A-Za-z0-9])([\u0621-\u064a])/g, '$1 $2');
    const lines = [];
    for (const paragraph of text.split('\n')) {
      let line = '', used = 0;
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const chunks = []; let chunk = '';
        for (const char of word) { if (chunk && doc.widthOfString(chunk + char) > width) { chunks.push(chunk); chunk = char; } else chunk += char; }
        if (chunk) chunks.push(chunk);
        for (const part of chunks) {
          const length = doc.widthOfString(part), space = line ? doc.widthOfString(' ') : 0;
          if (line && used + space + length > width) { lines.push(line); line = ''; used = 0; }
          used += (line ? doc.widthOfString(' ') : 0) + length; line = line ? `${line} ${part}` : part;
        }
      }
      lines.push(line);
    }
    return { lines, lineHeight, height: lines.length * lineHeight, size, bold };
  };
  const paintLine = (text, x, y, width, size, { bold = false, align = 'right', color = C.text } = {}) => {
    doc.font(bold ? FB : F).fontSize(size).fillColor(color);
    if (!arabic(text) || !/[A-Za-z0-9]/.test(text)) { doc.text(text, x, y, { width, align, lineBreak: false, features: arabic(text) ? ['arab'] : [] }); return; }
    const groups = [];
    for (const word of text.split(/\s+/)) { const rtl = arabic(word); if (groups.at(-1)?.rtl === rtl) groups.at(-1).text += ` ${word}`; else groups.push({ rtl, text: word }); }
    let right = x + width;
    for (const group of groups) { const w = doc.widthOfString(group.text); right -= w; doc.text(group.text, right, y, { width: w + 1, lineBreak: false, features: group.rtl ? ['arab'] : [] }); right -= doc.widthOfString(' '); }
  };
  const paintMeasured = (block, x, y, width, options = {}) => block.lines.forEach((line, i) => paintLine(line, x, y + i * block.lineHeight, width, block.size, { bold: block.bold, ...options }));
  const cellsFor = (line, i) => [money(line.total), money(line.unitPrice), money(line.quantity), units[line.unit] || line.unit, line.name, '', String(i + 1)];
  const sectionLayout = (width, p) => sections.map(([title, text]) => ({ title, block: measure(text, width, p.noteFont), heading: p.noteFont + 8 }));
  const makeLayout = (p) => {
    const bottom = doc.page.height - p.footer - 12;
    const title = quote.title && quote.title !== 'عرض أسعار' ? measure(quote.title, CW * .55, p.titleFont, true) : null;
    const headerHeight = brandHeight + Math.max(36, title ? title.height + 27 : 36);
    const customer = measure(quote.customerName || 'عرض أسعار عام', CW * .62 - 20, p.font + .5, true);
    const address = quote.address ? measure(quote.address, CW * .62 - 20, p.noteFont) : null;
    const metaHeight = Math.max(p.meta, customer.height + (address ? address.height + 3 : 0) + 24);
    const firstTableY = headerHeight + 8 + metaHeight + 8 + p.section;
    const rows = quote.items.map((line, index) => {
      const cells = cellsFor(line, index).map((value, i) => measure(value, widths[i] - p.pad * 2, p.font, i === 0));
      return { cells, height: Math.max(p.row, ...cells.map((block, i) => i === 5 ? 0 : block.height + p.pad * 2)) };
    });
    const summaryHeight = 12 + summaryRows.length * p.summaryRow + p.grand + 8;
    const sideSections = sectionLayout(CW * .46 - 20, p);
    const sideHeight = sideSections.reduce((sum, s) => sum + s.heading + s.block.height + 5, 12);
    const fullSections = sectionLayout(CW - 20, p);
    const stackedHeight = summaryHeight + fullSections.reduce((sum, s) => sum + s.heading + s.block.height + s.block.lines.length + 9, 8);
    const side = sections.length > 0 && sideHeight <= 195 && Math.max(sideHeight, summaryHeight) <= stackedHeight;
    const tailHeight = side ? Math.max(sideHeight, summaryHeight) : stackedHeight;
    const end = firstTableY + p.tableHeader + rows.reduce((sum, row) => sum + row.height, 0) + 10 + tailHeight;
    return { p, bottom, title, headerHeight, customer, address, metaHeight, firstTableY, rows, summaryHeight, sideSections, fullSections, side, tailHeight, end };
  };
  const predictPages = (candidate) => {
    const p = candidate.p; let pages = 1, y = candidate.firstTableY + p.tableHeader, hasRows = false;
    candidate.rows.forEach((row, i) => {
      const reserve = i === candidate.rows.length - 1 ? 10 + (candidate.side ? candidate.tailHeight : candidate.summaryHeight) : 0;
      if (hasRows && y + row.height + reserve > candidate.bottom) { pages++; y = continuationY + p.tableHeader; hasRows = false; }
      y += row.height; hasRows = true;
    });
    y += 10;
    const ensure = (height) => { if (y + height > candidate.bottom) { pages++; y = continuationY; } };
    if (candidate.side) { ensure(candidate.tailHeight); return pages; }
    ensure(candidate.summaryHeight); y += candidate.summaryHeight + 8;
    for (const s of candidate.fullSections) {
      ensure(s.heading + s.block.lineHeight + 5); y += s.heading;
      for (const line of s.block.lines) { if (y + s.block.lineHeight + 3 > candidate.bottom) { pages++; y = continuationY + s.heading; } y += s.block.lineHeight + 1; }
      y += 9;
    }
    return pages;
  };
  // Prefer one page, bounded by a readable 8.5pt table font and 25pt photos.
  // Otherwise use the denser profile only when it actually saves a page.
  const candidates = profiles.map(makeLayout);
  const layout = candidates.find((candidate) => candidate.end <= candidate.bottom)
    || (predictPages(candidates[2]) < predictPages(candidates[1]) ? candidates[2] : candidates[1]);
  const p = layout.p;
  const letterhead = (continued = false) => {
    if (fs.existsSync(watermark)) doc.image(watermark, PW * .106, doc.page.height * .466, { width: PW * .788 });
    doc.image(headerImage, 0, 0, { width: PW });
    paintLine(date(quote.createdAt), ML, brandHeight + 4, CW * .42, 8.5, { bold: true, align: 'left', color: C.dark });
    paintLine(`NO. ${quote.quoteNo}`, ML, brandHeight + 19, CW * .44, 8.5, { bold: true, align: 'left', color: C.dark });
    paintLine(continued ? 'تتمة عرض السعر' : 'عرض أسعار', ML + CW * .45, brandHeight + 4, CW * .55, 15, { bold: true, color: C.navy });
    if (!continued && layout.title) paintMeasured(layout.title, ML + CW * .45, brandHeight + 24, CW * .55, { color: C.navy });
  };
  const nextPage = () => {
    doc.addPage();
    letterhead(true); doc.y = continuationY;
  };
  const ensure = (height) => { if (doc.y + height > layout.bottom) nextPage(); };
  const sectionBar = (title, height = p.section) => {
    const y = doc.y; doc.roundedRect(ML, y, CW, height - 4, 3).fill('#f0f4df'); doc.rect(ML + CW - 4, y, 4, height - 4).fill(C.lime);
    paintLine(title, ML + 8, y + 3, CW - 20, p.font + .5, { bold: true, color: C.navy }); doc.y = y + height;
  };
  letterhead(); doc.y = layout.headerHeight + 8;
  const my = doc.y;
  doc.moveTo(ML, my + layout.metaHeight).lineTo(ML + CW, my + layout.metaHeight).strokeColor(C.border).lineWidth(.5).stroke();
  paintLine(quote.customerName ? 'مقدم إلى' : 'عرض عام', ML + CW * .38, my + 7, CW * .62 - 10, 7, { color: '#64748b' });
  paintMeasured(layout.customer, ML + CW * .38, my + 20, CW * .62 - 20, { color: C.navy });
  if (layout.address) paintMeasured(layout.address, ML + CW * .38, my + 23 + layout.customer.height, CW * .62 - 20);
  paintLine('الصلاحية والعملة', ML + 10, my + 7, CW * .3, 7, { color: '#64748b' });
  paintLine(date(quote.validUntil), ML + 10, my + 20, CW * .22, p.font, { bold: true, align: 'left', color: C.navy });
  paintLine(quote.currency, ML + CW * .25, my + 20, CW * .08, 8, { bold: true, color: C.navy });
  doc.y = my + layout.metaHeight + 8; sectionBar('المنتجات والتجهيزات');
  const tableHeader = () => {
    const y = doc.y; doc.rect(ML, y, CW, p.tableHeader).fill(C.navy); let x = ML;
    headers.forEach((text, i) => { paintLine(text, x + p.pad, y + 5, widths[i] - p.pad * 2, p.font - .5, { bold: true, align: 'center', color: '#fff' }); x += widths[i]; }); doc.y = y + p.tableHeader;
  };
  const drawProduct = (index) => {
    const row = layout.rows[index], y = doc.y;
    if (index % 2) { doc.save(); doc.fillOpacity(.72); doc.rect(ML, y, CW, row.height).fill(C.soft); doc.restore(); }
    let x = ML;
    row.cells.forEach((block, i) => {
      if (i === 5) {
        const box = Math.min(p.image, widths[i] - p.pad * 2), ix = x + (widths[i] - box) / 2, iy = y + (row.height - box) / 2;
        doc.roundedRect(ix, iy, box, box, 3).fillAndStroke('#fff', '#dce3ec'); const image = images.get(quote.items[index].imageUrl);
        if (image) doc.image(image, ix + 2, iy + 2, { fit: [box - 4, box - 4], align: 'center', valign: 'center' });
        else paintLine('بلا صورة', ix + 1, iy + box / 2 - 4, box - 2, 6, { align: 'center', color: '#94a3b8' });
      } else paintMeasured(block, x + p.pad, y + (row.height - block.height) / 2, widths[i] - p.pad * 2, { align: i === 4 ? 'right' : 'center' });
      x += widths[i];
    });
    doc.moveTo(ML, y + row.height).lineTo(ML + CW, y + row.height).strokeColor(C.border).lineWidth(.35).stroke(); doc.y = y + row.height;
  };
  // Keep rows intact and reserve the summary beside the last product. Move a
  // couple of rows forward when a lone row would otherwise start the last page.
  const groups = [[]]; let rowY = doc.y + p.tableHeader;
  layout.rows.forEach((row, i) => {
    const reserve = i === layout.rows.length - 1 ? 10 + (layout.side ? layout.tailHeight : layout.summaryHeight) : 0;
    if (groups.at(-1).length && rowY + row.height + reserve > layout.bottom) { groups.push([]); rowY = continuationY + p.tableHeader; }
    groups.at(-1).push(i); rowY += row.height;
  });
  if (groups.length > 1 && groups.at(-1).length < 3 && groups.at(-2).length >= 4) {
    const previous = groups.at(-2), moveCount = 3 - groups.at(-1).length, last = [...previous.slice(-moveCount), ...groups.at(-1)];
    const needed = last.reduce((sum, i) => sum + layout.rows[i].height, continuationY + p.tableHeader) + 10 + (layout.side ? layout.tailHeight : layout.summaryHeight);
    if (needed <= layout.bottom) { previous.splice(-moveCount); groups[groups.length - 1] = last; }
  }
  // Balance the remaining space across continuation pages when the complete
  // summary/notes block fits together. This does not add pages or reorder rows.
  if (groups.length > 1 && (layout.side || !sections.length)) {
    const used = (index) => (index ? continuationY : layout.firstTableY) + p.tableHeader
      + groups[index].reduce((sum, i) => sum + layout.rows[i].height, 0)
      + (index === groups.length - 1 ? 10 + (layout.side ? layout.tailHeight : layout.summaryHeight) : 0);
    for (let pass = 0; pass < groups.length * layout.rows.length; pass++) {
      let moved = false;
      for (let i = 0; i < groups.length - 1; i++) {
        const last = groups[i].at(-1), height = layout.rows[last]?.height || 0;
        if (groups[i].length > 3 && used(i) - used(i + 1) > height * 2 + 8 && used(i + 1) + height <= layout.bottom) {
          groups[i + 1].unshift(groups[i].pop()); moved = true;
        }
      }
      if (!moved) break;
    }
  }
  groups.forEach((group, index) => { if (index) nextPage(); tableHeader(); group.forEach(drawProduct); }); doc.y += 10;
  const drawSummary = (x, y, width) => {
    doc.save(); doc.fillOpacity(.78); doc.rect(x, y, width, layout.summaryHeight).fill(C.soft); doc.restore();
    doc.moveTo(x, y).lineTo(x + width, y).strokeColor(C.navy).lineWidth(.6).stroke(); let sy = y + 7;
    summaryRows.forEach(([label, value]) => {
      paintLine(label, x + width * .51, sy, width * .45 - 6, p.font - .5, { bold: true, color: label === 'الخصم' ? '#637516' : C.navy });
      paintLine(value, x + 8, sy, width * .5 - 10, p.font - .5, { align: 'left', color: label === 'الخصم' ? '#637516' : C.text }); sy += p.summaryRow;
    });
    const gy = y + layout.summaryHeight - p.grand - 5; doc.roundedRect(x + 5, gy, width - 10, p.grand, 4).fill(C.navy);
    paintLine(Number(quote.discount || 0) > 0 ? 'الإجمالي بعد الخصم' : 'الإجمالي الكلي', x + width * .51, gy + (p.grand - 14) / 2, width * .45 - 8, p.font, { bold: true, color: '#fff' });
    paintLine(`${money(quote.total)} ${quote.currency}`, x + 12, gy + (p.grand - 14) / 2, width * .5 - 13, p.font + 1, { bold: true, align: 'left', color: '#fff' });
  };
  if (layout.side) {
    ensure(layout.tailHeight); const y = doc.y, leftWidth = CW * .46;
    let ny = y + 6;
    layout.sideSections.forEach((s) => { paintLine(s.title, ML + 10, ny, leftWidth - 20, p.noteFont + .5, { bold: true, color: C.navy }); ny += s.heading; paintMeasured(s.block, ML + 10, ny, leftWidth - 20); ny += s.block.height + 5; });
    drawSummary(ML + CW * .49, y, CW * .51); doc.y = y + layout.tailHeight;
  } else {
    ensure(layout.summaryHeight); drawSummary(ML + CW * .49, doc.y, CW * .51); doc.y += layout.summaryHeight + 8;
    for (const s of layout.fullSections) {
      ensure(s.heading + s.block.lineHeight + 5); sectionBar(s.title, s.heading);
      for (const line of s.block.lines) {
        if (doc.y + s.block.lineHeight + 3 > layout.bottom) { nextPage(); sectionBar(`${s.title} (تابع)`, s.heading); }
        paintLine(line, ML + 10, doc.y, CW - 20, p.noteFont); doc.y += s.block.lineHeight + 1;
      }
      doc.y += 9;
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = []; doc.on('data', (chunk) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const pages = doc.bufferedPageRange().count;
    for (let i = 0; i < pages; i++) {
      doc.switchToPage(i); const bottomMargin = doc.page.margins.bottom; doc.page.margins.bottom = 0; doc.save();
      const footerHeight = PW * 422 / 3000, fy = doc.page.height - footerHeight;
      doc.rect(0, fy, PW, footerHeight).fill(doc.linearGradient(0, fy, PW, fy).stop(0, '#13457f').stop(.7733, '#1d2655').stop(1, '#1d1c4e'));
      doc.image(qrPanel, PW * 2320 / 3000, fy, { width: PW * 680 / 3000 });
      const leftWidth = PW * .36, socialX = PW * .44, socialWidth = PW * .30;
      doc.moveTo(PW * .42, fy + 10).lineTo(PW * .42, doc.page.height - 14).strokeColor('#9bb1cb').lineWidth(.6).stroke();
      const contact = (value, x, y, width, link, size = p.footerFont) => doc.font(F).fontSize(size).fillColor('#fff').text(value, x, y, { width, align: 'left', link, lineBreak: false, features: [] });
      contact(companyContact.email, ML, fy + 12, leftWidth, `mailto:${companyContact.email}`);
      contact(companyContact.website, ML, fy + 29, leftWidth, companyContact.websiteUrl);
      companyContact.phones.forEach((phone, n) => contact(phone, ML + n * leftWidth * .51, fy + 47, leftWidth * .49, `tel:${phone}`, 8.5));
      paintLine('التواصل الاجتماعي', socialX, fy + 11, socialWidth, 8.5, { color: '#fff' });
      contact(`Facebook: ${companyContact.socialHandle}`, socialX, fy + 30, socialWidth, companyContact.facebookUrl, 7.5);
      contact(`Instagram: ${companyContact.socialHandle}`, socialX, fy + 47, socialWidth, companyContact.instagramUrl, 7.5);
      paintLine(`${i + 1} / ${pages}`, ML, doc.page.height - 17, leftWidth, 6.5, { align: 'left', color: '#fff' });
      doc.restore(); doc.page.margins.bottom = bottomMargin;
    }
    doc.end();
  });
};
