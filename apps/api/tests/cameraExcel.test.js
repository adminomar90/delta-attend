import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildCameraWorkbook, parseCameraWorkbook, planCameraImport, CAMERA_EXCEL_COLUMNS, cameraImportToken, verifyCameraImportToken } from '../src/application/services/cameraExcelService.js';

test('camera Excel roundtrip contains six fields and preserves leading zeros, ports and password text', async () => {
  const source = { cameraNumber: '0007', managementIp: '10.20.20.7', switchNumber: 'SW-01', switchPort: 'Gi1/0/08', username: 'admin', password: ' =2+3 ' };
  const buffer = await buildCameraWorkbook([source]);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.columnCount, 6); assert.equal(sheet.views[0].rightToLeft, true);
  assert.deepEqual(sheet.getRow(1).values.slice(1), CAMERA_EXCEL_COLUMNS.map(([, label]) => label));
  assert.equal(sheet.getRow(2).getCell(1).value, '0007'); assert.equal(sheet.getRow(2).getCell(6).value, ' =2+3 ');
  const parsed = await parseCameraWorkbook(buffer);
  assert.deepEqual(parsed.errors, []); assert.deepEqual(parsed.rows[0], { rowNumber: 2, ...source });
});

test('preview rejects duplicate camera numbers, conflicting IPs and formula cells', async () => {
  const rows = [{ rowNumber: 2, cameraNumber: '01', managementIp: '10.0.0.1' }, { rowNumber: 3, cameraNumber: '01', managementIp: '10.0.0.2' }];
  assert.equal(planCameraImport({ rows }, []).errors[0].rowNumber, 3);
  assert.equal(planCameraImport({ rows: rows.slice(0, 1) }, [{ _id: 'router', deviceType: 'ROUTER', managementIp: '10.0.0.1' }]).errors.length, 1);
  assert.equal(planCameraImport({ rows: rows.slice(0, 1) }, [{ _id: 'cam', deviceType: 'CAMERA', cameraNumber: '01', managementIp: '10.0.0.1' }]).plan[0].action, 'UPDATE');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await buildCameraWorkbook([{ cameraNumber: '01', password: 'placeholder' }]));
  workbook.worksheets[0].getCell('F2').value = { formula: '1+1', result: 2 };
  const parsed = await parseCameraWorkbook(await workbook.xlsx.writeBuffer()); assert.equal(parsed.errors.length, 1); assert.equal(parsed.rows.length, 0);
});

test('import confirmation is bound to the file, actor, branch and current device snapshot', () => {
  const context = { rows: [{ cameraNumber: '01', password: 'known' }], devices: [{ _id: 'device', updatedAt: '2026-10-28T00:00:00Z' }], branchId: 'branch', userId: 'actor', key: 'test-signing-key', expiresAt: Date.now() + 60000 };
  const token = cameraImportToken(context);
  assert.equal(verifyCameraImportToken(token, context), true);
  for (const change of [{ branchId: 'other' }, { userId: 'other' }, { rows: [{ cameraNumber: '01', password: 'different' }] }, { devices: [{ _id: 'device', updatedAt: '2026-10-29T00:00:00Z' }] }]) assert.equal(verifyCameraImportToken(token, { ...context, ...change }), false);
  assert.equal(verifyCameraImportToken(cameraImportToken({ ...context, expiresAt: Date.now() - 1000 }), context), false);
  assert.ok(!token.includes('known'));
});
