import { companyContact } from '../../../shared/companyContact.mjs';
export { badgeTemplateForDepartment, badgeTemplates } from '../../../shared/employeeBadgeTemplates.mjs';

export const badgeWidth = 638;
export const badgeHeight = 1011;
export const badgeHeader = '/brand/employee-badge-header.png';

const ink = '#0d1a36';
const muted = '#404c60';
const lime = '#b5d800';
const font = (size, rtl) => `800 ${size}px ${rtl ? 'Cairo, Tahoma, sans-serif' : 'Arial, sans-serif'}`;

export function loadBadgeImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function formatBadgeDate(date) {
  return date ? date.split('-').reverse().join(' / ') : '—';
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/u)) {
    const joined = line ? `${line} ${word}` : word;
    if (ctx.measureText(joined).width <= maxWidth) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const char of word) {
      const next = line + char;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = next;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function fitBadgeText(ctx, text, width, height, size, rtl, maxLines = 1) {
  let lines;
  const min = 12;
  for (; size >= min; size -= 1) {
    ctx.font = font(size, rtl);
    lines = wrapText(ctx, text, width);
    if (lines.length <= maxLines && size * 1.12 * lines.length <= height) break;
  }
  if (size < min) {
    size = min;
    lines = lines.slice(0, maxLines);
    const last = Array.from(lines.at(-1) || '');
    while (last.length && ctx.measureText(last.join('') + '…').width > width) last.pop();
    lines[lines.length - 1] = last.join('') + '…';
  }
  return { lines, lineHeight: size * 1.12 };
}

function text(ctx, value, x, y, w, h, options = {}) {
  const { size = 30, color = ink, rtl = true, maxLines = 1 } = options;
  ctx.fillStyle = color;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const { lines, lineHeight } = fitBadgeText(ctx, value, w, h, size, rtl, maxLines);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + (index - (lines.length - 1) / 2) * lineHeight, w);
  });
}

function rounded(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

function line(ctx, points, color, width = 1, closed = false) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  points.slice(1).forEach((point) => ctx.lineTo(...point));
  if (closed) {
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function blueGradient(ctx, y) {
  const gradient = ctx.createLinearGradient(210, y + 95, 610, y - 75);
  gradient.addColorStop(0, '#101d43');
  gradient.addColorStop(1, '#155ca9');
  return gradient;
}

function background(ctx, header, back) {
  const gradient = ctx.createLinearGradient(0, 270, 620, 930);
  gradient.addColorStop(0, '#f6f7fb');
  gradient.addColorStop(1, '#e6ebf4');
  rounded(ctx, 0, 0, badgeWidth, badgeHeight, 28, gradient);
  ctx.clip();
  ctx.drawImage(header, 0, 0);
  const edge = back ? [[0, 910], [45, 960], [320, 960], [371, 1011]] : [[0, 909], [96, 1011]];
  line(ctx, [...edge, [0, 1011]], blueGradient(ctx, 937), 0, true);
  line(ctx, edge, lime, 9);
  for (let offset = 0; offset < 42; offset += 21) {
    const x = 516 + offset;
    const y = 817 + offset;
    line(ctx, [[x, 1011], [x, 991 + offset / 4], [x + 56, 935 + offset / 4],
      [x + 56, y + 59], [640, y - 9]], '#a1adc1', 1.3);
    rounded(ctx, x + 87, y + 17, 7, 7, 3.5, '#e6ebf4', '#a1adc1');
  }
}

function photoFrame(ctx, photo, crop) {
  const x = 182;
  const y = 347;
  const width = 274;
  const height = 264;
  ctx.save();
  rounded(ctx, x, y, width, height, 28, '#d9e1ec');
  ctx.clip();
  if (photo) {
    const scale = Math.max(width / photo.naturalWidth, height / photo.naturalHeight) * crop.zoom;
    const w = photo.naturalWidth * scale;
    const h = photo.naturalHeight * scale;
    ctx.drawImage(photo, x - ((w - width) * (1 - crop.x / 100)) / 2,
      y - ((h - height) * (1 - crop.y / 100)) / 2, w, h);
  } else {
    rounded(ctx, 270, 377, 98, 98, 49, '#a1afc3');
    rounded(ctx, 220, 488, 198, 171, 84, '#a1afc3');
  }
  ctx.restore();
}

function front(ctx, { employee, nameEn, jobEn, template, photo, crop }) {
  const { title, footer } = template;
  line(ctx, [[54, 299], [104, 299]], '#a0bc27', 4);
  line(ctx, [[534, 299], [584, 299]], '#a0bc27', 4);
  text(ctx, title, 319, 303, 414, 68, { size: 36, maxLines: 2 });
  photoFrame(ctx, photo, crop);
  text(ctx, employee?.fullName || 'اسم الموظف', 319, 661, 536, 82, { size: 47, maxLines: 3 });
  text(ctx, nameEn || 'EMPLOYEE NAME', 319, 720, 510, 42, { size: 26, maxLines: 2, rtl: false, color: muted });
  line(ctx, [[44, 822], [70, 756], [598, 756], [572, 822]], lime, 0, true);
  line(ctx, [[55, 826], [83, 749], [583, 749], [554, 826]], blueGradient(ctx, 748), 0, true);
  text(ctx, employee?.jobTitle || 'المسمى الوظيفي', 319, 788, 466, 64, { size: 42, maxLines: 2, color: '#fff' });
  text(ctx, jobEn || 'JOB TITLE', 319, 844, 484, 32, { size: 22, maxLines: 2, rtl: false, color: muted });
  rounded(ctx, 72, 865, 494, 62, 13, '#e6ebf4', '#8996ac');
  text(ctx, 'رقم الموظف', 432, 896, 220, 44, { size: 27 });
  text(ctx, employee?.employeeCode || '—', 205, 896, 218, 43, { size: 28, rtl: false });
  line(ctx, [[81, 963], [163, 963]], '#a0bc27', 4);
  line(ctx, [[475, 963], [557, 963]], '#a0bc27', 4);
  text(ctx, footer, 319, 964, 290, 39, { size: 21, rtl: false, color: muted });
}

function dateBox(ctx, y, label, value) {
  rounded(ctx, 72, y, 494, 49, 12, '#e6ebf4', '#8996ac');
  text(ctx, label, 429, y + 24.5, 224, 42, { size: 27 });
  text(ctx, formatBadgeDate(value), 210, y + 24.5, 215, 42, { size: 24, rtl: false });
}

function qrSquare(ctx, qr) {
  const x = 219;
  const y = 716;
  const square = 200;
  rounded(ctx, x, y, square, square, 8, '#fff', '#8996ac');
  if (!qr) return text(ctx, 'رمز التحقق', 319, y + square / 2, 160, 50, { size: 21, color: muted });

  // Whole-pixel modules and at least four clear modules around the code.
  const step = Math.floor((square - 4) / (qr.size + 8));
  const inset = Math.floor((square - qr.size * step) / 2);
  ctx.fillStyle = '#101924';
  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (qr.data[row * qr.size + col] === '1') {
        ctx.fillRect(x + inset + col * step, y + inset + row * step, step, step);
      }
    }
  }
}

