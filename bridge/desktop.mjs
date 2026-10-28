import {createServer} from 'node:http';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {WebSocketServer} from 'ws';
import {validateId,timelineItem,threadDetail,historyPage} from './thread-view.mjs';
import {validateMessage} from './thread-send.mjs';

const fail=(message,status=503)=>Object.assign(new Error(message),{status});
export function scopedId(environmentId,id){return 'desktop:'+Buffer.from(JSON.stringify([validateId(environmentId),validateId(id)])).toString('base64url');}
export function unscopedId(value){
  try{
    if(typeof value!=='string'||!value.startsWith('desktop:')||value.length>2000)throw Error();
    const pair=JSON.parse(Buffer.from(value.slice(8),'base64url').toString());
    if(!Array.isArray(pair)||pair.length!==2)throw Error();
    const [environmentId,threadId]=pair.map(validateId);
    if(scopedId(environmentId,threadId)!==value)throw Error();
    return {environmentId,threadId};
  }catch{throw fail('Invalid desktop thread reference.',400);}
}

/** Local reverse RPC. T3 owns upstream sessions; no environment credentials leave T3. */
export async function startDesktopLink({token,port=8788,timeoutMs=20000}){
  if(typeof token!=='string'||token.length<32)throw Error('Desktop link token is missing.');
  let peer=null;
  const pending=new Map();
  const server=createServer((req,res)=>{res.writeHead(404);res.end();});
  const sockets=new WebSocketServer({noServer:true,maxPayload:24_000_000});
  server.on('upgrade',(req,socket,head)=>{
    // Packaged T3 uses t3code://app. Dev builds use a loopback origin.
    let originOK=false;
    try{const o=new URL(req.headers.origin);originOK=(['t3code:','t3code-dev:'].includes(o.protocol)&&o.hostname==='app')||(['http:','https:'].includes(o.protocol)&&['localhost','127.0.0.1'].includes(o.hostname));}catch{}
    if(req.url!=='/desktop'||!originOK){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    sockets.handleUpgrade(req,socket,head,ws=>sockets.emit('connection',ws));
  });
  sockets.on('connection',ws=>{
    let authenticated=false;
    const timer=setTimeout(()=>ws.close(1008),3000);
    ws.on('error',()=>{});
    ws.on('message',raw=>{
      try{
        const data=JSON.parse(raw.toString());
        if(!authenticated){
          const incoming=Buffer.from(typeof data.token==='string'?data.token:'');const expected=Buffer.from(token);
          if(data.type!=='hello'||data.protocol!==1||incoming.length!==expected.length||!timingSafeEqual(incoming,expected)||peer){ws.close(1008);return;}
          authenticated=true;clearTimeout(timer);peer=ws;ws.send(JSON.stringify({type:'ready',protocol:1}));return;
        }
        if(data.type!=='result'||typeof data.id!=='string')return;
        const entry=pending.get(data.id);if(!entry)return;
        pending.delete(data.id);clearTimeout(entry.timer);
        if(data.ok)entry.resolve(data.value);else entry.reject(fail('T3 desktop could not complete this request. Check the environment connection and permissions.',data.status===403?403:503));
      }catch{ws.close(1008);}
    });
    ws.on('close',()=>{
      clearTimeout(timer);if(peer!==ws)return;peer=null;
      for(const item of pending.values()){clearTimeout(item.timer);item.reject(fail('T3 desktop disconnected. Reopen the integrated desktop app.'));}pending.clear();
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {
    port:server.address().port,
    get connected(){return peer?.readyState===1;},
    request(method,input={}){
      if(!['shell','thread','history','item','send'].includes(method))return Promise.reject(fail('Unsupported desktop request.',400));
      if(peer?.readyState!==1)return Promise.reject(fail('Open T3 Code with the Quest desktop integration enabled.'));
      if(pending.size>=16)return Promise.reject(fail('Desktop request limit reached.',429));
      return new Promise((resolve,reject)=>{
        const id=randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(fail('T3 desktop request timed out.'));},timeoutMs);
        pending.set(id,{resolve,reject,timer});peer.send(JSON.stringify({type:'request',id,method,input}));
      });
    },
    async close(){for(const ws of sockets.clients)ws.terminate();await new Promise(resolve=>sockets.close(resolve));await new Promise(resolve=>server.close(resolve));},
  };
}

export function createDesktopSource(link){
  let environments=new Map(),shell={threads:[],projects:[]};
  const scopeItem=(item,environmentId)=>{
    const copy={...item};
    if(copy.childThreadId)copy.childThreadId=scopedId(environmentId,copy.childThreadId);
    if(copy.source?.childThreadId)copy.source={...copy.source,childThreadId:scopedId(environmentId,copy.source.childThreadId)};
    return copy;
  };
  const target=id=>{
    const ref=unscopedId(id);const environment=environments.get(ref.environmentId);
    if(!environment||!environment.connected)throw fail('This environment is offline. Reconnect it in T3 Code.');
    return {...ref,environment};
  };
  return {
    get environments(){return [...environments.values()];},
    get canSend(){return link.connected&&[...environments.values()].some(e=>e.connected&&e.canSend);},
    disconnected(){
      environments=new Map([...environments].map(([id,e])=>[id,{...e,connected:false,canSend:false}]));
      shell={...shell,threads:shell.threads.map(t=>({...t,environmentConnected:false,canSend:false}))};
      return shell;
    },
    async readShell(){
      const data=await link.request('shell');
      if(!Array.isArray(data.environments)||data.environments.length>100)throw fail('Unsupported desktop snapshot.');
      const next=new Map(),threads=[],projects=[];
      for(const env of data.environments){
        validateId(env.id);if(next.has(env.id)||!Array.isArray(env.threads)||!Array.isArray(env.projects))throw fail('Invalid desktop environment.');
        const meta={id:env.id,label:String(env.label||'Environment'),connected:env.connected===true,canSend:env.connected===true&&env.canSend===true};next.set(env.id,meta);
        for(const p of env.projects)projects.push({...p,id:scopedId(env.id,p.id)});
        for(const t of env.threads)threads.push({...t,id:scopedId(env.id,t.id),projectId:scopedId(env.id,t.projectId),environmentId:env.id,environmentLabel:meta.label,environmentConnected:meta.connected,canSend:meta.canSend});
      }
      environments=next;shell={threads,projects};return shell;
    },
    async read(id,{cursor,itemId}={}){
      const {environment, ...ref}=target(id);
      if(itemId){validateId(itemId);const result=await link.request('item',{...ref,itemId});return {item:scopeItem(timelineItem({item:result.item,sourceThreadId:ref.threadId,sourceItemId:itemId,position:0}).item,ref.environmentId)};}
      if(cursor!==undefined&&(typeof cursor!=='string'||!cursor||cursor.length>12000))throw fail('Invalid history cursor.',400);
      const data=await link.request(cursor===undefined?'thread':'history',{...ref,...(cursor===undefined?{}:{cursor})});
      let result;
      if(cursor!==undefined)result=historyPage(data);
      else{
        const raw=shell.threads.find(t=>t.id===id);
        const projectId=scopedId(ref.environmentId,data.projection.thread.projectId);
        const project=shell.projects.find(p=>p.id===projectId);
        const projection={...data.projection,thread:{...data.projection.thread,id,projectId:scopedId(ref.environmentId,data.projection.thread.projectId)}};
        result=threadDetail({...data,projection},raw,project);
        result.thread={...result.thread,id,environmentId:ref.environmentId,environmentLabel:environment.label,environmentConnected:true,canSend:environment.canSend};
      }
      result.items=result.items.map(row=>({...row,item:scopeItem(row.item,ref.environmentId)}));return result;
    },
    async send(id,input){
      validateMessage(input);const {environment,...ref}=target(id);
      if(!environment.canSend)throw fail('This environment is read only in T3 Code.',403);
      return link.request('send',{...ref,...input});
    },
  };
}
