import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import { AppError } from '../../shared/errors.js';
import { normalizeIpv4, normalizeMacAddress } from './networkDocsService.js';

export const CAMERA_EXCEL_COLUMNS = [
  ['cameraNumber', 'رقم الكاميرا'], ['managementIp', 'عنوان الايبي'], ['switchNumber', 'رقم السويج'],
  ['switchPort', 'رقم المنفذ في السويج'], ['username', 'اسم الدخول'], ['password', 'كلمة المرور'],
];
export const RECORDER_EXCEL_COLUMNS = [
  ['name', 'اسم الجهاز'], ['model', 'موديل الجهاز'], ['portCount', 'عدد المنافذ'],
  ['managementIp', 'عنوان IP'], ['username', 'اسم المستخدم'], ['password', 'كلمة المرور'],
];
export const DEVICE_EXCEL_COLUMNS = [
  ['name', 'اسم الجهاز'], ['model', 'موديل الجهاز'], ['managementIp', 'عنوان IP'], ['username', 'اسم المستخدم'], ['password', 'كلمة المرور'],
  ['vendor', 'الشركة المصنعة'], ['serialNumber', 'الرقم التسلسلي'], ['macAddress', 'عنوان MAC'], ['physicalLocation', 'موقع الجهاز'], ['notes', 'ملاحظات'], ['portCount', 'عدد المنافذ'],
];
export const PORT_EXCEL_COLUMNS = [
  ['patchPanelPort', 'رقم المنفذ في الباج بنل'], ['patchPanelNumber', 'رقم الباج بنل'], ['connectedDeviceType', 'نوع الجهاز'],
  ['switchPort', 'رقم المنفذ في السويج'], ['managementIp', 'عنوان الايبي'], ['username', 'اسم المستخدم'], ['password', 'كلمة المرور'], ['vlanNumber', 'رقم ال vlan'], ['model', 'مديل الجهاز'],
];
export const PBX_EXCEL_COLUMNS = [...DEVICE_EXCEL_COLUMNS, ['extensionNumber', 'رقم التحويلة']];
export const PRINTER_EXCEL_COLUMNS = DEVICE_EXCEL_COLUMNS.map(([field, title]) => [field, field === 'name' ? 'اسم الطابعة' : title]);
export const deviceExcelColumns = (type) => type === 'CAMERA' ? CAMERA_EXCEL_COLUMNS : type === 'NVR' ? RECORDER_EXCEL_COLUMNS : type === 'UPS' ? PORT_EXCEL_COLUMNS : type === 'IP_PBX' ? PBX_EXCEL_COLUMNS : type === 'PRINTER' ? PRINTER_EXCEL_COLUMNS : DEVICE_EXCEL_COLUMNS;
const clean = (value) => String(value ?? '').trim();
const key = (value) => clean(value).normalize('NFKC').toLowerCase();
const heading = (value) => key(value).replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, ' ');
const aliases = new Map(CAMERA_EXCEL_COLUMNS.map(([field, title]) => [heading(title), field]));
for (const [title, field] of [['رقم الكاميرة', 'cameraNumber'], ['عنوان IP', 'managementIp'], ['IP', 'managementIp'], ['رقم السويتش', 'switchNumber'], ['اسم المستخدم', 'username']]) aliases.set(heading(title), field);

