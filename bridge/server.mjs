import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { canOperate, createMessageSender, validateMessage } from './thread-send.mjs';
import { createRepositoryReader } from './repository.mjs';
import { ThreadMonitor, readShell } from './t3.mjs';
import { readThreadData, threadDetail, historyPage, validateId, readTurnItem } from './thread-view.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAX_AUDIO = 6_000_044; // 180 seconds at 16 kHz mono PCM16 plus header.

export function authorized(actual, token) {
  const expected = Buffer.from(`Bearer ${token}`);
  const received = Buffer.from(actual ?? '');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function readBody(request, limit) {
  const parts = []; let length = 0;
  for await (const part of request) {
    length += part.length;
    if (length > limit) throw Object.assign(new Error('Recording exceeds upload limit'), { status: 413 });
    parts.push(part);
  }
  return Buffer.concat(parts);
}

export function validateWav(audio) {
  if (audio.length < 46 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE' ||
      audio.toString('ascii', 12, 16) !== 'fmt ' || audio.readUInt32LE(16) !== 16 ||
      audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== 16000 ||
      audio.readUInt16LE(34) !== 16 || audio.toString('ascii', 36, 40) !== 'data' ||
      audio.readUInt32LE(40) !== audio.length - 44 || audio.readUInt32LE(4) !== audio.length - 8) {
    throw Object.assign(new Error('Expected the app’s 16 kHz mono PCM16 WAV recording'), { status: 400 });
  }
}

export async function transcribe(audio, config, fetcher = fetch) {
  validateWav(audio);
  if (!config.transcriptionUrl) throw Object.assign(new Error('Set TRANSCRIPTION_URL on the computer bridge'), { status: 503 });
  const url = new URL(config.transcriptionUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported transcription URL');
  const wispr = config.transcriptionProvider === 'wispr';
  const headers = config.transcriptionKey ? { Authorization: `Bearer ${config.transcriptionKey}` } : {};
  let body;
  if(wispr){
    headers['Content-Type']='application/json';
    body=JSON.stringify({audio:audio.toString('base64'),context:{app:{name:'T3 Quest',type:'ai'}}});
  }else if(config.transcriptionProvider === 'openrouter'){
    headers['Content-Type']='application/json';
    body=JSON.stringify({model:config.transcriptionModel || 'microsoft/mai-transcribe-2',input_audio:{data:audio.toString('base64'),format:'wav'}});
  }else{
    body = new FormData();
    body.set('file', new Blob([audio], { type: 'audio/wav' }), 'dictation.wav');
    body.set('model', config.transcriptionModel || (url.hostname==='api.openai.com' ? 'gpt-transcribe' : 'whisper-1'));
  }
  const response = await fetcher(url, {
    method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(80_000), headers,
  });
  if (!response.ok) throw Object.assign(new Error(`Transcription endpoint returned HTTP ${response.status}`), { status: 502 });
  const result = await response.json();
  if (typeof result.text !== 'string') throw Object.assign(new Error('Transcription endpoint must return {"text":"..."}'), { status: 502 });
  return { text: result.text.slice(0, 20_000) };
}

export function makeServer({ token, state, demoComplete, config = {}, fetcher = fetch, threadRead, threadSend, repositoryRead }) {
  let transcribing = false;
  return createServer(async (request, response) => {
    const send = (code, value) => {
      response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(value));
    };
    // Native app only. No browser cross-origin access or cookie authentication.
    if (request.headers.origin) return send(403, { error: 'Browser origins are not accepted' });
    if (!authorized(request.headers.authorization, token)) return send(401, { error: 'Bridge token required' });
    const path = request.url;
    try {
      if (request.method === 'GET' && path === '/api/state') return send(200, state());
      if(request.method==='GET'&&/^\/api\/threads\/[^/]+\/repository$/.test(path)){
        if(!repositoryRead)return send(409,{error:'Connect T3 to view repository activity.'});
        let id;try{id=validateId(decodeURIComponent(path.split('/')[3]));}catch{return send(400,{error:'Invalid thread ID'});}
        return send(200,await repositoryRead(id));
      }
      if (request.method === 'POST' && /^\/api\/threads\/[^/]+\/messages$/.test(path)) {
        if (!threadSend) return send(403,{error:'Sending is unavailable. Pair with npm run pair -- --write.'});
        if (request.headers['content-type'] !== 'application/json') return send(415,{error:'Send application/json'});
        let id, input;
        try { id=validateId(decodeURIComponent(path.split('/')[3])); input=validateMessage(JSON.parse((await readBody(request,64000)).toString())); }
        catch(error) { return send(error.status || 400,{error:error.status ? error.message : 'Invalid message JSON or thread ID'}); }
        return send(200,await threadSend(id,input));
      }
      if (request.method === 'GET' && path.startsWith('/api/threads/')) {
        if (!threadRead) return send(409, { error: 'Connect the bridge to T3 to read conversations.' });
        const url = new URL(path, 'http://bridge.local');
        const match = url.pathname.match(/^\/api\/threads\/([^/]+)(?:\/(history|items)(?:\/([^/]+))?)?$/);
        if (!match || (match[2] === 'items' && !match[3]) || (match[2] === 'history' && match[3])) return send(404, {error:'Unknown thread endpoint'});
        let id, itemId;
        try { id = validateId(decodeURIComponent(match[1])); if(match[3]) itemId=validateId(decodeURIComponent(match[3])); }
        catch { return send(400, {error:'Invalid thread or item ID'}); }
        const cursor = match[2] === 'history' ? url.searchParams.get('cursor') : undefined;
        if (match[2] === 'history' && (!cursor || cursor.length > 12000)) return send(400, {error:'Missing or invalid history cursor'});
        return send(200, await threadRead(id, {cursor, itemId}));
      }
      if (request.method === 'POST' && path === '/api/demo/complete') {
        if (!demoComplete) return send(409, { error: 'Demo events are disabled in T3 mode' });
        demoComplete(); return send(200, { ok: true });
      }
      if (request.method === 'POST' && path === '/api/transcribe') {
        if (transcribing) return send(429, { error: 'A transcription is already running' });
        if (request.headers['content-type'] !== 'audio/wav') return send(415, { error: 'Send audio/wav' });
        transcribing = true;
        try {
          const audio = await readBody(request, MAX_AUDIO);
          return send(200, await transcribe(audio, config, fetcher));
        } finally { transcribing = false; }
      }
      return send(404, { error: 'Unknown endpoint' });
    } catch (error) {
      // Upstream error bodies and credentials never cross into headset diagnostics.
      return send(error.status || 502, { error: error.status ? error.message : 'Bridge request failed' });
    }
  });
}

async function privateJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function loadBridgeToken(directory = join(ROOT, '.state')) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const tokenPath = join(directory, 'bridge-token');
  let token;
  try { token = (await readFile(tokenPath, 'utf8')).trim(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    token = randomBytes(24).toString('base64url');
    await writeFile(tokenPath, token + '\n', { mode: 0o600, flag: 'wx' });
  }
  return token;
}

export async function main() {
  try { process.loadEnvFile(join(ROOT,'.env')); } catch(error) { if(error.code!=='ENOENT')throw error; }

  const directory = join(ROOT, '.state');
  const token = await loadBridgeToken(directory);
  const session = await privateJson(join(directory, 't3-session.json'));
  const monitor = new ThreadMonitor();
  let canSend = false, capabilitiesAt = 0;
  let status = session ? 'Connecting to T3' : 'Connected';
  let updatedAt = null;
  let timer;
  let closed = false;
  const demo = {
    threads: [{ id: 'demo-auth', title: 'Authentication tests', status: 'running', project: 'Demo', summary: 'Simulated task. No agent is running.' }],
    events: [],
  };
  async function poll() {
    try {
      monitor.apply(await readShell(session));
      if(Date.now()-capabilitiesAt>30000){canSend=await canOperate(session);capabilitiesAt=Date.now();}
      status = 'Connected'; updatedAt = new Date().toISOString();
    } catch (error) {
      status = error.message.startsWith('T3 HTTP') || error.message.startsWith('Unsupported T3') ? error.message : 'T3 unreachable';
    } finally { if (!closed) timer = setTimeout(poll, 2000); }
  }
  const detailCache = new Map();
  async function threadRead(id, {cursor, itemId}) {
    if(itemId)return readTurnItem(session,id,itemId);
    const key = id + ':bounded';
    let data;
    if (cursor !== undefined) return historyPage(await readThreadData(session, id, {cursor}));
    const cached = detailCache.get(key);
    if (cached && Date.now()-cached.time < 1500) data = await cached.value;
    else {
      const value = readThreadData(session, id, {});
      detailCache.set(key, {time:Date.now(),value});
      while(detailCache.size > 8) detailCache.delete(detailCache.keys().next().value);
      try { data=await value; } catch(error) {detailCache.delete(key); throw error;}
    }
    const shellThread = monitor.shell.threads.find(t=>t.id===id);
    const project = monitor.shell.projects.find(p=>p.id===data.projection.thread.projectId);
    return threadDetail(data, shellThread, project);
  }
  const server = makeServer({
    token, threadRead: session ? threadRead : null,
    repositoryRead: session ? createRepositoryReader(()=>monitor.shell.threads) : null,
    threadSend: session ? createMessageSender(session,join(directory,'message-receipts')) : null,
    state: () => ({
      mode: session ? (canSend ? 't3-connected' : 't3-read-only') : 'demo', status, updatedAt, canSend,
      threads: session ? monitor.threads : demo.threads,
      settledThreads: session ? monitor.settledThreads : [],
      events: session ? monitor.events : demo.events,
      transcriptionConfigured: Boolean(process.env.TRANSCRIPTION_URL),
    }),
    demoComplete: session ? null : () => {
      demo.threads[0].status = 'completed';
      demo.threads[0].summary = 'Simulated completion received from the computer.';
      demo.events.push({ id: randomUUID(), title: 'Authentication tests', message: 'Demo thread finished', time: new Date().toISOString() });
      demo.events = demo.events.slice(-100);
    },
    config: { transcriptionProvider: process.env.TRANSCRIPTION_PROVIDER, transcriptionUrl: process.env.TRANSCRIPTION_URL, transcriptionModel: process.env.TRANSCRIPTION_MODEL, transcriptionKey: process.env.TRANSCRIPTION_KEY },
  });
  server.requestTimeout = 90_000;
  server.headersTimeout = 10_000;
  const host = process.env.BRIDGE_HOST || '127.0.0.1';
  const port = Number(process.env.BRIDGE_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid BRIDGE_PORT');
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  console.log(`T3 Quest bridge: http://${host}:${port} (${session ? 'T3 connected' : 'demo'})`);
  console.log('Bridge access token: read .state/bridge-token and paste it into the headset app.');
  if (host === '0.0.0.0') {
    for (const values of Object.values(networkInterfaces())) {
      for (const item of values || []) if (item.family === 'IPv4' && !item.internal) console.log(`Possible headset address: http://${item.address}:${port}`);
    }
  }
  if (session) void poll();
  const stop = () => { closed = true; clearTimeout(timer); server.close(); server.closeAllConnections(); };
  server.on('close', () => { closed = true; clearTimeout(timer); process.off('SIGTERM', stop); process.off('SIGINT', stop); });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Bridge startup failed. Check .state permissions, configuration, and whether the port is already in use.'); process.exitCode = 1; });
}
