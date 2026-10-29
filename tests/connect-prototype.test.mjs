import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONNECT, ConnectProbe, callbackCode, createLogin, createProofKey, exchangeCode, freshCredentials, managedOrigin, saveCredentials } from '../bridge/connect-prototype.mjs';

const sha = value => createHash('sha256').update(value).digest('base64url');
const decode = value => JSON.parse(Buffer.from(value, 'base64url').toString());
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const token = (access_token, scope, token_type = 'DPoP') => ({ access_token, scope, token_type, expires_in: 1800 });
function verifyProof(proof, method, url, accessToken) {
  const [header, payload, signature] = proof.split('.'); const h = decode(header); const p = decode(payload);
  assert.equal(h.typ, 'dpop+jwt'); assert.equal(h.alg, 'ES256'); assert.equal(h.jwk.d, undefined);
  const target = new URL(url); target.search = ''; target.hash = '';
  assert.equal(p.htm, method); assert.equal(p.htu, target.href);
  assert.equal(p.ath, accessToken ? sha(accessToken) : undefined);
  assert.ok(verify('sha256', Buffer.from(`${header}.${payload}`), {
    key: createPublicKey({ key: h.jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363',
  }, Buffer.from(signature, 'base64url')));
  return { h, p };
}

test('PKCE and callbacks require the exact loopback host, state, path, method, and one code', () => {
  const login = createLogin(); const params = new URLSearchParams(new URL(login.url).hash.slice(1));
  assert.equal(params.get('challenge'), sha(login.verifier)); assert.equal(params.get('state'), login.state);
  assert.notEqual(createLogin().state, login.state); assert.ok(!login.url.includes(login.verifier));
  const req = { method: 'GET', headers: { host: '127.0.0.1:34338' }, url: `/callback?state=${login.state}&code=synthetic` };
  assert.equal(callbackCode(req, login.state), 'synthetic');
  for (const change of [
    { method: 'POST' }, { headers: { host: 'attacker.example' } }, { url: '/callback?state=wrong&code=x' },
    { url: req.url + '&state=duplicate' }, { url: req.url + '&code=duplicate' },
    { url: req.url.replace('/callback', '/other') }, { url: req.url + '&error=access_denied' },
    { url: `/callback?state=${login.state}` },
  ]) assert.throws(() => callbackCode({ ...req, ...change }, login.state));
});

test('DPoP signatures bind the method, origin, key, and access token with unique proofs', () => {
  const key = createProofKey(); const url = 'https://environment.example/api/shell?cursor=private#hash';
  let previous;
  for (let i = 0; i < 32; i++) {
    const proof = key.proof('get', url, 'synthetic-access');
    const { h, p } = verifyProof(proof, 'GET', url, 'synthetic-access');
    assert.notEqual(p.jti, previous); previous = p.jti;
    const { crv, kty, x, y } = h.jwk;
    assert.equal(key.thumbprint, sha(JSON.stringify({ crv, kty, x, y })));
    const s = BigInt('0x' + Buffer.from(proof.split('.')[2], 'base64url').subarray(32).toString('hex'));
    assert.ok(s <= 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n / 2n);
  }
});

test('OAuth exchanges use the public client, persist refresh rotation, and redact failures', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    assert.equal(url, CONNECT.token); assert.equal(options.redirect, 'error');
    const body = Object.fromEntries(options.body); calls.push(body);
    assert.equal(body.client_id, CONNECT.clientId); assert.equal(body.client_secret, undefined);
    return response({ ...token('synthetic-access', undefined, 'Bearer'), refresh_token: `refresh-${calls.length}` });
  };
  const initial = await exchangeCode('synthetic-code', 'synthetic-verifier', fetcher);
  assert.equal(calls[0].code_verifier, 'synthetic-verifier'); assert.equal(calls[0].redirect_uri, CONNECT.callback);
  assert.equal(await freshCredentials(initial, fetcher), initial); assert.equal(calls.length, 1);
  const refreshed = await freshCredentials({ ...initial, expiresAt: 0 }, fetcher);
  assert.equal(calls[1].refresh_token, 'refresh-1'); assert.equal(refreshed.refreshToken, 'refresh-2');
  await assert.rejects(exchangeCode('secret', 'secret', async () => response({ error: 'SECRET RAW BODY' }, 401)), /HTTP 401/);
  await assert.rejects(exchangeCode('secret', 'secret', async () => { throw new Error('SECRET URL'); }), error => !error.message.includes('SECRET'));
});

