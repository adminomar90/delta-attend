import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

test('real MongoDB + HTTP ticket workflows, isolation, files, maintenance and scheduler', { skip: process.env.RUN_TICKET_DB_TESTS !== '1', timeout: 120000 }, async (t) => {
  const databaseName = `delta_ticket_test_${randomUUID().replaceAll('-', '')}`;
  process.env.MONGO_URI = `mongodb://127.0.0.1:27017/${databaseName}`;
  process.env.JWT_SECRET = randomUUID();
  process.env.VAPID_PUBLIC_KEY = ''; process.env.VAPID_PRIVATE_KEY = ''; process.env.SMTP_HOST = '';
  const testRoot = path.resolve('../..', '.ticket-check'), privatePath = path.join(testRoot, `uploads-${randomUUID()}`);
  process.env.PRIVATE_UPLOADS_DIR = privatePath;
  const mongoose = (await import('mongoose')).default;
  const express = (await import('express')).default;
  const routes = (await import('../src/presentation/routes/tasksRoutes.js')).default;
  const materialRoutes = (await import('../src/presentation/routes/materialsRoutes.js')).default;
  const reportRoutes = (await import('../src/presentation/routes/maintenanceReportsRoutes.js')).default;
  const evaluationRoutes = (await import('../src/presentation/routes/customerEvaluationsRoutes.js')).default;
  const planRoutes = (await import('../src/presentation/routes/maintenancePlansRoutes.js')).default;
  const { UserModel } = await import('../src/infrastructure/db/models/UserModel.js');
  const { TaskModel } = await import('../src/infrastructure/db/models/TaskModel.js');
  const { MaintenancePlanModel } = await import('../src/infrastructure/db/models/MaintenancePlanModel.js');
  const { MaintenanceVisitModel } = await import('../src/infrastructure/db/models/MaintenanceVisitModel.js');
  const { NotificationModel } = await import('../src/infrastructure/db/models/NotificationModel.js');
  const { MaterialModel } = await import('../src/infrastructure/db/models/MaterialModel.js');
  const { WarehouseModel } = await import('../src/infrastructure/db/models/WarehouseModel.js');
  const { StockBalanceModel } = await import('../src/infrastructure/db/models/StockBalanceModel.js');
  const { authTokenService } = await import('../src/application/services/authTokenService.js');
  const { runTicketScheduler } = await import('../src/application/services/ticketScheduler.js');
  const { errorHandler } = await import('../src/presentation/middlewares/errorHandler.js');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  let server;
  try {
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    const createUser = (name, role, manager = null, active = true) => UserModel.create({ fullName: name, email: `${name}@ticket.test`, role, manager, active, passwordHash: 'test-only-not-a-real-login', department: 'TECH' });
    const manager = await createUser('manager', 'GENERAL_MANAGER'), reviewer = await createUser('reviewer', 'TEAM_LEAD', manager._id), staff = await createUser('staff', 'TECHNICAL_STAFF', reviewer._id), staff2 = await createUser('staff2', 'TECHNICAL_STAFF', reviewer._id), outsider = await createUser('outsider', 'TECHNICAL_STAFF', manager._id), inactive = await createUser('inactive', 'TECHNICAL_STAFF', reviewer._id, false);
    const app = express(); app.use(express.json()); app.use('/tasks', routes); app.use('/materials', materialRoutes); app.use('/maintenance-reports', reportRoutes); app.use('/maintenance-plans', planRoutes); app.use('/customer-evaluations', evaluationRoutes); app.use(errorHandler);
    server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const call = async (user, url, method = 'GET', body) => {
      const token = authTokenService.sign({ sub: String(user._id), sv: 1 });
      const response = await fetch(origin + url, { method, signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
      const data = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
      return { status: response.status, data, headers: Object.fromEntries(response.headers) };
    };
    const ok = (result, expected = 200) => { if (result.status !== expected) console.error('Unexpected test response:', result.status, JSON.stringify(result.data)); assert.equal(result.status, expected, JSON.stringify(result.data)); return result.data; };
    const base = { title: 'Prepare Excel', ticketType: 'ADMIN', description: 'Monthly statement', assignee: String(staff._id), reviewer: String(reviewer._id), dueDate: '2026-11-02T16:00', outputType: 'EXCEL', requireOutput: true };
    const upload = async (user, taskId, content, filename, purpose = 'OUTPUT') => { const body = new FormData(); body.append('purpose', purpose); body.append('files', new Blob([content]), filename); return call(user, `/tasks/${taskId}/attachments`, 'POST', body); };
    let task;
    await t.test('metadata, unique numbering and create idempotency', async () => {
      ok(await call(manager, '/tasks/metadata'));
      const key = randomUUID(), results = await Promise.all([call(manager, '/tasks', 'POST', { ...base, requestKey: key }), call(manager, '/tasks', 'POST', { ...base, requestKey: key })]);
      task = ok(results[0], 201).task; assert.equal(task._id, ok(results[1], 201).task._id); assert.match(task.ticketNumber, /^TK-\d{4}-\d{5,}$/); assert.equal(task.dueDate, '2026-11-02T13:00:00.000Z');
    });
    await t.test('Excel submission, required output, return, versioned resubmit and approval', async () => {
      ok(await call(staff, `/tasks/${task._id}/status`, 'PATCH', { status: 'IN_PROGRESS' }));
      assert.equal((await call(staff, `/tasks/${task._id}/status`, 'PATCH', { status: 'SUBMITTED' })).status, 400);
      const ExcelJS = (await import('exceljs')).default, workbook = new ExcelJS.Workbook();
      workbook.addWorksheet('كشف').addRows([['البند', 'المبلغ'], ['صيانة', 100]]);
      const workbookBytes = Buffer.from(await workbook.xlsx.writeBuffer());
      const uploaded = ok(await upload(staff, task._id, workbookBytes, 'كشف عربي.xlsx')).task;
      const downloaded = await fetch(`${origin}/tasks/${task._id}/attachments/${uploaded.attachments[0]._id}`, { headers: { Authorization: `Bearer ${authTokenService.sign({ sub: String(staff._id), sv: 1 })}` } });
      assert.equal(downloaded.status, 200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), workbookBytes);
      ok(await call(staff, `/tasks/${task._id}/status`, 'PATCH', { status: 'SUBMITTED', note: 'v1' }));
      assert.equal((await call(staff, `/tasks/${task._id}`, 'PATCH', { execution: { diagnosis: 'changed after submission' } })).status, 409);
      assert.equal((await call(reviewer, `/tasks/${task._id}/status`, 'PATCH', { status: 'REJECTED' })).status, 400);
      ok(await call(reviewer, `/tasks/${task._id}/status`, 'PATCH', { status: 'REJECTED', reason: 'Correct totals' }));
      ok(await upload(staff, task._id, 'new output', 'revision.csv'));
      ok(await call(staff, `/tasks/${task._id}/status`, 'PATCH', { status: 'SUBMITTED', note: 'v2' }));
      const result = ok(await call(reviewer, `/tasks/${task._id}/approve`, 'PATCH', { qualityScore: 4 })).task;
      assert.equal(result.status, 'APPROVED'); assert.equal(result.submissions.length, 2); assert.equal(result.attachments.length, 2);
      assert.equal((await call(reviewer, `/tasks/${task._id}/approve`, 'PATCH', {})).status, 400);
    });
    await t.test('employee cannot read, comment, mutate or download an unrelated ticket', async () => {
      task = ok(await call(manager, `/tasks/${task._id}`)).task;
      for (const [url, method, body] of [[`/tasks/${task._id}`, 'GET'], [`/tasks/${task._id}/comments`, 'POST', { text: 'unauthorized' }], [`/tasks/${task._id}/status`, 'PATCH', { status: 'IN_PROGRESS', reason: 'hack' }], [`/tasks/${task._id}/attachments/${task.attachments[0]?._id || '507f1f77bcf86cd799439011'}`, 'GET']]) assert.equal((await call(outsider, url, method, body)).status, 404);
      const list = ok(await call(outsider, '/tasks')).tasks; assert.ok(!list.some((r) => r._id === task._id));
      const empty = ok(await call(manager, '/tasks?search=no-such-ticket-unique'));
      assert.equal(empty.total, 0); assert.equal(empty.summary.open, 0); assert.equal(empty.summary.completed, 0);
      assert.equal((await call(outsider, '/tasks?view=all')).status, 403);
    });
    await t.test('invoice output is attached, and files validate bytes as well as extension', async () => {
      const invoice = ok(await call(manager, '/tasks', 'POST', { ...base, title: 'Invoice', outputType: 'PDF' }), 201).task;
      assert.equal((await upload(staff, invoice._id, '<script>bad</script>', 'fake.pdf')).status, 400);
      const PDFDocument = (await import('pdfkit')).default, document = new PDFDocument(), chunks = [];
      const pdfBytes = new Promise((resolve) => { document.on('data', (chunk) => chunks.push(chunk)); document.on('end', () => resolve(Buffer.concat(chunks))); });
      document.text('Invoice — 100'); document.end();
      ok(await upload(staff, invoice._id, await pdfBytes, 'فاتورة.pdf'));
      ok(await call(staff, `/tasks/${invoice._id}/status`, 'PATCH', { status: 'IN_PROGRESS' }));
      ok(await call(staff, `/tasks/${invoice._id}/status`, 'PATCH', { status: 'SUBMITTED' }));
      assert.equal(ok(await call(staff, `/tasks/${invoice._id}`)).task.attachments[0].originalName, 'فاتورة.pdf');
    });
    await t.test('shared task can only be submitted by its lead; self approval denied', async () => {
      const shared = ok(await call(manager, '/tasks', 'POST', { ...base, requireOutput: false, recipientMode: 'MULTIPLE', recipients: [String(staff._id), String(staff2._id)], assignmentMode: 'SHARED' }), 201).task;
      ok(await call(staff2, `/tasks/${shared._id}/status`, 'PATCH', { status: 'IN_PROGRESS' }));
      assert.equal((await call(staff2, `/tasks/${shared._id}/status`, 'PATCH', { status: 'SUBMITTED' })).status, 403);
      const own = ok(await call(manager, '/tasks', 'POST', { ...base, reviewer: String(staff._id), requireOutput: false }), 201).task;
      ok(await call(staff, `/tasks/${own._id}/status`, 'PATCH', { status: 'IN_PROGRESS' })); ok(await call(staff, `/tasks/${own._id}/status`, 'PATCH', { status: 'SUBMITTED' }));
      assert.equal((await call(staff, `/tasks/${own._id}/approve`, 'PATCH', {})).status, 403);
    });
    await t.test('independent group tasks retain each employees status and progress', async () => {
      const group = ok(await call(manager, '/tasks', 'POST', { ...base, requireOutput: false, recipientMode: 'MULTIPLE', recipients: [String(staff._id), String(staff2._id)], assignmentMode: 'INDEPENDENT' }), 201).task;
      assert.equal(group.children.length, 2);
      const child = group.children.find((c) => c.assignee._id === String(staff._id));
      ok(await call(staff, `/tasks/${child._id}/status`, 'PATCH', { status: 'IN_PROGRESS' })); ok(await call(staff, `/tasks/${child._id}/status`, 'PATCH', { status: 'SUBMITTED' })); ok(await call(reviewer, `/tasks/${child._id}/approve`, 'PATCH', {}));
      const result = ok(await call(manager, `/tasks/${group._id}`)).task; assert.deepEqual(result.groupProgress, { total: 2, completed: 1 }); assert.equal(result.children.find((c) => c._id !== child._id).status, 'ASSIGNED');
      const added = ok(await call(manager, `/tasks/${group._id}/recipients`, 'POST', { mode: 'ADD', recipientMode: 'MULTIPLE', recipients: [String(outsider._id)], reason: 'Extend group' })).task;
      assert.equal(added.groupProgress.total, 3); assert.equal(added.initialRecipientSnapshot.length, 2);
      const removed = ok(await call(manager, `/tasks/${group._id}/recipients`, 'POST', { mode: 'REMOVE', recipients: [String(outsider._id)], reason: 'No longer required' })).task;
      assert.equal(removed.groupProgress.total, 2); assert.equal(removed.children.find((c) => c.assignee._id === String(outsider._id)).status, 'CANCELLED');
    });
    await t.test('inactive recipients and out-of-scope supervisor assignment denied', async () => {
      assert.equal((await call(manager, '/tasks', 'POST', { ...base, assignee: String(inactive._id) })).status, 403);
      assert.equal((await call(reviewer, '/tasks', 'POST', { ...base, assignee: String(outsider._id) })).status, 403);
    });
    await t.test('draft survives save and assignment with stable id; deadline reason audited', async () => {
      const notificationCount = await NotificationModel.countDocuments();
      const draft = ok(await call(manager, '/tasks', 'POST', { draft: true, title: '', draftData: { title: 'saved' } }), 201).task;
      assert.equal((await call(staff, `/tasks/${draft._id}`)).status, 404);
      ok(await call(manager, `/tasks/${draft._id}`, 'PATCH', { title: '', description: 'draft without a title', dueDate: '' }));
      assert.equal(await NotificationModel.countDocuments(), notificationCount);
      const blank = ok(await call(manager, '/tasks', 'POST', { draft: true, title: '' }), 201).task;
      ok(await call(manager, `/tasks/${blank._id}/status`, 'PATCH', { status: 'CANCELLED', reason: 'Cancel draft' }));
      assert.equal(ok(await call(manager, `/tasks/${blank._id}/status`, 'PATCH', { status: 'IN_PROGRESS', reason: 'Continue saved draft' })).task.status, 'DRAFT');
      const assigned = ok(await call(manager, `/tasks/${draft._id}`, 'PATCH', { ...base, assign: true, requireOutput: false })).task; assert.equal(assigned._id, draft._id); assert.equal(assigned.status, 'ASSIGNED');
      assert.equal((await call(manager, `/tasks/${draft._id}`, 'PATCH', { dueDate: '2026-11-03T10:00' })).status, 400);
      const changed = ok(await call(manager, `/tasks/${draft._id}`, 'PATCH', { dueDate: '2026-11-03T10:00', reason: 'Customer postponed' })).task;
      assert.ok(changed.history.at(-1).before.dueDate); assert.equal(changed.originalDueDate, assigned.dueDate);
    });
    let plan, maintenanceTask;
    await t.test('same maintenance occurrence creates exactly one task under concurrent requests', async () => {
      plan = await MaintenancePlanModel.create({ customerName: 'Test Customer', branch: 'Branch 1', contractReference: 'C-1', deviceDetails: 'Cameras', checklist: ['Check camera'], location: 'Branch', phone: '07000000000', maintenanceType: 'FREE', startDate: '2026-10-01', endDate: '2027-10-01', recurrenceType: 'MONTHLY', createdBy: manager._id, assignedEmployee: staff._id, scheduledVisits: [{ id: 'visit-1', sequence: 1, scheduledDate: '2026-11-01' }, { id: 'visit-2', sequence: 2, scheduledDate: '2026-12-01' }] });
      const body = { visits: [`${plan._id}:visit-1`], assignee: String(staff._id), reviewer: String(reviewer._id) };
      await Promise.all([call(manager, '/tasks/maintenance-due', 'POST', body), call(reviewer, '/tasks/maintenance-due', 'POST', body)]).then((r) => r.forEach((v) => ok(v, 201)));
      assert.equal(await TaskModel.countDocuments({ maintenanceKey: body.visits[0] }), 1);
      maintenanceTask = await TaskModel.findOne({ maintenanceKey: body.visits[0] });
      assert.equal(maintenanceTask.maintenanceSnapshot.contractReference, 'C-1'); assert.equal(maintenanceTask.checklist[0].text, 'Check camera'); assert.equal(maintenanceTask.execution.device, 'Cameras');
      assert.equal((await call(staff, `/maintenance-plans/${plan._id}/visits`, 'POST', { scheduledVisitId: 'visit-1', visitDate: '2026-11-01' })).status, 409);
      assert.equal((await MaintenancePlanModel.findById(plan._id)).scheduledVisits[0].completedAt, null);
    });
    await t.test('maintenance completion is recorded only after evidence submission and review', async () => {
      ok(await call(staff, `/tasks/${maintenanceTask._id}/status`, 'PATCH', { status: 'IN_PROGRESS' }));
      assert.equal((await call(staff, `/tasks/${maintenanceTask._id}/status`, 'PATCH', { status: 'SUBMITTED' })).status, 400);
      ok(await call(staff, `/tasks/${maintenanceTask._id}`, 'PATCH', { execution: { diagnosis: 'fault', actionTaken: 'fixed', testResult: 'pass', signatureUnavailableReason: 'customer away', workMinutes: 30, travelMinutes: 10 } }));
      ok(await call(staff, `/tasks/${maintenanceTask._id}/status`, 'PATCH', { status: 'SUBMITTED' }));
      assert.equal((await MaintenancePlanModel.findById(plan._id)).scheduledVisits[0].completedAt, null);
      ok(await call(reviewer, `/tasks/${maintenanceTask._id}/approve`, 'PATCH', {}));
      const updated = await MaintenancePlanModel.findById(plan._id); assert.ok(updated.scheduledVisits[0].completedAt); assert.equal(updated.nextVisitDate.toISOString().slice(0, 10), '2026-12-01'); assert.equal(updated.scheduledVisits[0].scheduledDate.toISOString().slice(0, 10), '2026-11-01');
      assert.equal(await MaintenanceVisitModel.countDocuments({ ticket: maintenanceTask._id }), 1);
      const pdf = await call(staff, `/maintenance-plans/visits/${(await TaskModel.findById(maintenanceTask._id)).maintenanceVisit}/pdf`);
      assert.equal(pdf.status, 200, JSON.stringify(pdf.data).slice(0, 200)); assert.ok(pdf.data.startsWith('%PDF')); assert.equal(pdf.headers['cache-control'], 'private, no-store');
      assert.equal((await call(outsider, `/maintenance-plans/visits/${(await TaskModel.findById(maintenanceTask._id)).maintenanceVisit}/pdf`)).status, 404);
    });
    await t.test('material request links to ticket while stock remains unchanged', async () => {
      const active = ok(await call(manager, '/tasks', 'POST', { ...base, requireOutput: false }), 201).task;
      const warehouse = await WarehouseModel.create({ name: 'Test warehouse', code: 'TEST-W' }), material = await MaterialModel.create({ name: 'Test cable', code: 'TEST-M' });
      await StockBalanceModel.create({ material: material._id, warehouse: warehouse._id, qtyOnHand: 10 });
      const result = ok(await call(staff, '/materials/requests', 'POST', { ticket: active._id, requestTarget: 'PROJECT', manualProjectName: 'Test project', warehouseId: String(warehouse._id), items: [{ materialId: String(material._id), requestedQty: 2 }] }), 201);
      assert.equal(String(result.request.ticket), active._id);
      const balance = await StockBalanceModel.findOne({ material: material._id }); assert.equal(balance.qtyOnHand, 10); assert.equal(balance.qtyReserved, 0);
      assert.equal((await call(outsider, '/materials/requests', 'POST', { ticket: active._id })).status, 404);
    });
    await t.test('scheduler reminders and recurring tasks are idempotent', async () => {
      const recurring = ok(await call(manager, '/tasks', 'POST', { ...base, requireOutput: false, dueDate: '2026-10-28T10:00', recurrence: { frequency: 'DAILY' } }), 201).task;
      const now = new Date('2026-10-29T08:00:00Z');
      await runTicketScheduler(now); const count = await NotificationModel.countDocuments(); await runTicketScheduler(now);
      const secondCount = await NotificationModel.countDocuments(); assert.ok(secondCount >= count); await runTicketScheduler(now); assert.equal(await NotificationModel.countDocuments(), secondCount); assert.equal(await TaskModel.countDocuments({ recurrenceKey: `${recurring._id}:2026-10-29T07:00:00.000Z` }), 1);
      assert.equal(await MaintenanceVisitModel.countDocuments({ ticket: maintenanceTask._id }), 1);
    });
    await t.test('repair report and customer evaluation reuse the approved ticket and enforce access', async () => {
      const repair = ok(await call(manager, '/tasks', 'POST', { ...base, ticketType: 'REPAIR', requireOutput: false, execution: { contactPhone: '07000000000', location: 'Test site', diagnosis: 'fault', actionTaken: 'fixed', testResult: 'pass', signatureUnavailableReason: 'customer absent' } }), 201).task;
      ok(await call(staff, `/tasks/${repair._id}/status`, 'PATCH', { status: 'IN_PROGRESS' })); ok(await call(staff, `/tasks/${repair._id}/status`, 'PATCH', { status: 'SUBMITTED' }));
      const approved = ok(await call(reviewer, `/tasks/${repair._id}/approve`, 'PATCH', {})).task;
      assert.ok(approved.maintenanceReport);
      const report = ok(await call(staff, `/maintenance-reports/${approved.maintenanceReport}`)).report;
      assert.equal(report.performedActions[0], 'fixed'); assert.equal(report.status, 'APPROVED');
      const pdf = await call(staff, `/maintenance-reports/${approved.maintenanceReport}/pdf`);
      assert.equal(pdf.status, 200, JSON.stringify(pdf.data).slice(0, 200)); assert.ok(pdf.data.startsWith('%PDF')); assert.equal(pdf.headers['cache-control'], 'private, no-store');
      assert.ok((await fs.readdir(path.join(privatePath, 'ticket-reports'))).some((name) => name.endsWith('.pdf')));
      assert.equal((await call(outsider, `/maintenance-reports/${approved.maintenanceReport}`)).status, 404);
      assert.equal((await call(staff, `/maintenance-reports/${approved.maintenanceReport}/complete`, 'PATCH', {})).status, 409);
      const link = ok(await call(manager, '/customer-evaluations/links', 'POST', { sourceType: 'TASK', sourceId: repair._id }), 201);
      assert.equal(String(link.evaluation.source.sourceId), repair._id); assert.ok(link.url);
      assert.equal((await call(staff, `/tasks/${repair._id}/status`, 'PATCH', { status: 'IN_PROGRESS', reason: 'Reopen' })).status, 403);
      const pointsBefore = (await UserModel.findById(staff._id)).pointsTotal;
      ok(await call(manager, `/tasks/${repair._id}/status`, 'PATCH', { status: 'IN_PROGRESS', reason: 'Correct report details' }));
      ok(await call(staff, `/tasks/${repair._id}`, 'PATCH', { execution: { actionTaken: 'corrected repair action' } }));
      ok(await call(staff, `/tasks/${repair._id}/status`, 'PATCH', { status: 'SUBMITTED' }));
      const revised = ok(await call(reviewer, `/tasks/${repair._id}/approve`, 'PATCH', {})).task;
      assert.equal(revised.submissions.length, 2); assert.equal(revised.maintenanceReport, approved.maintenanceReport);
      assert.equal(ok(await call(staff, `/maintenance-reports/${approved.maintenanceReport}`)).report.performedActions[0], 'corrected repair action');
      assert.equal((await UserModel.findById(staff._id)).pointsTotal, pointsBefore);
    });
    await t.test('optional automatic maintenance respects configured reviewer and stable occurrence', async () => {
      const config = ok(await call(manager, '/tasks/metadata')).settings;
      ok(await call(manager, '/tasks/settings', 'PUT', { ...config, autoMaintenance: true, daysBeforeDue: 90, defaultReviewer: String(reviewer._id) }));
      await runTicketScheduler(new Date('2026-11-02T08:00:00Z')); await runTicketScheduler(new Date('2026-11-02T08:00:00Z'));
      assert.equal(await TaskModel.countDocuments({ maintenanceKey: `${plan._id}:visit-2` }), 1);
      assert.equal((await MaintenancePlanModel.findById(plan._id)).scheduledVisits[1].completedAt, null);
    });
    await t.test('legacy ids, statuses, project references and approval trail remain usable', async () => {
      const legacyId = new mongoose.Types.ObjectId(), project = new mongoose.Types.ObjectId();
      await TaskModel.collection.insertOne({ _id: legacyId, title: 'Legacy task', assignee: staff._id, assignedBy: manager._id, project, status: 'TODO', dueDate: new Date('2026-12-01'), approvalTrail: [] });
      const legacy = ok(await call(staff, `/tasks/${legacyId}`)).task; assert.equal(legacy._id, String(legacyId)); assert.equal(legacy.status, 'TODO');
      ok(await call(staff, `/tasks/${legacyId}/status`, 'PATCH', { status: 'IN_PROGRESS' })); assert.equal(String((await TaskModel.findById(legacyId)).project), String(project));
    });
    await t.test('additive migration and rollback preserve legacy records and protect edited rows', async () => {
      const { execFile } = await import('node:child_process'), { promisify } = await import('node:util');
      const execute = promisify(execFile), legacy = await TaskModel.collection.findOne({ title: 'Legacy task' });
      const dry = await execute(process.execPath, ['scripts/migrate-tickets.js']); assert.equal(JSON.parse(dry.stdout.trim()).legacyTasks, 1);
      const applied = JSON.parse((await execute(process.execPath, ['scripts/migrate-tickets.js', '--apply'])).stdout.trim()); assert.equal(applied.migrated, 1);
      const current = await TaskModel.collection.findOne({ _id: legacy._id }); assert.equal(String(current.project), String(legacy.project)); assert.equal(current.status, legacy.status); assert.ok(current.ticketNumber);
      const rolled = JSON.parse((await execute(process.execPath, ['scripts/migrate-tickets.js', '--rollback', applied.journal])).stdout.trim()); assert.equal(rolled.restored, 1);
      assert.equal((await TaskModel.collection.findOne({ _id: legacy._id })).ticketNumber, undefined);
      const again = JSON.parse((await execute(process.execPath, ['scripts/migrate-tickets.js', '--apply'])).stdout.trim());
      await TaskModel.updateOne({ _id: legacy._id }, { $inc: { revision: 1 } });
      assert.equal(JSON.parse((await execute(process.execPath, ['scripts/migrate-tickets.js', '--rollback', again.journal])).stdout.trim()).skipped, 1);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    assert.equal(mongoose.connection.name, databaseName); assert.match(databaseName, /^delta_ticket_test_[a-f0-9]{32}$/);
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
    const resolved = path.resolve(privatePath); assert.ok(resolved.startsWith(testRoot + path.sep) && path.basename(resolved).startsWith('uploads-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
