import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import express from 'express';
import contentDisposition from 'content-disposition';
import { UserModel } from '../../src/infrastructure/db/models/UserModel.js';
import { NetworkCustomerModel } from '../../src/infrastructure/db/models/NetworkCustomerModel.js';
import { NetworkAttachmentModel } from '../../src/infrastructure/db/models/NetworkAttachmentModel.js';

test('multipart Arabic filenames persist, legacy names display correctly, and downloads preserve name and bytes', { skip: !process.env.NETWORK_ATTACHMENT_TEST_URI }, async () => {
  const suffix = randomUUID().replaceAll('-', ''), dbName = `codex_network_attachment_test_${suffix}`;
  const root = path.resolve('tmp/network-attachment-tests'), directory = path.resolve(root, suffix);
  let server;
  try {
    process.env.MONGO_URI = process.env.NETWORK_ATTACHMENT_TEST_URI;
    process.env.JWT_SECRET = 'isolated-network-test'; process.env.UPLOADS_DIR = directory; process.env.PRIVATE_UPLOADS_DIR = path.join(directory, 'private');
    await mongoose.connect(process.env.NETWORK_ATTACHMENT_TEST_URI, { dbName });
    await import('../../src/presentation/routes/index.js');
    const { uploadNetworkAttachmentMiddleware } = await import('../../src/presentation/middlewares/uploadMiddleware.js');
    const { uploadNetworkAttachments, listNetworkAttachments, downloadNetworkAttachment } = await import('../../src/presentation/controllers/networkDocsController.js');
    const { errorHandler } = await import('../../src/presentation/middlewares/errorHandler.js');
    const user = await UserModel.create({ fullName: 'Test User', email: 'network@test.invalid', passwordHash: 'test', role: 'GENERAL_MANAGER' });
    const customer = await NetworkCustomerModel.create({ name: 'Test Customer', createdBy: user._id });
    const app = express();
    app.use((req, res, next) => { req.user = { id: String(user._id), role: 'GENERAL_MANAGER' }; next(); });
    app.post('/attachments', uploadNetworkAttachmentMiddleware.array('files', 10), uploadNetworkAttachments);
    app.get('/attachments', listNetworkAttachments); app.get('/attachments/:id/download', downloadNetworkAttachment); app.use(errorHandler);
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}`, name = 'استمارة معلومات الضباط.xlsx', bytes = Buffer.from('isolated attachment contents');
    const form = new FormData(); form.append('customerId', String(customer._id)); form.append('category', 'DIAGRAM'); form.append('files', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
    const uploaded = await fetch(`${base}/attachments`, { method: 'POST', body: form });
    const result = await uploaded.json(); assert.equal(uploaded.status, 201, JSON.stringify(result));
    const attachment = result.attachments[0]; assert.equal(attachment.originalName, name);
    const stored = await NetworkAttachmentModel.findById(attachment.id); assert.equal(stored.originalName, name);
    assert.deepEqual(fs.readFileSync(stored.storagePath), bytes);
    // Simulate a file uploaded before the fix, without moving its stored file.
    await NetworkAttachmentModel.updateOne({ _id: attachment.id }, { $set: { originalName: Buffer.from(name, 'utf8').toString('latin1') } });
    const listed = await (await fetch(`${base}/attachments?customerId=${customer._id}`)).json(); assert.equal(listed.attachments[0].originalName, name);
    const downloaded = await fetch(`${base}/attachments/${attachment.id}/download`);
    assert.equal(downloaded.status, 200);
    assert.equal(contentDisposition.parse(downloaded.headers.get('content-disposition')).parameters.filename, name);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    try { if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName && /^codex_network_attachment_test_[a-f0-9]{32}$/.test(dbName)) await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
    if (path.dirname(directory) === root && /^[a-f0-9]{32}$/.test(path.basename(directory))) fs.rmSync(directory, { recursive: true, force: true });
  }
});
