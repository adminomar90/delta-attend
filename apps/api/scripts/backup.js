import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve(__dirname, '..', 'backups', timestamp);
fs.mkdirSync(outputDir, { recursive: true });

const command = spawn('mongodump', ['--uri', env.mongoUri, '--out', outputDir], {
  stdio: 'inherit',
  shell: true,
});

command.on('close', (code) => {
  if (code === 0) {
    console.log(`Backup completed: ${outputDir}`);
    process.exit(0);
  }

  console.error(`Backup failed with code ${code}`);
  process.exit(code || 1);
});
