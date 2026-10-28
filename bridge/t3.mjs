import { normalizePullRequests } from './pull-requests.mjs';
import { randomUUID } from 'node:crypto';

export function normalizeOrigin(input) {
  const url = new URL(input);
  if (url.protocol === 'ws:') url.protocol = 'http:';
  if (url.protocol === 'wss:') url.protocol = 'https:';
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an http(s) T3 server address without embedded credentials.');
  }
  if (url.protocol === 'http:') {
    const host = url.hostname;
    const privateHost = host === 'localhost' || host === '[::1]' || host.endsWith('.local') ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host);
    if (!privateHost) throw new Error('Use HTTPS for a public T3 endpoint. HTTP is limited to private networks.');
  }
  return url.origin;
}

export function parsePairingUrl(input, serverOrigin) {
  let url;
  try { url = new URL(input.trim()); }
  catch { throw new Error('Invalid pairing URL. Paste the full link from T3 Sharing & access.'); }
  const hash = new URLSearchParams(url.hash.slice(1));
  const credential = hash.get('token') || url.searchParams.get('token');
  if (!credential) throw new Error('No pairing token found. Create a fresh direct pairing link in T3.');
  const desktop = ['t3code:', 't3code-dev:'].includes(url.protocol);
  if (desktop && (url.hostname !== 'app' || url.pathname !== '/pair' || url.username || url.password || url.port)) {
    throw new Error('Unsupported T3 desktop link. Use a t3code://app/pair link or a direct HTTP pairing link.');
  }
  if (!desktop && !['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('Unsupported pairing URL scheme. Use an HTTP pairing link or a T3 desktop pairing link.');
  }
  const embeddedHost = url.searchParams.get('host');
  if (desktop && !embeddedHost && !serverOrigin) {
    throw Object.assign(new Error('This T3 desktop link contains a token but no server address. Enter the T3 server HTTP address separately.'), { code: 'T3_HOST_REQUIRED' });
  }
  // An explicit address only fills a missing desktop host; it never reroutes a direct link.
  const host = embeddedHost || (desktop ? serverOrigin : url.origin);
  return { origin: normalizeOrigin(host), credential };
}

export async function exchangePairing(input, fetcher = fetch, serverOrigin, {write = false} = {}) {
  const { origin, credential } = parsePairingUrl(input, serverOrigin);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: credential,
    subject_token_type: 'urn:t3:params:oauth:token-type:environment-bootstrap',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    scope: write ? 'orchestration:read orchestration:operate' : 'orchestration:read',
    client_label: 'T3 Quest bridge',
    client_device_type: 'desktop',
  });
  let response;
  try {
    response = await fetcher(`${origin}/oauth/token`, {
      method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(`Cannot reach T3 at ${origin}. Keep T3 Code open and check the server address and port.`);
  }
  if (!response.ok) throw new Error(`T3 pairing failed (HTTP ${response.status}). Create a fresh direct pairing link. T3 Connect DPoP grants require the official client.`);
  const result = await response.json();
  if (typeof result.access_token !== 'string' || !/^bearer$/i.test(result.token_type ?? '')) {
    throw new Error('Expected a direct-pairing bearer session. Cloud DPoP login is not implemented in this prototype.');
  }
  return { origin, token: result.access_token, scopes: (result.scope || 'orchestration:read').split(' '), pairedAt: new Date().toISOString() };
}

export async function readShell(session, fetcher = fetch) {
  const origin = normalizeOrigin(session.origin);
  const response = await fetcher(`${origin}/api/orchestration/shell`, {
    headers: { Authorization: `Bearer ${session.token}`, 'x-t3-orchestration-protocol': '2' },
    redirect: 'error', signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`T3 HTTP ${response.status}${response.status === 401 ? ': pair again' : ''}`);
  const snapshot = await response.json();
  if (!Array.isArray(snapshot.threads) || !Array.isArray(snapshot.projects)) {
    throw new Error('Unsupported T3 shell response. This adapter expects orchestration protocol 2.');
  }
  return snapshot;
}

export function normalizeThread(thread, projects) {
  const busy = ['preparing', 'queued', 'starting', 'running', 'waiting'];
  let status = thread.status ?? 'unknown';
  if (thread.pendingRuntimeRequest) status = 'needs-you';
  else if (thread.activityRunStatus || busy.includes(status)) status = 'running';
  else if (thread.pendingBackgroundTasks?.length) status = 'waiting';
  const project = projects.get(thread.projectId);
  const projectName = typeof project === 'string' ? project : project?.title || project?.name || 'Project';
  return {
    id: thread.id,
    title: thread.title || 'Untitled thread',
    project: projectName,
    projectId: thread.projectId,
    projectIcon: typeof project === 'object' ? project.projectIcon : null,
    branch: thread.branch || null,
    modelSelection: thread.modelSelection || null,
    provider: thread.providerInstanceId || thread.modelSelection?.instanceId || '',
    runtimeMode: thread.runtimeMode || '',
    settledAt: thread.settledAt || null,
    pinnedAt: thread.pinnedAt || null,
    activeOrderKey: thread.activeOrderKey || null,
    lastVisitedAt: thread.lastVisitedAt || null,
    completedAt: thread.latestRunCompletedAt || null,
    pendingBackgroundTasks: thread.pendingBackgroundTasks || [],
    pendingRuntimeRequest: thread.pendingRuntimeRequest || null,
    pullRequests: normalizePullRequests(thread),
    status,
    summary: String(thread.latestVisibleMessage?.text ?? '').slice(0, 600),
    updatedAt: thread.updatedAt,
    runId: thread.latestRunId ?? null,
    requestId: thread.pendingRuntimeRequest?.id ?? null,
  };
}

export class ThreadMonitor {
  previous = new Map();
  initialized = false;
  events = [];
  threads = [];
  settledThreads = [];
  shell = {threads: [], projects: []};

  apply(snapshot) {
    this.shell = snapshot;
    const projects = new Map(snapshot.projects.map(project => [project.id, project]));
    this.settledThreads = snapshot.threads.filter(t => !t.deletedAt && !t.archivedAt && t.settledAt).map(t => normalizeThread(t, projects)).sort((a,b)=>String(b.settledAt).localeCompare(String(a.settledAt)));
    const threads = snapshot.threads
      .filter(thread => !thread.deletedAt && !thread.archivedAt && !thread.settledAt)
      .map(thread => normalizeThread(thread, projects));
    for (const thread of threads) {
      const previous = this.previous.get(thread.id);
      // Initial connection is a baseline, never a flood of historical alerts.
      if (this.initialized) {
        const changedRun = previous && previous.runId !== thread.runId;
        const newlyCompleted = thread.status === 'completed' && previous &&
          (previous.status !== 'completed' || changedRun);
        const newlyFailed = thread.status === 'failed' && previous &&
          (previous.status !== 'failed' || changedRun);
        const needsYou = thread.status === 'needs-you' &&
          (!previous || previous.requestId !== thread.requestId);
        if (newlyCompleted || newlyFailed || needsYou) {
          this.events.push({
            id: randomUUID(), time: new Date().toISOString(), threadId: thread.id,
            title: thread.title, message: newlyCompleted ? 'Thread finished' : newlyFailed ? 'Thread failed' : 'Thread needs your input',
          });
        }
      }
      this.previous.set(thread.id, thread);
    }
    const liveIds = new Set(threads.map(thread => thread.id));
    for (const id of this.previous.keys()) if (!liveIds.has(id)) this.previous.delete(id);
    this.events = this.events.slice(-100);
    this.threads = threads.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
    this.initialized = true;
  }
}
