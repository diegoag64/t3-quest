import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from 'ws';
import {startDesktopLink,createDesktopSource,scopedId,unscopedId} from '../bridge/desktop.mjs';
import {connectCompanion,validateRequest} from '../integrations/t3code/client.mjs';

const token='a'.repeat(64);
const env=(id,canSend=true)=>({id,label:'Machine '+id,connected:true,canSend,projects:[{id:'project',title:'Project '+id}],threads:[{id:'same',projectId:'project',title:'Thread '+id,status:'completed'}]});
test('desktop thread identities isolate duplicate IDs and reject malformed references',()=>{
  assert.notEqual(scopedId('a','same'),scopedId('b','same'));
  assert.deepEqual(unscopedId(scopedId('a','same')),{environmentId:'a',threadId:'same'});
  for(const value of ['same','desktop:bad',scopedId('a','same')+'='])assert.throws(()=>unscopedId(value));
});
test('desktop source combines environments and routes details, children, history and sends',async()=>{
  const calls=[];let offline=false;
  const source=createDesktopSource({connected:true,request:async(method,input)=>{
    calls.push({method,input});
    if(method==='shell')return {environments:[{...env('a'),connected:!offline},env('b',false)]};
    const row={sourceThreadId:'same',sourceItemId:'child',position:1,item:{id:'child',type:'subagent',childThreadId:'same'}};
    if(method==='thread')return {projection:{thread:{id:'same',projectId:'project'},runs:[],visibleTurnItems:[row]},hasMoreHistory:true,historyCursor:'cursor'};
    if(method==='history')return {items:[row],nextCursor:null,hasMoreHistory:false};
    if(method==='item')return {item:row.item};
    return {ok:true};
  }});
  const shell=await source.readShell();assert.equal(shell.threads.length,2);assert.equal(new Set(shell.projects.map(p=>p.id)).size,2);
  const a=scopedId('a','same'),b=scopedId('b','same');
  const detail=await source.read(b);assert.equal(detail.thread.project,'Project b');assert.equal(detail.thread.environmentLabel,'Machine b');assert.equal(detail.thread.canSend,false);assert.equal(detail.items[0].item.childThreadId,b);
  const history=await source.read(a,{cursor:'cursor'});assert.equal(history.items[0].item.childThreadId,a);assert.deepEqual(calls.at(-1),{method:'history',input:{environmentId:'a',threadId:'same',cursor:'cursor'}});
  const item=await source.read(b,{itemId:'child'});assert.equal(item.item.childThreadId,b);
  const message={text:'Reviewed draft',requestId:'11111111-1111-4111-8111-111111111111'};
  await assert.rejects(source.send(b,message),e=>e.status===403);
  await source.send(a,message);assert.equal(calls.at(-1).input.environmentId,'a');
  offline=true;await source.readShell();await assert.rejects(source.read(a),/offline/);await assert.rejects(source.send(a,message),/offline/);
  assert.equal(source.disconnected().threads.every(t=>!t.environmentConnected&&!t.canSend),true);
  assert.equal(source.environments.every(e=>!e.connected),true);
});
test('child threads absent from the sidebar retain their environment project',async()=>{
  const source=createDesktopSource({connected:true,request:async(method)=>method==='shell'?{environments:[env('a'),env('b')]}:{projection:{thread:{id:'child-only',projectId:'project',title:'Child task'},runs:[],visibleTurnItems:[]}}});
  await source.readShell();
  const detail=await source.read(scopedId('b','child-only'));
  assert.equal(detail.thread.project,'Project b');
  assert.equal(detail.thread.environmentLabel,'Machine b');
  assert.equal(detail.thread.id,scopedId('b','child-only'));
});
test('desktop transport requires the local origin and secret before accepting a peer',async t=>{
  const link=await startDesktopLink({token,port:0});t.after(()=>link.close());
  const url=`ws://127.0.0.1:${link.port}/desktop`;
  const untrusted=new WebSocket(url,{origin:'https://evil.example'});untrusted.on('error',()=>{});
  const [response]=await once(untrusted,'unexpected-response');assert.equal(response.path,'/desktop');untrusted.terminate();
  const wrong=new WebSocket(url,{origin:'t3code://app'});await once(wrong,'open');wrong.send(JSON.stringify({type:'hello',protocol:1,token:'b'.repeat(64)}));await once(wrong,'close');assert.equal(link.connected,false);
  const peer=new WebSocket(url,{origin:'t3code://app'});await once(peer,'open');peer.send(JSON.stringify({type:'hello',protocol:1,token}));await once(peer,'message');assert.equal(link.connected,true);
  const pending=link.request('shell');const [data]=await once(peer,'message');const request=JSON.parse(data.toString());peer.send(JSON.stringify({type:'result',id:request.id,ok:true,value:{environments:[]}}));assert.deepEqual(await pending,{environments:[]});
  const interrupted=link.request('thread',{});peer.close();await assert.rejects(interrupted,/disconnected/);
});
test('desktop renderer protocol refuses arbitrary commands and unreviewed message fields',()=>{
  const request=(method,input)=>({type:'request',id:'r',method,input});
  assert.throws(()=>validateRequest(request('eval',{code:'1+1'})));
  assert.throws(()=>validateRequest(request('send',{environmentId:'e',threadId:'t',text:'x',requestId:'bad'})));
  assert.throws(()=>validateRequest(request('thread',{environmentId:'e',threadId:'t',url:'https://evil.example'})));
  assert.equal(validateRequest(request('thread',{environmentId:'e',threadId:'t'})).method,'thread');
});
test('actual renderer connector responds through the authenticated local transport',async t=>{
  const link=await startDesktopLink({token,port:0});let socket;
  class BrowserSocket extends WebSocket{constructor(url){super(url,{origin:'t3code://app'});socket=this;}}
  const stop=connectCompanion({url:`ws://127.0.0.1:${link.port}/desktop`,token},async(method,input)=>({method,input}),{Socket:BrowserSocket});
  t.after(async()=>{stop();await link.close();});await once(socket,'message');
  assert.deepEqual(await link.request('thread',{environmentId:'remote',threadId:'same'}),{method:'thread',input:{environmentId:'remote',threadId:'same'}});
});
