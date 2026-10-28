// Runs inside the desktop renderer. Only these operations cross the companion link.
export function validateRequest(request){
  const methods=new Set(['shell','thread','history','item','send']);
  if(request?.type!=='request'||typeof request.id!=='string'||request.id.length>100||!methods.has(request.method))throw Error('Invalid request');
  const input=request.input;
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid input');
  const fields={shell:[],thread:['environmentId','threadId'],history:['environmentId','threadId','cursor'],item:['environmentId','threadId','itemId'],send:['environmentId','threadId','text','requestId']}[request.method];
  if(Object.keys(input).some(k=>!fields.includes(k))||fields.some(k=>typeof input[k]!=='string'||!input[k]||input[k].length>(k==='text'||k==='cursor'?12000:2000)))throw Error('Invalid fields');
  if(request.method==='send'&&(!input.text.trim()||! /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.requestId)))throw Error('Invalid draft');
  return request;
}

export function connectCompanion(config,execute,{Socket=WebSocket,onDisconnect=()=>{}}={}){
  const url=new URL(config.url);
  if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||url.pathname!=='/desktop'||url.search||url.hash||url.username||url.password||! /^[a-f0-9]{64}$/.test(config.token))throw Error('Invalid companion link');
  let stopped=false,socket,timer,active=0;
  function connect(){
    if(stopped)return;
    const current=socket=new Socket(config.url);
    current.onopen=()=>current.send(JSON.stringify({type:'hello',protocol:1,token:config.token}));
    current.onerror=()=>{};
    current.onmessage=async event=>{
      let request;
      try{
        if(typeof event.data!=='string'||event.data.length>32000)throw Error();
        const data=JSON.parse(event.data);if(data.type==='ready')return;
        request=validateRequest(data);if(active>=8)throw Error('Too many requests');active++;
        try{
          const value=await execute(request.method,request.input);
          if(current.readyState===1)current.send(JSON.stringify({type:'result',id:request.id,ok:true,value}));
        }finally{active--;}
      }catch(error){if(request&&current.readyState===1)current.send(JSON.stringify({type:'result',id:request.id,ok:false,status:error?.status===403?403:503}));else current.close(1008);}
    };
    current.onclose=()=>{onDisconnect();if(!stopped)timer=setTimeout(connect,2000);};
  }
  connect();return ()=>{stopped=true;clearTimeout(timer);socket?.close();onDisconnect();};
}