function back(ctx, { issuedOn, expiresOn, qr }) {
  text(ctx, companyContact.name, 319, 297, 547, 52, { size: 36 });
  text(ctx, 'العراق', 504, 359, 120, 46, { size: 31 });
  text(ctx, 'الموصل', 340, 359, 146, 46, { size: 31 });
  text(ctx, 'حي الحدباء', 150, 359, 174, 46, { size: 31 });
  rounded(ctx, 418, 353, 12, 12, 6, '#9abb00');
  rounded(ctx, 245, 353, 12, 12, 6, '#9abb00');
  line(ctx, [[57, 398], [581, 398]], '#9aa5b7', 2);
  [...companyContact.phones].reverse().forEach((phone, index) => {
    const y = 434 + index * 51;
    text(ctx, '☎', 157, y, 75, 48, { size: 35, color: '#9abb00', rtl: false });
    text(ctx, phone, 348, y, 328, 52, { size: 42, rtl: false });
  });
  line(ctx, [[57, 517], [581, 517]], '#9aa5b7', 2);
  text(ctx, 'عند العثور على هذه البطاقة يرجى', 319, 548, 520, 36, { size: 24 });
  text(ctx, 'التواصل مع الشركة', 319, 580, 510, 38, { size: 30 });
  dateBox(ctx, 607, 'تاريخ الإصدار', issuedOn);
  dateBox(ctx, 660, 'تاريخ الانتهاء', expiresOn);
  qrSquare(ctx, qr);
  text(ctx, 'للتحقق من معلومات الموظف امسح الباركود', 319, 945, 456, 37, { size: 23 });
}

export function drawEmployeeBadge(canvas, face, options) {
  canvas.width = badgeWidth;
  canvas.height = badgeHeight;
  const ctx = canvas.getContext('2d');
  background(ctx, options.header, face === 'back');
  if (face === 'back') back(ctx, options);
  else front(ctx, options);
}

function pngResolutionChunk() {
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  view.setUint32(8, 11811);
  view.setUint32(12, 11811);
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  view.setUint32(17, crc ^ 0xffffffff);
  return chunk;
}

export async function badgePng(canvas) {
  const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('تعذّر تصدير صورة البطاقة.');
  const bytes = new DataView(await png.arrayBuffer());
  const chunks = [png.slice(0, 8)];
  for (let offset = 8; offset < bytes.byteLength;) {
    const end = offset + bytes.getUint32(offset) + 12;
    const type = bytes.getUint32(offset + 4);
    if (type !== 0x70485973) chunks.push(png.slice(offset, end)); // Existing pHYs
    if (type === 0x49484452) chunks.push(pngResolutionChunk()); // After IHDR
    offset = end;
  }
  return new Blob(chunks, { type: 'image/png' });
}