test('prototype credentials are private and do not replace sibling bridge files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quest-connect-'));
  try {
    const bridge = join(dir, 'bridge-token'); const path = join(dir, 'connect-prototype', 'credentials.json');
    await saveCredentials(bridge, { token: 'working' });
    await saveCredentials(path, { token: 'first' }); await saveCredentials(path, { token: 'rotated' });
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await stat(join(dir, 'connect-prototype'))).mode & 0o777, 0o700);
    assert.deepEqual(JSON.parse(await readFile(bridge, 'utf8')), { token: 'working' });
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { token: 'rotated' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

function syntheticRelay({ mismatch = false, wrongScope = false } = {}) {
  const environments = ['one', 'two'].map(environmentId => ({ environmentId, label: `Machine ${environmentId}` }));
  const requests = [];
  const fetcher = async (url, options) => {
    const u = new URL(url); const method = options.method || 'GET';
    requests.push({ url, method }); assert.equal(options.redirect, 'error');
    if (u.pathname === '/v1/environments') {
      assert.equal(options.headers.authorization, 'Bearer synthetic-clerk');
      return response({ environments });
    }
    if (u.pathname === '/v1/client/dpop-token') {
      verifyProof(options.headers.dpop, 'POST', url);
      assert.equal(options.body.get('client_id'), 't3-web');
      return response(token('synthetic-relay', 'environment:connect environment:status'));
    }
    if (u.pathname.endsWith('/connect')) {
      verifyProof(options.headers.dpop, 'POST', url, 'synthetic-relay');
      const environmentId = u.pathname.split('/')[3];
      return response({ environmentId, endpoint: { httpBaseUrl: `https://${environmentId}.example` }, credential: 'synthetic-bootstrap' });
    }
    const id = u.hostname.split('.')[0];
    if (u.pathname === '/.well-known/t3/environment') return response({ environmentId: mismatch ? 'other' : id });
    if (u.pathname === '/oauth/token') {
      verifyProof(options.headers.dpop, 'POST', url);
      assert.equal(options.body.get('scope'), 'orchestration:read');
      assert.equal(options.body.get('client_label'), 'T3 Quest Connect prototype');
      return response(token('synthetic-environment', wrongScope ? 'orchestration:read orchestration:operate' : 'orchestration:read'));
    }
    verifyProof(options.headers.dpop, 'GET', url, 'synthetic-environment');
    assert.equal(options.headers['x-t3-orchestration-protocol'], '2');
    if (u.pathname === '/api/orchestration/shell') return response({ threads: [{ id: 'same-id' }], projects: [] });
    if (u.pathname === '/api/orchestration/threads/same-id/bounded') return response({ projection: { thread: { id: 'same-id' }, visibleTurnItems: [{ item: { type: 'assistant_message', text: 'Private content not in report' } }] } });
    assert.fail(`Unexpected request ${method} ${u.pathname}`);
  };
  return { requests, fetcher };
}

test('two environments retain identity, prove read access, and do not expose conversation content', async () => {
  const mock = syntheticRelay(); const probe = new ConnectProbe('synthetic-clerk', mock.fetcher);
  const environments = await probe.environments(); const reports = [];
  for (const environment of environments) reports.push(await probe.inspect(environment));
  assert.deepEqual(reports.map(r => [r.environmentId, r.threads, r.historyItems]), [['one', 1, 1], ['two', 1, 1]]);
  assert.ok(!JSON.stringify(reports).includes('Private content'));
  assert.equal(mock.requests.filter(r => r.url.endsWith('/v1/client/dpop-token')).length, 1);
  assert.ok(mock.requests.every(r => r.method === 'GET' || /\/(dpop-token|connect|token)$/.test(new URL(r.url).pathname)));
  await assert.rejects(probe.read({ origin: 'https://one.example' }, '/api/orchestration/commands'), /only reads/);
});

test('mismatched environment identities and broader scopes fail closed', async () => {
  for (const opts of [{ mismatch: true }, { wrongScope: true }]) {
    const mock = syntheticRelay(opts); const probe = new ConnectProbe('synthetic-clerk', mock.fetcher);
    await assert.rejects(probe.inspect({ environmentId: 'one', label: 'Machine one' }), /identity mismatch|unexpected scopes/);
    assert.ok(!mock.requests.some(r => r.url.includes('/api/orchestration')));
    if (opts.mismatch) assert.ok(!mock.requests.some(r => r.url === 'https://one.example/oauth/token'));
  }
});

test('managed endpoints reject insecure URLs and credential-bearing or local origins', () => {
  for (const value of ['http://a.example', 'https://user:secret@a.example', 'https://localhost', 'https://127.0.0.1', 'https://a.local', 'https://a.example/path', 'https://a.example?token=secret']) {
    assert.throws(() => managedOrigin({ httpBaseUrl: value }));
  }
  assert.equal(managedOrigin({ httpBaseUrl: 'https://env.example/' }), 'https://env.example');
});

test('CLI discovery success does not imply relay connection authorization', async () => {
  const calls = [];
  const probe = new ConnectProbe('synthetic-clerk-oauth', async (url) => {
    calls.push(url);
    if (url.endsWith('/v1/environments')) return response({ environments: [{ environmentId: 'one', label: 'Machine one' }] });
    return response({ code: 'auth_invalid', reason: 'invalid_bearer', description: 'SENSITIVE diagnostic' }, 401);
  });
  const environments = await probe.environments(); assert.equal(environments.length, 1);
  await assert.rejects(probe.inspect(environments[0]), error => {
    assert.equal(error.reason, 'invalid_bearer');
    assert.match(error.message, /relay token exchange.*HTTP 401/);
    assert.ok(!error.message.includes('SENSITIVE')); return true;
  });
  assert.equal(calls.length, 2);
});