export const buildCameraWorkbook = async (rows = [], type = 'CAMERA') => {
  const columns = deviceExcelColumns(type);
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'Delta Plus';
  const sheet = workbook.addWorksheet(type === 'CAMERA' ? 'كاميرات المراقبة' : type === 'NVR' ? 'أجهزة التسجيل' : 'معلومات الأجهزة', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sheet.columns = columns.map(([field, title], index) => ({ header: title, key: field, width: [24, 25, 20, 27, 24, 28][index] || 26, style: { numFmt: '@', font: { name: 'Arial', size: 11 }, alignment: { vertical: 'middle', horizontal: index === 0 ? 'right' : 'left' } } }));
  sheet.getRow(1).height = 32;
  sheet.getRow(1).eachCell((cell) => { cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12304F' } }; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
  for (const row of rows) {
    const added = sheet.addRow(Object.fromEntries(columns.map(([field]) => [field, String(row[field] ?? '')]))); added.height = 25;
    added.eachCell({ includeEmpty: true }, (cell) => { cell.numFmt = '@'; cell.border = { bottom: { style: 'hair', color: { argb: 'FFD7E3F0' } } }; if (added.number % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F6FC' } }; });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const parseCameraWorkbook = async (buffer, type = 'CAMERA') => {
  const recorder = type !== 'CAMERA', fields = deviceExcelColumns(type);
  const columnAliases = recorder ? new Map(fields.map(([field, title]) => [heading(title), field])) : aliases;
  if (type === 'PRINTER') columnAliases.set(heading('اسم الجهاز'), 'name');
  if (recorder) for (const title of ['مديل الجهاز', 'الموديل']) columnAliases.set(heading(title), 'model');
  if (recorder) for (const title of ['عنوان الايبي', 'IP']) columnAliases.set(heading(title), 'managementIp');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { throw new AppError('تعذر قراءة الملف. استخدم ملف Excel بصيغة xlsx والقالب المرفق.', 400); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError('ملف Excel لا يحتوي ورقة بيانات', 400);
  if (sheet.rowCount > 1001 || sheet.columnCount > fields.length) throw new AppError(`استخدم حقول القالب (${fields.length}) وبحد أقصى 1000 جهاز`, 400);
  const columns = new Map();
  for (let column = 1; column <= fields.length; column++) {
    const field = columnAliases.get(heading(sheet.getRow(1).getCell(column).text));
    if (!field || [...columns.values()].includes(field)) throw new AppError('عناوين الأعمدة غير مطابقة. حمّل قالب الاستيراد واستخدم حقوله.', 400);
    columns.set(column, field);
  }
  const rows = [], errors = [];
  for (let number = 2; number <= sheet.rowCount; number++) {
    const record = { rowNumber: number }; let hasData = false, invalid = false;
    for (const [column, field] of columns) {
      const cell = sheet.getRow(number).getCell(column), value = cell.value;
      if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value || value instanceof Date)) { errors.push({ rowNumber: number, message: 'يجب إدخال قيم نصية أو أرقام مباشرة دون معادلات أو خلايا تاريخ.' }); invalid = true; break; }
      const text = cell.text || '';
      if (text !== '') hasData = true;
      record[field] = field === 'password' ? text : clean(text);
    }
    if (!hasData && !invalid) continue;
    if (invalid) continue;
    if (!(type === 'UPS' ? record.patchPanelPort && record.patchPanelNumber : recorder ? record.name : record.cameraNumber)) { errors.push({ rowNumber: number, message: type === 'UPS' ? 'رقم الباج بنل ورقم المنفذ فيه مطلوبان.' : recorder ? 'اسم الجهاز مطلوب.' : 'رقم الكاميرا مطلوب.' }); continue; }
    if (type === 'UPS' && record.vlanNumber && (!/^\d+$/.test(record.vlanNumber) || Number(record.vlanNumber) < 1 || Number(record.vlanNumber) > 4094)) { errors.push({ rowNumber: number, message: 'رقم VLAN يجب أن يكون بين 1 و4094.' }); continue; }
    if (recorder && type !== 'UPS') {
      record.portCount = record.portCount === '' ? null : Number(record.portCount);
      if (record.portCount !== null && (!Number.isSafeInteger(record.portCount) || record.portCount < 1)) { errors.push({ rowNumber: number, message: 'عدد المنافذ يجب أن يكون عدداً صحيحاً موجباً.' }); continue; }
    }
    if (record.password.length > 4096) { errors.push({ rowNumber: number, message: 'كلمة المرور تتجاوز الطول المسموح.' }); continue; }
    try { record.managementIp = normalizeIpv4(record.managementIp, { allowEmpty: true }); }
    catch { errors.push({ rowNumber: number, message: 'عنوان IP غير صالح.' }); continue; }
    if (!['CAMERA', 'NVR', 'UPS'].includes(type)) {
      try { record.macAddress = normalizeMacAddress(record.macAddress); }
      catch { errors.push({ rowNumber: number, message: 'عنوان MAC غير صالح.' }); continue; }
      record.serialNumber = record.serialNumber.toUpperCase();
    }
    rows.push(record);
  }
  if (!rows.length && !errors.length) throw new AppError('الملف لا يحتوي بيانات أجهزة للاستيراد', 400);
  return { rows, errors };
};

export const planCameraImport = ({ rows, errors = [] }, devices, type = 'CAMERA') => {
  const recorder = type !== 'CAMERA', identifier = recorder ? 'name' : 'cameraNumber', label = type === 'UPS' ? 'رقم الباج بنل والمنفذ فيه' : recorder ? 'اسم الجهاز' : 'رقم الكاميرا';
  const portKey = (row) => JSON.stringify([key(row.patchPanelNumber), key(row.patchPanelPort)]);
  const issues = [...errors], plan = [], seenNumbers = new Set(), seenIps = new Set(), seenSerials = new Set();
  for (const row of rows) {
    const numberKey = type === 'UPS' ? portKey(row) : key(row[identifier]);
    if (seenNumbers.has(numberKey)) { issues.push({ rowNumber: row.rowNumber, message: `${label} مكرر داخل الملف.` }); continue; }
    seenNumbers.add(numberKey);
    if (row.managementIp && seenIps.has(row.managementIp)) { issues.push({ rowNumber: row.rowNumber, message: 'عنوان IP مكرر داخل الملف.' }); continue; }
    if (row.managementIp) seenIps.add(row.managementIp);
    const matches = devices.filter((device) => device.deviceType === type && (type === 'UPS' ? portKey(device) : key(recorder ? device.name : device.cameraNumber || device.name)) === numberKey);
    if (matches.length > 1) { issues.push({ rowNumber: row.rowNumber, message: `${label} مرتبط بأكثر من جهاز في الفرع؛ صحح التكرار أولاً.` }); continue; }
    const existing = matches[0];
    if (row.serialNumber && (seenSerials.has(row.serialNumber) || devices.some((device) => String(device._id) !== String(existing?._id) && device.serialNumber === row.serialNumber))) { issues.push({ rowNumber: row.rowNumber, message: 'الرقم التسلسلي مكرر داخل الملف أو مستخدم لجهاز آخر في الفرع.' }); continue; }
    if (row.serialNumber) seenSerials.add(row.serialNumber);
    if (row.managementIp && devices.some((device) => String(device._id) !== String(existing?._id) && device.managementIp === row.managementIp)) { issues.push({ rowNumber: row.rowNumber, message: 'عنوان IP مستخدم لجهاز آخر في الفرع.' }); continue; }
    plan.push({ ...row, deviceId: existing ? String(existing._id) : null, action: existing ? 'UPDATE' : 'CREATE' });
  }
  return { plan, errors: issues };
};

const fingerprint = (devices) => devices.map((device) => [String(device._id), new Date(device.updatedAt || 0).toISOString(), device.deviceType, device.cameraNumber || device.name, device.managementIp]).sort((a, b) => a[0].localeCompare(b[0]));
export const cameraImportToken = ({ rows, devices, branchId, userId, expiresAt, key: signingKey, type = 'CAMERA' }) => `${expiresAt}.${crypto.createHmac('sha256', signingKey).update(JSON.stringify({ type, rows, devices: fingerprint(devices), branchId: String(branchId), userId: String(userId), expiresAt })).digest('hex')}`;
export const verifyCameraImportToken = (token, context) => {
  const expiresAt = Number(String(token || '').split('.')[0]);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = Buffer.from(cameraImportToken({ ...context, expiresAt })), supplied = Buffer.from(String(token));
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};
