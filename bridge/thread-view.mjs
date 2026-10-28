import { normalizeOrigin, normalizeThread } from './t3.mjs';

export function validateId(id) {
  if (typeof id !== 'string' || !id.length || id.length > 2000 || /[\x00-\x1f]/.test(id) || id === '.' || id === '..') {
    throw Object.assign(new Error('Invalid thread or item ID'), { status: 400 });
  }
  return id;
}

export async function readThreadData(session, id, { cursor, full = false } = {}, fetcher = fetch) {
  const path = '/api/orchestration/threads/' + encodeURIComponent(validateId(id));
  if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor.length > 12000)) throw Object.assign(new Error('Invalid history cursor'), { status: 400 });
  const suffix = cursor !== undefined ? '/history?' + new URLSearchParams({ cursor, view: 'activity' }) : full ? '' : '/bounded';
  const response = await fetcher(normalizeOrigin(session.origin) + path + suffix, {
    headers: { Authorization: `Bearer ${session.token}`, 'x-t3-orchestration-protocol': '2' },
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'T3 access expired. Pair the laptop again.' : response.status === 404 ? 'Thread no longer available.' : 'T3 could not load this conversation.'), { status: [400, 401, 403, 404].includes(response.status) ? response.status : 502 });
  const reader = response.body.getReader(); const parts = []; let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > 24_000_000) throw Object.assign(new Error('Thread response too large. Try loading a smaller history page.'), {status:413});
      parts.push(value);
    }
  } finally { await reader.cancel(); }
  const data = JSON.parse(Buffer.concat(parts).toString());
  if (cursor !== undefined ? !Array.isArray(data.items) : !data.projection?.thread || !Array.isArray(data.projection.visibleTurnItems)) throw new Error('Unsupported T3 thread response');
  return data;
}

// Keep only presentation data. Never expose the provider session records or native transport metadata.
export function timelineItem(row) {
  const item = row.item;
  if (!item || typeof item.type !== 'string') return null;
  const value = { id: item.id, type: item.type, runId: item.runId, status: item.status, title: item.title,
    startedAt: item.startedAt, completedAt: item.completedAt, updatedAt: item.updatedAt };
  const fields = ['text','markdown','streaming','input','output','outputOmitted','exitCode','outputIndicatesFailure',
    'fileName','diffStr','oldStr','newStr','changes','additions','deletions','toolName','pattern','patterns','results',
    'steps','explanation','questions','questionAnswer','requestKind','prompt','appName','message','failure',
    'source','summary','detail','outcome','driver','childThreadId','providerInstanceId','progress','result','files','attachments'];
  for (const key of fields) if (item[key] !== undefined) value[key] = item[key];
  // Secret requests are represented only by their label; there is no reveal or input action.
  if (item.type === 'secret_request') value.title = item.label || 'Secret requested on laptop';
  return { id: row.sourceThreadId + ':' + row.sourceItemId, position: row.position, visibility: row.visibility, item: value };
}

export function threadDetail(data, shellThread, project) {
  const p = data.projection;
  const latest = [...(p.runs || [])].sort((a,b)=>b.ordinal-a.ordinal)[0];
  const thread = normalizeThread({ ...p.thread, status: latest?.status || 'idle', ...shellThread }, new Map([[p.thread.projectId, project || {title:'Project'}]]));
  return {
    thread, runs: (p.runs || []).map(run => ({ id:run.id,status:run.status,startedAt:run.startedAt,completedAt:run.completedAt,modelSelection:run.modelSelection })),
    items: p.visibleTurnItems.map(timelineItem).filter(Boolean),
    historyCursor: data.historyCursor ?? null, hasMoreHistory: data.hasMoreHistory === true,
    snapshotSequence: data.snapshotSequence, updatedAt: p.updatedAt,
  };
}

export function historyPage(data) {
  return { items: data.items.map(timelineItem).filter(Boolean), historyCursor: data.nextCursor, hasMoreHistory:data.hasMoreHistory, snapshotSequence:data.snapshotSequence };
}

// T3's HTTP projections deliberately omit output; its read-only RPC hydrates one item.
export async function readTurnItem(session, threadId, itemId, fetcher = fetch, Socket = WebSocket) {
  validateId(threadId); validateId(itemId);
  const origin=normalizeOrigin(session.origin);
  const ticketResponse=await fetcher(origin+'/api/auth/websocket-ticket',{method:'POST',headers:{Authorization:'Bearer '+session.token},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!ticketResponse.ok)throw Object.assign(new Error('Could not authorize activity output.'),{status:502});
  const {ticket}=await ticketResponse.json();if(typeof ticket!=='string'||!ticket)throw new Error('Invalid WebSocket ticket');
  const url=new URL(origin+'/ws');url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('wsTicket',ticket);url.searchParams.set('orchestrationProtocol','2');
  return new Promise((resolve,reject)=>{
    const socket=new Socket(url);let settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);socket.close();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(new Error('Activity output timed out')),15000);
    socket.addEventListener('open',()=>socket.send(JSON.stringify({_tag:'Request',id:'1',tag:'orchestration.getTurnItem',payload:{threadId,itemId},headers:[]})));
    socket.addEventListener('message',event=>{try{
      if(typeof event.data!=='string'||event.data.length>24_000_000)throw Error('Unsupported activity response');
      const parsed=JSON.parse(event.data);for(const msg of Array.isArray(parsed)?parsed:[parsed]){
        if(msg._tag==='Ping'){socket.send(JSON.stringify({_tag:'Pong'}));continue;}
        if(msg._tag==='Exit'&&msg.requestId==='1'){
          if(msg.exit?._tag!=='Success')throw Error('T3 could not read activity output');
          const item=msg.exit.value?.item;if(!item)throw Object.assign(new Error('Activity item no longer available.'),{status:404});
          finish(null,{item:timelineItem({item,sourceThreadId:threadId,sourceItemId:itemId,position:0}).item});
        }
      }
    }catch(error){finish(error);}});
    socket.addEventListener('error',()=>finish(new Error('Activity connection failed')));
    socket.addEventListener('close',()=>{if(!settled)finish(new Error('Activity connection closed'));});
  });
}
