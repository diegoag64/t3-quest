// Independent, read-only probe of the public T3 Connect protocol. No desktop profile access.
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Public source-build configuration from pingdotgg/t3code/.env.example.
export const CONNECT = Object.freeze({
  relay: 'https://relay.t3.codes', token: 'https://clerk.t3.codes/oauth/token',
  clientId: 'hzxSgY2cH10sDU2r', callback: 'http://127.0.0.1:34338/callback', port: 34338,
});
const exchangeGrant = 'urn:ietf:params:oauth:grant-type:token-exchange';
const accessType = 'urn:ietf:params:oauth:token-type:access_token';
const relayScope = 'environment:connect environment:status';
const hash = value => createHash('sha256').update(value).digest('base64url');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export class ConnectError extends Error {}

export function createLogin() {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const url = new URL('https://app.t3.codes/connect');
  url.hash = new URLSearchParams({ state, challenge: hash(verifier), port: String(CONNECT.port) });
  return { verifier, state, url: url.href };
}

export function callbackCode(request, expectedState) {
  if (request.method !== 'GET' || request.headers.host !== `127.0.0.1:${CONNECT.port}`) {
    throw new ConnectError('Invalid callback host or method.');
  }
  const url = new URL(request.url, CONNECT.callback);
  if (url.origin !== new URL(CONNECT.callback).origin || url.pathname !== '/callback') {
    throw new ConnectError('Invalid callback path.');
  }
  const state = url.searchParams.getAll('state');
  const actual = Buffer.from(state[0] || ''); const expected = Buffer.from(expectedState);
  if (state.length !== 1 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ConnectError('Invalid sign-in state.');
  }
  if (url.searchParams.has('error')) throw new ConnectError('Sign-in was not approved.');
  const codes = url.searchParams.getAll('code');
  if (codes.length !== 1 || !codes[0] || codes[0].length > 8192) throw new ConnectError('Missing sign-in code.');
  return codes[0];
}

export async function waitForLogin(login, { timeoutMs = 600_000, onReady = () => {}, exchange = exchangeCode } = {}) {
  let timer;
  const server = createServer();
  try {
    return await new Promise((resolve, reject) => {
      let consumed = false;
      server.on('error', () => reject(new ConnectError('Cannot open the sign-in callback on port 34338.')));
      server.on('request', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
        let code;
        try { code = callbackCode(req, login.state); }
        catch { res.writeHead(400); res.end('Sign-in callback rejected. Return to the sign-in page.'); return; }
        if (consumed) { res.writeHead(409); res.end('Sign-in already received.'); return; }
        consumed = true;
        try {
          const credentials = await exchange(code, login.verifier);
          res.end('T3 Quest Connect prototype signed in. You can close this tab. The current Quest connection is unchanged.', () => resolve(credentials));
        } catch (error) { res.writeHead(502); res.end('Sign-in exchange failed. Check the prototype terminal.'); reject(error); }
      });
      server.listen(CONNECT.port, '127.0.0.1', () => {
        timer = setTimeout(() => reject(new ConnectError('Sign-in timed out. Run login again.')), timeoutMs);
        try { onReady(login.url); } catch { reject(new ConnectError('Could not open sign-in.')); }
      });
    });
  } finally {
    clearTimeout(timer); server.close(); server.closeAllConnections();
  }
}

async function jsonRequest(url, options, fetcher, stage = 'request') {
  try {
    const response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20_000) });
    // Never include remote error bodies, credentials, or conversation text in diagnostics.
    const reader = response.body.getReader(); const parts = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 24_000_000) throw new ConnectError('T3 Connect response exceeds the prototype limit.');
        parts.push(value);
      }
    } finally { await reader.cancel(); }
    const text = Buffer.concat(parts).toString();
    if (!response.ok) {
      const error = new ConnectError(`T3 Connect ${stage} failed (HTTP ${response.status}).`);
      // Only protocol enums may leave the response. Never log descriptions or raw bodies.
      try {
        const data = JSON.parse(text);
        if (['missing_bearer', 'invalid_bearer', 'invalid_dpop', 'not_authorized'].includes(data.reason)) {
          error.reason = data.reason;
          error.message += ` Reason: ${data.reason}.`;
        }
      } catch { /* Non-JSON failures still retain the HTTP status. */ }
      throw error;
    }
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ConnectError) throw error;
    throw new ConnectError(`T3 Connect ${stage} failed or returned invalid data.`);
  }
}

