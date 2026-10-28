import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import express from 'express';
import ExcelJS from 'exceljs';
import { buildCameraWorkbook, CAMERA_EXCEL_COLUMNS, RECORDER_EXCEL_COLUMNS, DEVICE_EXCEL_COLUMNS, PORT_EXCEL_COLUMNS, PBX_EXCEL_COLUMNS, PRINTER_EXCEL_COLUMNS } from '../../src/application/services/cameraExcelService.js';
import { UserModel } from '../../src/infrastructure/db/models/UserModel.js';
import { NetworkCustomerModel } from '../../src/infrastructure/db/models/NetworkCustomerModel.js';
import { NetworkBranchModel } from '../../src/infrastructure/db/models/NetworkBranchModel.js';
import { NetworkDeviceModel } from '../../src/infrastructure/db/models/NetworkDeviceModel.js';
import { NetworkSecretModel } from '../../src/infrastructure/db/models/NetworkSecretModel.js';
import { NetworkIpAllocationModel } from '../../src/infrastructure/db/models/NetworkIpAllocationModel.js';
import { NetworkChangeLogModel } from '../../src/infrastructure/db/models/NetworkChangeLogModel.js';

test('device CRUD encrypts credentials, enforces permissions and unlinks IPs on deletion', { skip: !process.env.NETWORK_DEVICES_TEST_URI }, async () => {
  const databaseName = `codex_network_devices_test_${randomUUID().replaceAll('-', '')}`;
  let server;
  try {
    process.env.MONGO_URI = process.env.NETWORK_DEVICES_TEST_URI; process.env.JWT_SECRET = 'isolated-network-devices-test';
    await mongoose.connect(process.env.NETWORK_DEVICES_TEST_URI, { dbName: databaseName, autoIndex: false });
    await import('../../src/presentation/routes/index.js');
    const { default: routes } = await import('../../src/presentation/routes/networkDocsRoutes.js');
    const { authTokenService } = await import('../../src/application/services/authTokenService.js');
    const { decryptSensitiveValue } = await import('../../src/shared/security.js');
    const { errorHandler } = await import('../../src/presentation/middlewares/errorHandler.js');
    await NetworkDeviceModel.createIndexes();
    const users = await UserModel.create([
      { fullName: 'Manager', email: 'manager@test.invalid', passwordHash: 'test', role: 'SERVICE_STAFF', customPermissions: ['MANAGE_NETWORK_DEVICES', 'VIEW_NETWORK_DOCUMENTATION', 'MANAGE_NETWORK_CUSTOMERS'] },
      { fullName: 'Viewer', email: 'viewer@test.invalid', passwordHash: 'test', role: 'SERVICE_STAFF', customPermissions: ['VIEW_NETWORK_DOCUMENTATION'] },
      { fullName: 'Secret Viewer', email: 'secret@test.invalid', passwordHash: 'test', role: 'SERVICE_STAFF', customPermissions: ['VIEW_NETWORK_DOCUMENTATION', 'VIEW_NETWORK_SECRETS', 'EXPORT_NETWORK_REPORTS'] },
    ]);
    const tokens = users.map((user) => authTokenService.sign({ sub: String(user._id), role: user.role }));
    const customer = await NetworkCustomerModel.create({ name: 'Test Customer', createdBy: users[0]._id });
    const branch = await NetworkBranchModel.create({ name: 'Main', customer: customer._id, createdBy: users[0]._id });
    const app = express(); app.use(express.json({ limit: '10mb' })); app.use('/network', routes); app.use(errorHandler);
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const call = async (actor, method, path, body, status = 200) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/network${path}`, { method, headers: { Authorization: `Bearer ${tokens[actor]}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
      const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
    };
    const password = ' Camera-Secret-123 ';
    const logoDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1kAAAAASUVORK5CYII=';
    await call(1, 'POST', '/customers', { name: 'Denied Logo', logoDataUrl }, 403);
    const logoCustomer = await call(0, 'POST', '/customers', { name: 'Logo Customer', logoDataUrl }, 201);
    assert.equal(logoCustomer.customer.logoDataUrl, logoDataUrl);
    const logoCustomerId = logoCustomer.customer.id;
    const retainedLogo = await call(0, 'PATCH', `/customers/${logoCustomerId}`, { name: 'Updated Logo Customer' }); assert.equal(retainedLogo.customer.logoDataUrl, logoDataUrl);
    await call(1, 'PATCH', `/customers/${logoCustomerId}`, { logoDataUrl: '' }, 403);
    await call(0, 'PATCH', `/customers/${logoCustomerId}`, { logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }, 400);
    await call(0, 'PATCH', `/customers/${logoCustomerId}`, { logoDataUrl: 'https://example.com/logo.png' }, 400);
    const oversizedLogo = Buffer.alloc(128 * 1024 + 1); oversizedLogo.set([137, 80, 78, 71, 13, 10, 26, 10]);
    await call(0, 'PATCH', `/customers/${logoCustomerId}`, { logoDataUrl: `data:image/png;base64,${oversizedLogo.toString('base64')}` }, 400);
    const logoList = await call(1, 'GET', '/customers'); assert.equal(logoList.customers.find((item) => item.id === logoCustomerId).logoDataUrl, logoDataUrl);
    const clearedLogo = await call(0, 'PATCH', `/customers/${logoCustomerId}`, { logoDataUrl: '' }); assert.equal(clearedLogo.customer.logoDataUrl, '');
    const directory = await call(1, 'GET', '/customers');
    const directoryCustomer = directory.customers.find((item) => item.id === String(customer._id));
    assert.equal(directoryCustomer.branchCount, 1);
    assert.deepEqual(directoryCustomer.branches.map((item) => [item.id, item.name]), [[String(branch._id), 'Main']]);
    assert.equal(directoryCustomer.branches[0].cameraImportLock, undefined);
    const input = { name: 'Entrance Camera', deviceType: 'CAMERA', managementIp: '192.168.1.10', username: 'operator', password };
    await call(1, 'POST', `/branches/${branch._id}/devices`, input, 403);
    await call(0, 'POST', `/branches/${branch._id}/devices`, { ...input, managementIp: '999.2.3.4' }, 400);
    const created = await call(0, 'POST', `/branches/${branch._id}/devices`, input, 201);
    const deviceId = created.device.id, secretId = created.device.secret.id;
    assert.equal(created.device.username, 'operator');
    assert.ok(!JSON.stringify(created).includes(password)); assert.equal(created.device.secret.ciphertext, undefined);
    const secret = await NetworkSecretModel.findById(secretId);
    assert.equal(decryptSensitiveValue(secret), password);
    assert.notEqual(secret.ciphertext, password);
    assert.equal((await NetworkDeviceModel.findById(deviceId)).password, undefined);
    await call(0, 'POST', `/secrets/${secretId}/reveal`, {}, 403);
    const revealed = await call(2, 'POST', `/secrets/${secretId}/reveal`, {}); assert.equal(revealed.secret.value, password);
    await call(1, 'PATCH', `/devices/${deviceId}`, { name: 'Denied' }, 403);
    const edited = await call(0, 'PATCH', `/devices/${deviceId}`, { name: 'Front Camera', cameraNumber: 'CAM-02', switchNumber: 'SW-01', switchPort: '24', username: 'admin', password: '' });
    assert.equal(edited.device.name, 'Front Camera'); assert.equal(decryptSensitiveValue(await NetworkSecretModel.findById(secretId)), password);
    assert.equal(edited.device.cameraNumber, 'CAM-02'); assert.equal(edited.device.switchNumber, 'SW-01'); assert.equal(edited.device.switchPort, '24');
    await call(0, 'PATCH', `/devices/${deviceId}`, { password: 'Rotated-Password' });
    assert.equal(decryptSensitiveValue(await NetworkSecretModel.findById(secretId)), 'Rotated-Password');
    await call(0, 'POST', `/branches/${branch._id}/devices`, { ...input, name: 'Duplicate' }, 409);
    await call(0, 'POST', `/branches/${branch._id}/devices`, { name: 'Printer', deviceType: 'PRINTER' }, 201);
    await call(0, 'POST', `/branches/${branch._id}/devices`, { name: 'Server', deviceType: 'SERVER' }, 201);
    const listed = await call(1, 'GET', `/branches/${branch._id}/devices`);
    assert.equal(listed.devices.length, 3); assert.ok(!JSON.stringify(listed).includes('Rotated-Password'));
    const workspace = await call(1, 'GET', `/customers/${customer._id}/workspace`);
    assert.equal(workspace.workspace.devices.find((device) => device.id === deviceId).username, 'admin');
    assert.ok(!JSON.stringify(workspace).includes('Rotated-Password'));
    const allocation = await NetworkIpAllocationModel.create({ branch: branch._id, customer: customer._id, device: deviceId, ipAddress: '192.168.1.10', ipType: 'MANAGEMENT', createdBy: users[0]._id });
    await call(1, 'DELETE', `/devices/${deviceId}`, {}, 403);
    await call(0, 'DELETE', `/devices/${deviceId}`, {});
    assert.equal(await NetworkDeviceModel.countDocuments({ _id: deviceId }), 0);
    assert.equal(await NetworkSecretModel.countDocuments({ _id: secretId }), 0);
    assert.equal((await NetworkIpAllocationModel.findById(allocation._id)).device, null);
    await call(2, 'POST', `/secrets/${secretId}/reveal`, {}, 404);
    const changes = JSON.stringify(await NetworkChangeLogModel.find({ entityType: 'NETWORK_DEVICE' }).lean());
    assert.ok(!changes.includes(password)); assert.ok(!changes.includes('Rotated-Password')); assert.ok(!changes.includes('ciphertext'));
    const camera = await call(0, 'POST', `/branches/${branch._id}/devices`, { deviceType: 'CAMERA', cameraNumber: 'CAM-07', managementIp: '10.20.20.7', switchNumber: 'SW-02', switchPort: 'Gi1/0/8', username: 'camera-admin' }, 201);
    assert.equal(camera.device.name, 'كاميرا CAM-07'); assert.equal(camera.device.cameraNumber, 'CAM-07'); assert.equal(camera.device.switchNumber, 'SW-02'); assert.equal(camera.device.switchPort, 'Gi1/0/8');
    const changedPort = await call(0, 'PATCH', `/devices/${camera.device.id}`, { switchNumber: 'SW-03', switchPort: '16' });
    assert.equal(changedPort.device.cameraNumber, 'CAM-07'); assert.equal(changedPort.device.switchNumber, 'SW-03'); assert.equal(changedPort.device.switchPort, '16');
    await call(0, 'POST', `/branches/${branch._id}/devices`, { deviceType: 'CAMERA', cameraNumber: ' ' }, 400);

    // Excel export/import uses exactly the camera fields, with a confirmation preview.
    let excelBase = `/branches/${branch._id}/cameras`;
    const getExcel = async (actor, query = '') => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/network${excelBase}/excel${query}`, { headers: { Authorization: `Bearer ${tokens[actor]}` } });
      assert.equal(response.status, 200); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await response.arrayBuffer())); return workbook.worksheets[0];
    };
    const uploadExcel = async (actor, endpoint, buffer, token, status = 200) => {
      const form = new FormData(); form.append('file', new Blob([buffer]), 'cameras.xlsx'); if (token) form.append('previewToken', token);
      const response = await fetch(`http://127.0.0.1:${server.address().port}/network${excelBase}/${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[actor]}` }, body: form });
      const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
    };
    const template = await getExcel(0, '?template=1'); assert.equal(template.columnCount, 6); assert.deepEqual(template.getRow(1).values.slice(1), CAMERA_EXCEL_COLUMNS.map(([, label]) => label));
    await call(1, 'GET', `${excelBase}/excel`, undefined, 403);
    await call(0, 'GET', `${excelBase}/excel?includePasswords=1`, undefined, 403);
    await call(0, 'PATCH', `/devices/${camera.device.id}`, { password: 'Existing-Camera-Password' });
    const importRows = [
      { cameraNumber: 'CAM-07', managementIp: '10.20.20.7', switchNumber: 'SW-09', switchPort: '12', username: 'updated-admin', password: '' },
      { cameraNumber: 'CAM-08', managementIp: '10.20.20.8', switchNumber: 'SW-09', switchPort: '13', username: 'new-admin', password: ' Import-Password ' },
    ];
    const buffer = await buildCameraWorkbook(importRows);
    await uploadExcel(1, 'import-preview', buffer, null, 403);
    const preview = await uploadExcel(0, 'import-preview', buffer);
    assert.equal(preview.canImport, true); assert.equal(preview.createCount, 1); assert.equal(preview.updateCount, 1);
    assert.ok(!JSON.stringify(preview).includes('Import-Password'));
    await uploadExcel(0, 'import', buffer, 'bad-token', 409);
    const altered = await buildCameraWorkbook(importRows.map((row) => ({ ...row, switchPort: '18' })));
    await uploadExcel(0, 'import', altered, preview.previewToken, 409);
    const imported = await uploadExcel(0, 'import', buffer, preview.previewToken);
    assert.equal(imported.createdCount, 1); assert.equal(imported.updatedCount, 1); assert.equal(imported.failedCount, 0);
    const refreshed = await NetworkDeviceModel.findById(camera.device.id);
    assert.equal(refreshed.switchNumber, 'SW-09'); assert.equal(refreshed.username, 'updated-admin');
    assert.equal(decryptSensitiveValue(await NetworkSecretModel.findById(refreshed.secret)), 'Existing-Camera-Password');
    const duplicatePreview = await uploadExcel(0, 'import-preview', buffer); assert.equal(duplicatePreview.createCount, 0); assert.equal(duplicatePreview.updateCount, 2);
    const plainExport = await getExcel(0); assert.equal(plainExport.columnCount, 6); assert.equal(plainExport.rowCount, 3);
    assert.equal(plainExport.getCell('F2').text, ''); assert.equal(plainExport.getCell('F3').text, '');
    const fullExport = await getExcel(2, '?includePasswords=1');
    const exported = [2, 3].map((row) => [fullExport.getRow(row).getCell(1).text, fullExport.getRow(row).getCell(6).text]);
    assert.deepEqual(new Map(exported).get('CAM-08'), ' Import-Password ');
    const invalid = await uploadExcel(0, 'import-preview', await buildCameraWorkbook([{ cameraNumber: 'CAM-BAD', managementIp: '999.1.1.1' }]));
    assert.equal(invalid.canImport, false); assert.equal(invalid.errors.length, 1);
    assert.equal(await NetworkDeviceModel.countDocuments({ branch: branch._id, deviceType: 'CAMERA' }), 2);
    const importLogs = JSON.stringify(await NetworkChangeLogModel.find({ action: 'NETWORK_CAMERAS_EXCEL_IMPORTED' }).lean());
    assert.ok(!importLogs.includes('Import-Password'));
    // Diagnostics use only the stored target and are read-only for documentation viewers.
    const loopback = await call(0, 'POST', `/branches/${branch._id}/devices`, { name: 'Local Ping Test', deviceType: 'NVR', managementIp: '127.0.0.1' }, 201);
    const beforePing = await NetworkDeviceModel.findById(loopback.device.id);
    const ping = await call(1, 'POST', `/devices/${loopback.device.id}/ping`, { address: '203.0.113.99' });
    assert.equal(ping.ping.target, '127.0.0.1'); assert.equal(ping.ping.reachable, true); assert.equal(ping.ping.source, 'SERVER');
    assert.equal((await NetworkDeviceModel.findById(loopback.device.id)).updatedAt.getTime(), beforePing.updatedAt.getTime());
    const printer = listed.devices.find((device) => device.deviceType === 'PRINTER');
    await call(1, 'POST', `/devices/${printer.id}/ping`, {}, 400);
    await call(1, 'POST', '/devices/000000000000000000000000/ping', {}, 404);
    const recorder = await call(0, 'POST', `/branches/${branch._id}/devices`, { deviceType: 'NVR', name: 'Main Recorder', model: 'DS-7616', portCount: 16, managementIp: '10.20.20.10', username: 'nvr-admin', password: 'Recorder-Password' }, 201);
    assert.equal(recorder.device.model, 'DS-7616'); assert.equal(recorder.device.portCount, 16); assert.equal(recorder.device.username, 'nvr-admin');
    const editedRecorder = await call(0, 'PATCH', `/devices/${recorder.device.id}`, { model: 'DS-7632', portCount: '32', password: '' });
    assert.equal(editedRecorder.device.portCount, 32); assert.equal(editedRecorder.device.model, 'DS-7632');
    assert.equal(decryptSensitiveValue(await NetworkSecretModel.findById(editedRecorder.device.secret.id)), 'Recorder-Password');
    for (const portCount of [-1, 0, 2.5, 'abc']) await call(0, 'PATCH', `/devices/${recorder.device.id}`, { portCount }, 400);
    assert.equal((await NetworkDeviceModel.findById(recorder.device.id)).portCount, 32);
    excelBase = `/branches/${branch._id}/recorders`;
    const recorderTemplate = await getExcel(0, '?template=1');
    assert.deepEqual(recorderTemplate.getRow(1).values.slice(1), RECORDER_EXCEL_COLUMNS.map(([, label]) => label));
    const recorderRows = [
      { name: 'Main Recorder', model: 'DS-7664', portCount: 64, managementIp: '10.20.20.10', username: 'updated-nvr', password: '' },
      { name: 'مسجل جديد', model: 'NVR-16', portCount: 16, managementIp: '10.20.20.11', username: 'new-nvr', password: ' New-NVR-Secret ' },
    ];
    const recorderBuffer = await buildCameraWorkbook(recorderRows, 'NVR');
    await uploadExcel(1, 'import-preview', recorderBuffer, null, 403);
    await call(1, 'GET', `${excelBase}/excel`, undefined, 403);
    await call(0, 'GET', `${excelBase}/excel?includePasswords=1`, undefined, 403);
    const recorderPreview = await uploadExcel(0, 'import-preview', recorderBuffer);
    assert.equal(recorderPreview.createCount, 1); assert.equal(recorderPreview.updateCount, 1);
    assert.ok(!JSON.stringify(recorderPreview).includes('New-NVR-Secret'));
    await uploadExcel(0, 'import', recorderBuffer, 'bad-token', 409);
    const recorderImported = await uploadExcel(0, 'import', recorderBuffer, recorderPreview.previewToken);
    assert.equal(recorderImported.createdCount, 1); assert.equal(recorderImported.updatedCount, 1); assert.equal(recorderImported.failedCount, 0);
    const updatedNvr = await NetworkDeviceModel.findById(recorder.device.id);
    assert.equal(updatedNvr.portCount, 64); assert.equal(updatedNvr.model, 'DS-7664');
    assert.equal(decryptSensitiveValue(await NetworkSecretModel.findById(updatedNvr.secret)), 'Recorder-Password');
    const recorderExport = await getExcel(2, '?includePasswords=1');
    assert.equal(recorderExport.columnCount, 6); assert.equal(recorderExport.rowCount, 4);
    const exportedNvr = [2, 3, 4].map((row) => recorderExport.getRow(row).values.slice(1));
    assert.deepEqual(exportedNvr.find((row) => row[0] === 'مسجل جديد'), ['مسجل جديد', 'NVR-16', '16', '10.20.20.11', 'new-nvr', ' New-NVR-Secret ']);
    const recorderPlain = await getExcel(0); for (let row = 2; row <= recorderPlain.rowCount; row++) assert.equal(recorderPlain.getCell(`F${row}`).text, '');
    const repeatNvr = await uploadExcel(0, 'import-preview', recorderBuffer); assert.equal(repeatNvr.createCount, 0); assert.equal(repeatNvr.updateCount, 2);
    for (const rows of [[{ ...recorderRows[1], portCount: 2.5 }], [recorderRows[1], recorderRows[1]], [{ ...recorderRows[1], managementIp: '10.20.20.7' }]]) {
      const invalidNvr = await uploadExcel(0, 'import-preview', await buildCameraWorkbook(rows, 'NVR')); assert.equal(invalidNvr.canImport, false); assert.ok(invalidNvr.errors.length);
    }
    const nvrLogs = JSON.stringify(await NetworkChangeLogModel.find({ action: 'NETWORK_RECORDERS_EXCEL_IMPORTED' }).lean());
    assert.ok(!nvrLogs.includes('New-NVR-Secret'));
    const otherTypes = ['SWITCH', 'ROUTER', 'FIREWALL', 'ACCESS_POINT', 'IP_PBX', 'PRINTER', 'SERVER', 'OTHER'];
    for (const [index, type] of otherTypes.entries()) {
      excelBase = `/branches/${branch._id}/device-excel/${type}`;
      const deviceTemplate = await getExcel(0, '?template=1');
      const expectedColumns = type === 'IP_PBX' ? PBX_EXCEL_COLUMNS : type === 'PRINTER' ? PRINTER_EXCEL_COLUMNS : DEVICE_EXCEL_COLUMNS;
      assert.deepEqual(deviceTemplate.getRow(1).values.slice(1), expectedColumns.map(([, label]) => label));
      await call(1, 'GET', `${excelBase}/excel`, undefined, 403);
      await call(0, 'GET', `${excelBase}/excel?includePasswords=1`, undefined, 403);
      const row = { name: 'نفس الاسم بين الأنواع', model: `Model-${type}`, managementIp: `10.30.0.${index + 1}`, username: 'admin', password: ' Device-Secret ', vendor: 'Vendor', serialNumber: `SERIAL-${index}`, macAddress: 'AA:BB:CC:DD:EE:FF', physicalLocation: 'الطابق الأول', notes: 'تفاصيل الجهاز', portCount: 8 };
      if (type === 'IP_PBX') row.extensionNumber = '0012';
      const deviceBuffer = await buildCameraWorkbook([row], type);
      await uploadExcel(1, 'import-preview', deviceBuffer, null, 403);
      const devicePreview = await uploadExcel(0, 'import-preview', deviceBuffer);
      assert.equal(devicePreview.canImport, true); assert.equal(devicePreview.createCount, 1);
      assert.ok(!JSON.stringify(devicePreview).includes('Device-Secret'));
      if (index === 0) {
        const savedBase = excelBase; excelBase = `/branches/${branch._id}/device-excel/ROUTER`;
        await uploadExcel(0, 'import', deviceBuffer, devicePreview.previewToken, 409); excelBase = savedBase;
      }
      const saved = await uploadExcel(0, 'import', deviceBuffer, devicePreview.previewToken);
      assert.equal(saved.createdCount, 1); assert.equal(saved.failedCount, 0);
      const persisted = await NetworkDeviceModel.findOne({ branch: branch._id, deviceType: type, name: row.name });
      assert.equal(persisted.serialNumber, row.serialNumber); assert.equal(persisted.physicalLocation, row.physicalLocation); assert.equal(persisted.portCount, 8);
      const sheet = await getExcel(2, '?includePasswords=1');
      const exportedRow = [...Array(sheet.rowCount - 1)].map((_, i) => sheet.getRow(i + 2)).find((entry) => entry.getCell(1).text === row.name);
      for (const [column, [field]] of expectedColumns.entries()) assert.equal(exportedRow.getCell(column + 1).text, String(row[field]));
      const updatedBuffer = await buildCameraWorkbook([{ ...row, model: 'Updated', password: '' }], type);
      const updatePreview = await uploadExcel(0, 'import-preview', updatedBuffer); assert.equal(updatePreview.updateCount, 1); assert.equal(updatePreview.createCount, 0);
      const updated = await uploadExcel(0, 'import', updatedBuffer, updatePreview.previewToken); assert.equal(updated.updatedCount, 1); assert.equal(updated.failedCount, 0);
      const current = await NetworkDeviceModel.findById(persisted._id); assert.equal(current.model, 'Updated');
      assert.equal(decryptSensitiveValue(await NetworkSecretModel.findById(current.secret)), row.password);
      if (type === 'IP_PBX') {
        assert.equal(current.extensionNumber, '0012');
        const pbxEdited = await call(0, 'PATCH', `/devices/${current._id}`, { extensionNumber: '0023' }); assert.equal(pbxEdited.device.extensionNumber, '0023');
      }
      await call(0, 'PATCH', `/devices/${loopback.device.id}`, { deviceType: type });
      const devicePing = await call(1, 'POST', `/devices/${loopback.device.id}/ping`, {}); assert.equal(devicePing.ping.reachable, true);
    }
    await call(0, 'GET', `/branches/${branch._id}/device-excel/INVALID/excel`, undefined, 400);
    const invalidGeneric = await uploadExcel(0, 'import-preview', await buildCameraWorkbook([{ name: 'Bad MAC', macAddress: 'INVALID' }], 'OTHER')); assert.equal(invalidGeneric.canImport, false);
    const conflictSerial = await uploadExcel(0, 'import-preview', await buildCameraWorkbook([{ name: 'Conflicting Serial', serialNumber: 'SERIAL-0' }], 'OTHER')); assert.equal(conflictSerial.canImport, false);
    const port = await call(0, 'POST', `/branches/${branch._id}/devices`, { deviceType: 'UPS', patchPanelPort: '02', patchPanelNumber: 'PP-01', connectedDeviceType: 'كاميرا', switchPort: 'Gi1/0/8', managementIp: '10.40.0.1', username: 'port-admin', password: 'Port-Secret', vlanNumber: '20', model: 'Camera-01' }, 201);
    assert.equal(port.device.name, 'باج PP-01 / منفذ 02'); assert.equal(port.device.portNumber, ''); assert.equal(port.device.patchPanelPort, '02'); assert.equal(port.device.vlanNumber, '20');
    await call(0, 'PATCH', `/devices/${port.device.id}`, { vlanNumber: '4095' }, 400);
    await call(0, 'POST', `/branches/${branch._id}/devices`, { deviceType: 'UPS', portNumber: '' }, 400);
    excelBase = `/branches/${branch._id}/device-excel/UPS`;
    const portTemplate = await getExcel(0, '?template=1'); assert.deepEqual(portTemplate.getRow(1).values.slice(1), PORT_EXCEL_COLUMNS.map(([, label]) => label));
    const portRows = [{ patchPanelPort: '02', patchPanelNumber: 'PP-01', connectedDeviceType: 'طابعة', switchPort: 'Gi1/0/9', managementIp: '10.40.0.1', username: 'updated-port-admin', password: '', vlanNumber: '30', model: 'Printer-01' },
      { patchPanelPort: '04', patchPanelNumber: 'PP-02', connectedDeviceType: 'كاميرا', switchPort: 'Gi1/0/10', managementIp: '10.40.0.2', username: 'new-admin', password: ' New-Port-Secret ', vlanNumber: '40', model: 'Camera-02' },
      { patchPanelPort: '04', patchPanelNumber: 'PP-03', connectedDeviceType: 'كاميرا', switchPort: 'Gi1/0/11', managementIp: '10.40.0.3', username: 'other-admin', password: '', vlanNumber: '50', model: 'Camera-03' }];
    const portBuffer = await buildCameraWorkbook(portRows, 'UPS'), portPreview = await uploadExcel(0, 'import-preview', portBuffer);
    assert.equal(portPreview.canImport, true); assert.equal(portPreview.createCount, 2); assert.equal(portPreview.updateCount, 1); assert.ok(!JSON.stringify(portPreview).includes('New-Port-Secret'));
    const portSaved = await uploadExcel(0, 'import', portBuffer, portPreview.previewToken); assert.equal(portSaved.failedCount, 0); assert.equal(portSaved.createdCount, 2); assert.equal(portSaved.updatedCount, 1);
    const currentPort = await NetworkDeviceModel.findById(port.device.id); assert.equal(currentPort.patchPanelNumber, 'PP-01'); assert.equal(currentPort.switchPort, 'Gi1/0/9'); assert.equal(currentPort.vlanNumber, '30'); assert.equal(currentPort.model, 'Printer-01');
    assert.equal(decryptSensitiveValue(await NetworkSecretModel.findById(currentPort.secret)), 'Port-Secret');
    const portsExport = await getExcel(2, '?includePasswords=1'); assert.equal(portsExport.columnCount, 9);
    assert.deepEqual(portsExport.getRow(1).values.slice(1), ['رقم المنفذ في الباج بنل', 'رقم الباج بنل', 'نوع الجهاز', 'رقم المنفذ في السويج', 'عنوان الايبي', 'اسم المستخدم', 'كلمة المرور', 'رقم ال vlan', 'مديل الجهاز']);
    const portRow = [...Array(portsExport.rowCount - 1)].map((_, i) => portsExport.getRow(i + 2)).find((row) => row.getCell(1).text === '04' && row.getCell(2).text === 'PP-02');
    for (const [index, [field]] of PORT_EXCEL_COLUMNS.entries()) assert.equal(portRow.getCell(index + 1).text, portRows[1][field]);
    for (const rows of [[{ ...portRows[1], vlanNumber: '4095' }], [portRows[1], portRows[1]]]) {
      const invalidPort = await uploadExcel(0, 'import-preview', await buildCameraWorkbook(rows, 'UPS')); assert.equal(invalidPort.canImport, false);
    }
    await call(0, 'PATCH', `/devices/${loopback.device.id}`, { deviceType: 'UPS' });
    assert.equal((await call(1, 'POST', `/devices/${loopback.device.id}/ping`, {})).ping.reachable, true);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    try { if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && /^codex_network_devices_test_[a-f0-9]{32}$/.test(databaseName)) await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  }
});
