import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectionCandidates, selectDevice, transferConnection } from '../scripts/connect-quest.mjs';
import { loadBridgeToken } from '../bridge/server.mjs';

test('USB setup refuses missing, unauthorized, and ambiguous devices', () => {
  assert.equal(selectDevice('List of devices attached\nquest-123\tdevice\n'), 'quest-123');
  assert.throws(() => selectDevice('quest-123\tunauthorized\n'), /USB debugging/);
  assert.throws(() => selectDevice('List of devices attached\n'), /Connect Quest/);
  assert.throws(() => selectDevice('quest-123\tdevice\nphone-456\tdevice\n'), /More than one/);
});

test('Wi-Fi choices exclude localhost and IPv6 but retain interface names', () => {
  assert.deepEqual(connectionCandidates({
    lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    en0: [{ family: 'IPv4', internal: false, address: '192.168.1.12' }, { family: 'IPv6', internal: false, address: '::1' }],
  }), [{ name: 'en0', address: '192.168.1.12' }]);
});

test('USB transfer keeps credentials off process arguments and launches only after writing', async () => {
  const config = { bridgeUrl: 'http://192.168.1.12:8787', bridgeToken: 'sensitive-test-value' };
  const calls = [];
  await transferConnection('adb', 'quest-123', config, async (...args) => { calls.push(args); });
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0][2]), config);
  assert.ok(calls[0][1].includes('run-as'));
  assert.ok(!JSON.stringify(calls.map(call => call[1])).includes(config.bridgeToken));
  assert.ok(calls[1][1].includes('com.oculus.intent.category.OVERLAY_LAUNCHER'));
  let attempts = 0;
  await assert.rejects(transferConnection('adb', 'quest-123', config, async () => { attempts++; throw new Error('Write failed'); }), /Write failed/);
  assert.equal(attempts, 1);
});

test('bridge token persists across setup and server restarts with private permissions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-quest-setup-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await loadBridgeToken(directory);
  assert.match(first, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(await loadBridgeToken(directory), first);
  assert.equal((await readFile(join(directory, 'bridge-token'), 'utf8')).trim(), first);
  assert.equal((await stat(join(directory, 'bridge-token'))).mode & 0o777, 0o600);
});