function tokenResult(result, type, scopes) {
  if (typeof result.access_token !== 'string' || !result.access_token ||
      result.token_type?.toLowerCase() !== type.toLowerCase() || !Number.isFinite(result.expires_in) || result.expires_in <= 0) {
    throw new ConnectError('Unexpected T3 Connect token response.');
  }
  if (scopes && [...new Set(String(result.scope || '').split(' ').filter(Boolean))].sort().join(' ') !== scopes.split(' ').sort().join(' ')) {
    throw new ConnectError('T3 Connect granted unexpected scopes.');
  }
  return { accessToken: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
}

async function oauthToken(fields, fetcher) {
  const result = await jsonRequest(CONNECT.token, {
    method: 'POST', body: new URLSearchParams({ client_id: CONNECT.clientId, ...fields }),
  }, fetcher, 'sign-in token exchange');
  const token = tokenResult(result, 'Bearer');
  return { ...token, refreshToken: result.refresh_token || fields.refresh_token || null };
}
export function exchangeCode(code, verifier, fetcher = fetch) {
  return oauthToken({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: CONNECT.callback }, fetcher);
}
export async function freshCredentials(credentials, fetcher = fetch) {
  if (credentials?.accessToken && credentials.expiresAt > Date.now() + 60_000) return credentials;
  if (!credentials?.refreshToken) throw new ConnectError('Sign in with npm run prototype:connect -- login first.');
  return oauthToken({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken }, fetcher);
}
export async function saveCredentials(path, credentials) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(credentials) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temp, path);
}
export async function loadCredentials(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new ConnectError('No valid prototype login. Run npm run prototype:connect -- login.'); }
}

