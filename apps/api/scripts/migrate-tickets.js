// Additive, resumable backfill. Existing task ids, statuses and references never change.
// Dry run is the default. Rollback refuses records changed by the workflow meanwhile.
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { env } from '../src/config/env.js';
import { TaskModel } from '../src/infrastructure/db/models/TaskModel.js';
import { CounterModel } from '../src/infrastructure/db/models/CounterModel.js';

async function run() {
  await mongoose.connect(env.mongoUri);
  try {
    const rollbackAt = process.argv.indexOf('--rollback');
    if (rollbackAt >= 0) {
      const journal = process.argv[rollbackAt + 1];
      if (!journal) throw new Error('Provide the journal path after --rollback');
      let restored = 0, skipped = 0;
      for (const line of (await fs.readFile(path.resolve(journal), 'utf8')).split('\n').filter(Boolean)) {
        const entry = JSON.parse(line);
        if (entry.database !== mongoose.connection.name) throw new Error('Journal database does not match the connected database');
        const result = await TaskModel.collection.updateOne({ _id: new mongoose.Types.ObjectId(entry.id), ticketNumber: entry.ticketNumber, $expr: { $eq: [{ $ifNull: ['$revision', 0] }, entry.revision] } }, { $unset: Object.fromEntries(entry.addedFields.map((key) => [key, ''])) });
        result.modifiedCount ? restored++ : skipped++;
      }
      console.log(JSON.stringify({ restored, skipped, note: 'Changed records are preserved; counters intentionally retain their sequence.' }));
      return;
    }
    const filter = { ticketNumber: { $exists: false } };
    const count = await TaskModel.collection.countDocuments(filter);
    if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ mode: 'dry-run', legacyTasks: count, changes: 'Only add ticketNumber, schemaVersion and originalDueDate when missing. Existing ids/statuses/approvals/files remain untouched.' })); return; }
    await TaskModel.init();
    const dir = path.resolve(env.privateUploadsDir, 'migrations');
    await fs.mkdir(dir, { recursive: true });
    const journal = path.join(dir, `tickets-${Date.now()}-${randomUUID()}.jsonl`);
    await fs.writeFile(journal, '', { flag: 'wx' });
    let migrated = 0;
    for await (const task of TaskModel.collection.find(filter)) {
      const year = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Baghdad', year: 'numeric' }).format(new Date());
      const counter = await CounterModel.findOneAndUpdate({ _id: `ticket-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
      const ticketNumber = `TK-${year}-${String(counter.seq).padStart(5, '0')}`, added = { ticketNumber };
      if (!Object.hasOwn(task, 'schemaVersion')) added.schemaVersion = 2;
      if (!Object.hasOwn(task, 'originalDueDate') && task.dueDate) added.originalDueDate = task.dueDate;
      const entry = { database: mongoose.connection.name, id: String(task._id), revision: task.revision || 0, ticketNumber, addedFields: Object.keys(added) };
      // Journal is durable before the database write, so an interrupted run is reversible.
      await fs.appendFile(journal, `${JSON.stringify(entry)}\n`);
      const result = await TaskModel.collection.updateOne({ _id: task._id, ticketNumber: { $exists: false }, $expr: { $eq: [{ $ifNull: ['$revision', 0] }, task.revision || 0] } }, { $set: added });
      migrated += result.modifiedCount;
    }
    console.log(JSON.stringify({ migrated, journal, note: 'Back up this private journal. Do not publish it.' }));
  } finally { await mongoose.disconnect(); }
}
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
