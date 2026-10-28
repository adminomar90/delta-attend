import test from 'node:test';
import assert from 'node:assert/strict';
import { pingNetworkAddress } from '../src/application/services/networkPingService.js';

test('Windows Ping runs a fixed executable with validated address and parses successful replies', async () => {
  const result = await pingNetworkAddress('10.20.20.5', { platform: 'win32', execute: async (command, args, options) => {
    assert.match(command, /PING\.EXE$/); assert.deepEqual(args, ['-4', '-n', '2', '-w', '1000', '10.20.20.5']);
    assert.equal(options.shell, false); assert.equal(options.windowsHide, true); assert.equal(options.timeout, 7000);
    return { stdout: 'Reply from 10.20.20.5: bytes=32 time<1ms TTL=64\r\nReply from 10.20.20.5: bytes=32 time=2ms TTL=64' };
  } });
  assert.equal(result.reachable, true); assert.equal(result.receivedPackets, 2); assert.equal(result.roundTripMs, 1); assert.equal(result.lessThan, true);
});

test('Linux Ping parses latency and does not mistake an unreachable router response for success', async () => {
  const result = await pingNetworkAddress('10.0.0.2', { platform: 'linux', execute: async (_, args) => { assert.deepEqual(args, ['-n', '-c', '2', '-W', '1', '10.0.0.2']); return { stdout: '64 bytes from 10.0.0.2: icmp_seq=1 ttl=64 time=0.345 ms' }; } });
  assert.equal(result.reachable, true); assert.equal(result.roundTripMs, 0.345);
  const unavailable = await pingNetworkAddress('10.0.0.2', { execute: async () => { throw { code: 1, stdout: 'Reply from 10.0.0.1: Destination host unreachable.' }; } });
  assert.equal(unavailable.reachable, false); assert.equal(unavailable.receivedPackets, 0); assert.equal(unavailable.roundTripMs, null);
});

test('invalid destinations never execute and missing Ping is a service error', async () => {
  for (const address of ['10.0.0.1; whoami', '-t 10.0.0.1', 'example.com', '999.2.3.4']) await assert.rejects(pingNetworkAddress(address, { execute: async () => assert.fail('must validate before executing') }), { statusCode: 400 });
  await assert.rejects(pingNetworkAddress('127.0.0.1', { execute: async () => { throw { code: 'ENOENT' }; } }), { statusCode: 503 });
});