export function createProofKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const { kty, crv, x, y } = publicKey.export({ format: 'jwk' });
  const jwk = { kty, crv, x, y };
  return {
    thumbprint: hash(JSON.stringify({ crv, kty, x, y })),
    proof(method, target, accessToken) {
      const url = new URL(target); url.search = ''; url.hash = '';
      const body = { htm: method.toUpperCase(), htu: url.href, jti: randomUUID(), iat: Math.floor(Date.now() / 1000) };
      if (accessToken) body.ath = hash(accessToken);
      const input = `${encode({ typ: 'dpop+jwt', alg: 'ES256', jwk })}.${encode(body)}`;
      const signature = sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' });
      // T3's noble P-256 verifier requires canonical low-S signatures.
      const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
      const s = BigInt('0x' + signature.subarray(32).toString('hex'));
      if (s > order / 2n) Buffer.from((order - s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
      return `${input}.${signature.toString('base64url')}`;
    },
  };
}

export function managedOrigin(endpoint) {
  let url;
  try { url = new URL(endpoint?.httpBaseUrl); } catch { throw new ConnectError('Invalid managed environment endpoint.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !url.hostname.includes('.') || url.hostname.includes(':') || /^[\d.]+$/.test(url.hostname) || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) {
    throw new ConnectError('Expected a public HTTPS managed environment origin.');
  }
  return url.origin;
}

export class ConnectProbe {
  constructor(accessToken, fetcher = fetch) { this.accessToken = accessToken; this.fetcher = fetcher; this.key = createProofKey(); }
  async environments() {
    const result = await jsonRequest(`${CONNECT.relay}/v1/environments`, { headers: { authorization: `Bearer ${this.accessToken}` } }, this.fetcher, 'environment discovery');
    if (!Array.isArray(result.environments) || result.environments.some(e => !e || typeof e.environmentId !== 'string' || !/^[\w-]{1,200}$/.test(e.environmentId) || typeof e.label !== 'string')) {
      throw new ConnectError('Unexpected environment list.');
    }
    return result.environments;
  }
  async authorize(environmentId) {
    if (typeof environmentId !== 'string' || !/^[\w-]{1,200}$/.test(environmentId)) throw new ConnectError('Invalid environment identity.');
    if (!this.relayToken) {
      const url = `${CONNECT.relay}/v1/client/dpop-token`;
      this.relayToken = tokenResult(await jsonRequest(url, {
        method: 'POST', headers: { dpop: this.key.proof('POST', url) },
        body: new URLSearchParams({ grant_type: exchangeGrant, subject_token: this.accessToken,
          subject_token_type: 'urn:ietf:params:oauth:token-type:jwt', requested_token_type: accessType,
          resource: CONNECT.relay, scope: relayScope, client_id: 't3-web' }),
      }, this.fetcher, 'relay token exchange'), 'DPoP', relayScope).accessToken;
    }
    const url = `${CONNECT.relay}/v1/environments/${encodeURIComponent(environmentId)}/connect`;
    const bootstrap = await jsonRequest(url, {
      method: 'POST', headers: { ...this.headers('POST', url, this.relayToken), 'content-type': 'application/json' },
      body: JSON.stringify({ clientProofKeyThumbprint: this.key.thumbprint }),
    }, this.fetcher, 'environment bootstrap');
    if (bootstrap.environmentId !== environmentId || typeof bootstrap.credential !== 'string' || !bootstrap.credential) {
      throw new ConnectError('Environment bootstrap identity mismatch.');
    }
    const origin = managedOrigin(bootstrap.endpoint);
    const descriptor = await jsonRequest(`${origin}/.well-known/t3/environment`, {}, this.fetcher, 'environment descriptor');
    if (descriptor.environmentId !== environmentId) throw new ConnectError('Environment descriptor identity mismatch.');
    const tokenUrl = `${origin}/oauth/token`;
    const token = tokenResult(await jsonRequest(tokenUrl, {
      method: 'POST', headers: { dpop: this.key.proof('POST', tokenUrl) },
      body: new URLSearchParams({ grant_type: exchangeGrant, subject_token: bootstrap.credential,
        subject_token_type: 'urn:t3:params:oauth:token-type:environment-bootstrap', requested_token_type: accessType,
        scope: 'orchestration:read', client_label: 'T3 Quest Connect prototype', client_device_type: 'desktop' }),
    }, this.fetcher, 'read-only environment authorization'), 'DPoP', 'orchestration:read');
    return { origin, environmentId, ...token };
  }
  headers(method, url, token) {
    return { authorization: `DPoP ${token}`, dpop: this.key.proof(method, url, token) };
  }
  async read(session, path) {
    if (path !== '/api/orchestration/shell' && !/^\/api\/orchestration\/threads\/[^/?#]+\/bounded$/.test(path)) {
      throw new ConnectError('The prototype only reads shell and bounded thread history.');
    }
    const url = session.origin + path;
    return jsonRequest(url, { headers: { ...this.headers('GET', url, session.accessToken), 'x-t3-orchestration-protocol': '2' } }, this.fetcher, 'thread read');
  }
  async inspect(environment) {
    const session = await this.authorize(environment.environmentId);
    const shell = await this.read(session, '/api/orchestration/shell');
    if (!Array.isArray(shell.threads) || !Array.isArray(shell.projects)) throw new ConnectError('Unsupported shell protocol.');
    const sample = shell.threads.find(t => typeof t.id === 'string' && t.id && !t.archivedAt) || shell.threads[0];
    let historyItems = null;
    if (sample) {
      const data = await this.read(session, `/api/orchestration/threads/${encodeURIComponent(sample.id)}/bounded`);
      if (data.projection?.thread?.id !== sample.id || !Array.isArray(data.projection?.visibleTurnItems)) throw new ConnectError('Unsupported or mismatched thread history.');
      historyItems = data.projection.visibleTurnItems.length;
    }
    return { environmentId: environment.environmentId, label: environment.label, threads: shell.threads.length,
      projects: shell.projects.length, historyItems, scope: 'orchestration:read', status: 'verified' };
  }
}
