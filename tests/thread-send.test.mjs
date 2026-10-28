import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {canOperate,dispatchMessage,createMessageSender,validateMessage} from '../bridge/thread-send.mjs';
import {makeServer} from '../bridge/server.mjs';
import {exchangePairing} from '../bridge/t3.mjs';
const session={origin:'http://127.0.0.1:3773',token:'test-session'};
const input={text:'Test draft',requestId:'48f83b78-e7e9-4a7a-a099-035797266514'};
test('sending only dispatches a user message, queues active work and uses stable retry IDs',async()=>{
 const commands=[];let closed=0;
 class Socket extends EventTarget {
  constructor(url){super();assert.equal(url.searchParams.get('orchestrationProtocol'),'2');queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
  send(text){const request=JSON.parse(text);assert.equal(request.tag,'orchestration.dispatchCommand');commands.push(request.payload);queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({_tag:'Exit',requestId:'1',exit:{_tag:'Success',value:{sequence:42}}})})));}
  close(){closed++;}
 }
 const fetcher=async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer test-session');assert.equal(options.redirect,'error');return Response.json(url.endsWith('/session')?{authenticated:true,scopes:['orchestration:read','orchestration:operate']}:{ticket:'ticket'});};
 const a=await dispatchMessage(session,'thread-a',input,fetcher,Socket);await dispatchMessage(session,'thread-a',input,fetcher,Socket);
 assert.equal(a.sequence,42);assert.equal(a.requestId,input.requestId);assert.equal(commands[0].commandId,commands[1].commandId);assert.equal(commands[0].messageId,commands[1].messageId);
 assert.deepEqual(commands[0].dispatchMode,{type:'queue_after_active'});assert.equal(commands[0].createdBy,'user');assert.equal(commands[0].threadId,'thread-a');assert.deepEqual(commands[0].attachments,[]);assert.equal(closed,2);
});
test('read-only pairing cannot send and write pairing requests only read + operate',async()=>{
 const fetcher=async()=>Response.json({authenticated:true,scopes:['orchestration:read']});assert.equal(await canOperate(session,fetcher),false);
 await assert.rejects(()=>dispatchMessage(session,'t',input,fetcher,class {constructor(){assert.fail('Must not connect');}}),/pair.*--write/i);
 let scope;await exchangePairing('http://localhost:3773/pair#token=test',async(url,options)=>{scope=options.body.get('scope');return Response.json({access_token:'test',token_type:'Bearer',scope});},undefined,{write:true});assert.equal(scope,'orchestration:read orchestration:operate');
});
test('message retries deduplicate in-flight requests and persist receipts across restart',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'quest-send-'));t.after(()=>rm(directory,{recursive:true,force:true}));let calls=0;
 const dispatch=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return {ok:true,requestId:input.requestId,sequence:1};};
 const send=createMessageSender(session,directory,dispatch);await Promise.all([send('a',input),send('a',input)]);assert.equal(calls,1);
 await createMessageSender(session,directory,dispatch)('a',input);assert.equal(calls,1);
 await assert.rejects(()=>send('b',input),/different draft/);await assert.rejects(()=>send('a',{...input,text:'changed'}),/different draft/);
});
test('uncertain delivery retains the same request on retry',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'quest-uncertain-'));t.after(()=>rm(directory,{recursive:true,force:true}));let calls=0;
 const send=createMessageSender(session,directory,async(s,id,message)=>{assert.deepEqual(message,input);if(++calls===1)throw Error('Response lost');return {ok:true};});
 await assert.rejects(()=>send('a',input),/Response lost/);assert.deepEqual(await send('a',input),{ok:true});assert.equal(calls,2);
});
test('send endpoint rejects missing authentication, browser origins and arbitrary RPC fields',async t=>{
 let calls=0;const server=makeServer({token:'test',state:()=>({}),threadSend:async(id,body)=>{calls++;assert.equal(id,'thread-a');assert.deepEqual(body,input);return {ok:true};}});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.close();server.closeAllConnections();});
 const url=`http://127.0.0.1:${server.address().port}/api/threads/thread-a/messages`,headers={Authorization:'Bearer test','Content-Type':'application/json'};
 const post=(body=input,h=headers)=>fetch(url,{method:'POST',headers:h,body:JSON.stringify(body)});
 assert.equal((await post(input,{})).status,401);assert.equal((await post(input,{...headers,Origin:'https://evil.example'})).status,403);
 assert.equal((await post({...input,type:'run.interrupt'})).status,400);assert.equal((await post({...input,text:' '})).status,400);
 assert.equal((await post()).status,200);assert.equal(calls,1);
 assert.throws(()=>validateMessage({...input,requestId:'invalid'}));assert.throws(()=>validateMessage({...input,text:'x'.repeat(12001)}));
});
