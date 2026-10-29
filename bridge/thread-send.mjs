import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeOrigin } from './t3.mjs';
import { validateId } from './thread-view.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function validateMessage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['text','requestId'].includes(k))) throw fail('Expected text and requestId only.');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 12000) throw fail('Message must contain 1–12000 characters.');
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) throw fail('Invalid message request ID.');
  return { text: input.text, requestId: input.requestId };
}
export async function canOperate(session, fetcher = fetch) {
  if (!session) return false;
  const response = await fetcher(normalizeOrigin(session.origin)+'/api/auth/session', {headers:{Authorization:'Bearer '+session.token}, redirect:'error',signal:AbortSignal.timeout(8000)});
  if (!response.ok) return false;
  const result = await response.json();
  return result.authenticated === true && result.scopes?.includes('orchestration:operate') === true;
}
export async function dispatchMessage(session, threadId, input, fetcher = fetch, Socket = WebSocket) {
  validateId(threadId); const {text,requestId}=validateMessage(input);
  if (!await canOperate(session,fetcher)) throw fail('Pair again with npm run pair -- --write to enable sending.',403);
  const origin=normalizeOrigin(session.origin);
  const response=await fetcher(origin+'/api/auth/websocket-ticket',{method:'POST',headers:{Authorization:'Bearer '+session.token},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw fail('Could not authorize sending. Check the T3 connection.',502);
  const {ticket}=await response.json(); if(typeof ticket!=='string'||!ticket)throw fail('Invalid T3 ticket.',502);
  const url=new URL(origin+'/ws');url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('wsTicket',ticket);url.searchParams.set('orchestrationProtocol','2');
  // T3 persists command receipts: a retry after a lost response uses these same IDs.
  const id=createHash('sha256').update(threadId+'\0'+requestId).digest('hex');
  const command={type:'message.dispatch',commandId:'quest:'+id,messageId:'quest-message:'+id,threadId,text,attachments:[],createdBy:'user',creationSource:'mobile',dispatchMode:{type:'queue_after_active'}};
  return new Promise((resolve,reject)=>{
    let settled=false; const socket=new Socket(url);
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);socket.close();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(fail('Delivery not confirmed. Retry this same draft to check delivery without duplicating it.',502)),20000);
    socket.addEventListener('open',()=>socket.send(JSON.stringify({_tag:'Request',id:'1',tag:'orchestration.dispatchCommand',payload:command,headers:[]})));
    socket.addEventListener('message',event=>{try{
      if(typeof event.data!=='string'||event.data.length>1_000_000)throw fail('Invalid T3 delivery response.',502);
      const parsed=JSON.parse(event.data);
      for(const msg of Array.isArray(parsed)?parsed:[parsed]){
        if(msg._tag==='Ping'){socket.send(JSON.stringify({_tag:'Pong'}));continue;}
        if(msg._tag==='Exit'&&msg.requestId==='1'){
          if(msg.exit?._tag!=='Success')throw fail('T3 did not accept the message. Check the thread on your laptop, then retry or discard the draft.',409);
          if(!Number.isInteger(msg.exit.value?.sequence))throw fail('Delivery response missing confirmation. Retry this same draft.',502);
          finish(null,{ok:true,requestId,messageId:command.messageId,sequence:msg.exit.value.sequence});
        }
      }
    }catch(error){finish(error);}});
    socket.addEventListener('error',()=>finish(fail('Delivery not confirmed. Retry this same draft.',502)));
    socket.addEventListener('close',()=>{if(!settled)finish(fail('Connection closed before delivery confirmation. Retry this same draft.',502));});
  });
}
// Store hashes and receipts, never the message or credentials. Bind each retry ID to one payload.
export function createMessageSender(session, directory, dispatch=dispatchMessage) {
  const pending=new Map();
  return async (threadId,input)=>{
    validateId(threadId); validateMessage(input);
    const key=createHash('sha256').update(session.origin+'\0'+input.requestId).digest('hex');
    const hash=createHash('sha256').update(threadId+'\0'+input.text).digest('hex');
    if(pending.has(key)){const entry=pending.get(key);if(entry.hash!==hash)throw fail('This retry ID belongs to a different draft.',409);return entry.promise;}
    const promise=(async()=>{
      await mkdir(directory,{recursive:true,mode:0o700});
      const path=join(directory,key+'.json');let entry;
      try{entry=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
      if(entry && entry.hash!==hash)throw fail('This retry ID belongs to a different draft.',409);
      if(entry?.result)return entry.result;
      if(!entry)await writeFile(path,JSON.stringify({hash}),{mode:0o600,flag:'wx'});
      const result=await dispatch(session,threadId,input);
      await writeFile(path+'.tmp',JSON.stringify({hash,result}),{mode:0o600});await rename(path+'.tmp',path);
      return result;
    })();
    pending.set(key,{hash,promise});try{return await promise;}finally{pending.delete(key);}
  };
}
