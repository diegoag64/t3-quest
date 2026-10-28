import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangePairing, normalizeOrigin, parsePairingUrl, readShell, ThreadMonitor } from '../bridge/t3.mjs';

const snapshot = threads => ({ projects: [{ id: 'p', title: 'Example' }], threads });
const thread = (status, extras = {}) => ({ id: 't', title: 'Fix tests', projectId: 'p', latestRunId: 'run1', status, ...extras });

test('direct and hosted pairing URLs preserve the target and fragment credential', () => {
  assert.deepEqual(parsePairingUrl('http://127.0.0.1:3773/#token=one-time'), { origin: 'http://127.0.0.1:3773', credential: 'one-time' });
  assert.deepEqual(parsePairingUrl('https://app.t3.codes/pair?host=wss%3A%2F%2Fmac.tailnet.ts.net%2Fws#token=one-time'), { origin: 'https://mac.tailnet.ts.net', credential: 'one-time' });
  assert.throws(() => parsePairingUrl('https://app.t3.codes'), /No pairing token/);
  assert.throws(() => normalizeOrigin('http://public.example'), /HTTPS/);
  assert.throws(() => normalizeOrigin('https://user:secret@example.com'), /embedded/);
});

test('pairing requests only read scope and exchanges a code without putting it in the URL', async () => {
  const result = await exchangePairing('http://127.0.0.1:3773/#token=single-use', async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:3773/oauth/token');
    assert.equal(options.body.get('scope'), 'orchestration:read');
    assert.equal(options.body.get('subject_token'), 'single-use');
    assert.equal(options.redirect, 'error');
    return Response.json({ access_token: 'test-session', token_type: 'Bearer' });
  });
  assert.equal(result.token, 'test-session');
  await assert.rejects(exchangePairing('http://127.0.0.1/#token=x', async () => Response.json({ access_token: 'x', token_type: 'DPoP' })), /DPoP/);
});

test('snapshot request uses the protocol header and bearer session', async () => {
  const result = await readShell({ origin: 'http://127.0.0.1:3773', token: 'test-token' }, async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:3773/api/orchestration/shell');
    assert.equal(options.headers['x-t3-orchestration-protocol'], '2');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.redirect, 'error');
    return Response.json(snapshot([]));
  });
  assert.deepEqual(result.threads, []);
  await assert.rejects(readShell({ origin: 'http://127.0.0.1', token: 'x' }, async () => new Response('', { status: 401 })), /pair again/);
  await assert.rejects(readShell({ origin: 'http://127.0.0.1', token: 'x' }, async () => Response.json({})), /Unsupported T3/);
});

test('completion alerts ignore history and deduplicate repeated snapshots', () => {
  const monitor = new ThreadMonitor();
  monitor.apply(snapshot([thread('completed')]));
  assert.equal(monitor.events.length, 0);
  monitor.apply(snapshot([thread('running', { latestRunId: 'run2' })]));
  monitor.apply(snapshot([thread('completed', { latestRunId: 'run2' })]));
  monitor.apply(snapshot([thread('completed', { latestRunId: 'run2' })]));
  assert.equal(monitor.events.length, 1);
  assert.equal(monitor.events[0].message, 'Thread finished');
});

test('a new completed run between polls still generates an alert', () => {
  const monitor = new ThreadMonitor();
  monitor.apply(snapshot([thread('completed')]));
  monitor.apply(snapshot([thread('completed', { latestRunId: 'run2' })]));
  assert.equal(monitor.events.length, 1);
});

test('questions, failures, and pending work are distinct from successful completion', () => {
  const monitor = new ThreadMonitor();
  monitor.apply(snapshot([thread('running')]));
  monitor.apply(snapshot([thread('waiting', { pendingRuntimeRequest: { id: 'q1' } })]));
  monitor.apply(snapshot([thread('waiting', { pendingRuntimeRequest: { id: 'q1' } })]));
  assert.equal(monitor.events.length, 1);
  assert.equal(monitor.threads[0].status, 'needs-you');
  monitor.apply(snapshot([thread('completed', { pendingBackgroundTasks: [{}] })]));
  assert.equal(monitor.threads[0].status, 'waiting');
  assert.equal(monitor.events.length, 1);
  monitor.apply(snapshot([thread('failed')]));
  assert.equal(monitor.events.at(-1).message, 'Thread failed');
  monitor.apply(snapshot([thread('interrupted')]));
  assert.equal(monitor.events.length, 2);
});

test('deleted, archived, and settled threads are excluded', () => {
  const monitor = new ThreadMonitor();
  monitor.apply(snapshot([thread('idle', { deletedAt: '2026-01-01' }), thread('idle', { archivedAt: '2026-01-01' }), thread('idle', { settledAt: '2026-01-01' })]));
  assert.deepEqual(monitor.threads, []);
});

test('desktop pairing links require an explicit host when none is included', () => {
  const link = 't3code://app/pair#token=test-code';
  assert.throws(() => parsePairingUrl(link), error => error.code === 'T3_HOST_REQUIRED' && !error.message.includes('test-code'));
  assert.deepEqual(parsePairingUrl(link, 'http://127.0.0.1:3773'), { origin: 'http://127.0.0.1:3773', credential: 'test-code' });
  assert.deepEqual(parsePairingUrl('t3code://app/pair?host=http%3A%2F%2F192.168.1.20%3A3773#token=test-code'), { origin: 'http://192.168.1.20:3773', credential: 'test-code' });
  assert.throws(() => parsePairingUrl('t3code://other/pair#token=test-code', 'http://localhost:3773'), /Unsupported T3 desktop link/);
  assert.throws(() => parsePairingUrl('ftp://example.com/#token=test-code'), /scheme/);
  assert.throws(() => parsePairingUrl('not a url'), /Invalid pairing URL/);
  assert.equal(parsePairingUrl('http://127.0.0.1:3773/pair#token=x', 'https://unrelated.example').origin, 'http://127.0.0.1:3773');
});

test('desktop token exchange uses the explicit host and distinguishes network failure', async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:3773/oauth/token');
    assert.equal(options.body.get('subject_token'), 'test-code');
    assert.equal(options.body.get('scope'), 'orchestration:read');
    return Response.json({ access_token: 'test-session', token_type: 'Bearer' });
  };
  await assert.rejects(exchangePairing('t3code://app/pair#token=test-code', fetcher), error => error.code === 'T3_HOST_REQUIRED');
  assert.equal(calls, 0);
  const session = await exchangePairing('t3code://app/pair#token=test-code', fetcher, 'http://127.0.0.1:3773');
  assert.equal(session.origin, 'http://127.0.0.1:3773');
  assert.equal(calls, 1);
  await assert.rejects(exchangePairing('http://127.0.0.1:3773/pair#token=test-code', async () => { throw new TypeError('fetch failed'); }), /Cannot reach T3 at http:\/\/127.0.0.1:3773/);
});
