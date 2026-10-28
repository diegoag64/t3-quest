import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readThreadData, threadDetail, historyPage } from '../bridge/thread-view.mjs';
import { makeServer } from '../bridge/server.mjs';
import { ThreadMonitor } from '../bridge/t3.mjs';

const item=(id,type,text='Hello')=>({position:1,sourceThreadId:'t',sourceItemId:id,item:{id,type,text,runId:'r',status:'completed'}});
const fixture={snapshotSequence:4,historyCursor:'opaque+/cursor',hasMoreHistory:true,projection:{thread:{id:'t',projectId:'p',title:'Example'},runs:[{id:'r',ordinal:1,status:'completed'}],visibleTurnItems:[item('m','assistant_message')],providerSessions:[{secret:'must not be forwarded'}]}};
test('thread reads use authenticated GETs, protocol 2, and encoded IDs/cursors',async()=>{
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});return Response.json(url.includes('/history?')?{items:[],nextCursor:null,hasMoreHistory:false}:fixture);};
 const session={origin:'http://127.0.0.1:3773',token:'private'};
 await readThreadData(session,'thread/with?characters',{},fetcher);
 await readThreadData(session,'t',{cursor:'opaque+/cursor'},fetcher);
 assert.ok(calls[0].url.endsWith('/thread%2Fwith%3Fcharacters/bounded'));
 assert.equal(calls[0].options.headers.Authorization,'Bearer private');
 assert.equal(calls[0].options.headers['x-t3-orchestration-protocol'],'2');
 assert.equal(calls[0].options.redirect,'error');
 assert.equal(new URL(calls[1].url).searchParams.get('cursor'),'opaque+/cursor');
 await assert.rejects(readThreadData(session,'..',{},fetcher),/Invalid/);
 await assert.rejects(readThreadData(session,'t',{cursor:''},fetcher),/Invalid/);
 await assert.rejects(readThreadData(session,'t',{},async()=>new Response('',{status:401})),/expired/);
});
test('thread presentation preserves Markdown and pagination but omits session metadata',()=>{
 const result=threadDetail(fixture,{id:'t',projectId:'p',title:'Real title',branch:'feature',status:'running',modelSelection:{model:'gpt-6-astra'}},{title:'jev-devtools'});
 assert.equal(result.thread.title,'Real title');assert.equal(result.thread.project,'jev-devtools');assert.equal(result.thread.branch,'feature');
 assert.equal(result.items[0].item.text,'Hello');assert.equal(result.hasMoreHistory,true);assert.equal(result.historyCursor,'opaque+/cursor');
 assert.ok(!JSON.stringify(result).includes('must not be forwarded'));
 assert.equal(historyPage({items:[item('old','user_message')],nextCursor:'next',hasMoreHistory:true}).items[0].item.type,'user_message');
});
test('settled threads are browseable without becoming notification candidates',()=>{
 const monitor=new ThreadMonitor();monitor.apply({projects:[{id:'p',title:'Project'}],threads:[{id:'a',projectId:'p',status:'completed',settledAt:'2026-01-01'}]});
 assert.equal(monitor.threads.length,0);assert.equal(monitor.settledThreads.length,1);assert.equal(monitor.events.length,0);
});
test('thread API refuses unauthorized, malformed, and mutation requests',async t=>{
 const calls=[];const server=makeServer({token:'test',state:()=>({}),threadRead:async(id,options)=>{calls.push({id,options});return {ok:true};}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.close();server.closeAllConnections();});
 const base=`http://127.0.0.1:${server.address().port}`,headers={Authorization:'Bearer test'};
 assert.equal((await fetch(base+'/api/threads/t')).status,401);
 assert.equal((await fetch(base+'/api/threads/t',{headers})).status,200);
 assert.equal((await fetch(base+'/api/threads/t/history?cursor=opaque%2B%2Fcursor',{headers})).status,200);
 assert.equal(calls[1].options.cursor,'opaque+/cursor');
 assert.equal((await fetch(base+'/api/threads/t/items/item%2F1',{headers})).status,200);
 assert.equal(calls[2].options.itemId,'item/1');
 assert.equal((await fetch(base+'/api/threads/t/history',{headers})).status,400);
 assert.equal((await fetch(base+'/api/threads/%ZZ',{headers})).status,400);
 assert.equal((await fetch(base+'/api/threads/t/send',{method:'POST',headers})).status,404);
 assert.equal((await fetch(base+'/api/threads/t',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
});

test('full output uses only the read-only item RPC and closes its socket',async()=>{
  const {readTurnItem}=await import('../bridge/thread-view.mjs');let sent,closed=false;
  class Socket extends EventTarget {
    constructor(url){super();assert.equal(url.searchParams.get('orchestrationProtocol'),'2');assert.equal(url.searchParams.get('wsTicket'),'one-use');queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
    send(text){sent=JSON.parse(text);queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({_tag:'Exit',requestId:'1',exit:{_tag:'Success',value:{item:{id:'i',type:'command_execution',output:'complete result',updatedAt:'v1'}}}})})));}
    close(){closed=true;}
  }
  const result=await readTurnItem({origin:'http://127.0.0.1:3773',token:'read-session'},'t','i',async(url,options)=>{assert.equal(url,'http://127.0.0.1:3773/api/auth/websocket-ticket');assert.equal(options.headers.Authorization,'Bearer read-session');assert.equal(options.redirect,'error');return Response.json({ticket:'one-use'});},Socket);
  assert.equal(sent.tag,'orchestration.getTurnItem');assert.deepEqual(sent.payload,{threadId:'t',itemId:'i'});assert.equal(result.item.output,'complete result');assert.ok(closed);
});
