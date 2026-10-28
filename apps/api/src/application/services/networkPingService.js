import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { normalizeIpv4 } from './networkDocsService.js';
import { AppError } from '../../shared/errors.js';

const executeFile = promisify(execFile);
const inFlight = new Map();

export const pingNetworkAddress = async (address, { platform = process.platform, execute = executeFile } = {}) => {
  const target = normalizeIpv4(address);
  const windows = platform === 'win32';
  const command = windows ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'PING.EXE') : 'ping';
  const args = windows ? ['-4', '-n', '2', '-w', '1000', target] : ['-n', '-c', '2', '-W', platform === 'darwin' ? '1000' : '1', target];
  let stdout = '', timedOut = false;
  try {
    const result = await execute(command, args, { timeout: 7000, maxBuffer: 32768, windowsHide: true, shell: false, env: { ...process.env, LANG: 'C', LC_ALL: 'C' } });
    stdout = String(result.stdout || '');
  } catch (err) {
    if (['ENOENT', 'EACCES', 'EPERM'].includes(err.code) || (!windows && err.code === 2)) throw new AppError('تعذر تشغيل فحص Ping على خادم النظام', 503);
    stdout = String(err.stdout || ''); timedOut = !!err.killed;
    if (!timedOut && typeof err.code !== 'number') throw new AppError('تعذر إكمال فحص Ping', 503);
  }
  // A reply with TTL is successful; "destination unreachable" is not.
  const replies = stdout.split(/\r?\n/).filter((line) => /\bttl\s*[=:]\s*\d+/i.test(line));
  const timing = replies.map((line) => line.match(/([=<])\s*(\d+(?:[.,]\d+)?)\s*ms\b/i)).find(Boolean);
  return { target, reachable: replies.length > 0, sentPackets: 2, receivedPackets: Math.min(2, replies.length),
    roundTripMs: timing ? Number(timing[2].replace(',', '.')) : null, lessThan: timing?.[1] === '<', timedOut,
    checkedAt: new Date().toISOString(), source: 'SERVER' };
};

export const pingStoredNetworkAddress = (address) => {
  const target = normalizeIpv4(address);
  if (inFlight.has(target)) return inFlight.get(target);
  if (inFlight.size >= 4) throw new AppError('توجد فحوصات Ping جارية؛ أعد المحاولة بعد لحظات', 429);
  const pending = pingNetworkAddress(target).finally(() => inFlight.delete(target));
  inFlight.set(target, pending); return pending;
};
