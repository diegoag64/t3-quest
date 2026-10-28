import {threads,settledThreads,conversation,older} from '/fixture.mjs';
const drafts=new Map();
window.previewActions=[];
const params=new URLSearchParams(location.search);
const scenario=params.get('scenario')||'default';
let selected;
const composer=()=>window.QuestView.receive({kind:'composer',threadId:selected,payload:{canSend:true,canRecord:true,status:'draft',text:'',...drafts.get(selected)}});
function open(id){
  selected=id;
  if(window.QuestTest.state.mode==='thread')window.QuestView.selectThread(id);else window.QuestView.configure({mode:'thread',threadId:id});
  const thread=threads.find(t=>t.id===id)||settledThreads.find(t=>t.id===id);
  const detail=structuredClone(conversation);detail.thread=thread;
  if(scenario==='long')detail.items.at(-1).item.text+='\n\n'+Array.from({length:50},(_,i)=>'Paragraph '+i+': '+('Long unbroken text '+ 'x'.repeat(100)+' ')).join('\n\n');
  window.QuestView.receive({kind:'snapshot',threadId:id,payload:detail});composer();
  if(scenario==='offline')window.QuestView.receive({kind:'error',threadId:id,payload:{message:'Laptop disconnected. Showing the last conversation.'}});
}
window.addEventListener('quest-request',e=>{
  const {action,payload}=e.detail;window.previewActions.push(e.detail);
  if(action==='openThread')open(payload.id);
  if(action==='compact')window.QuestView.configure({mode:'list'});
  if(action==='loadHistory')window.QuestView.receive({kind:'history',threadId:selected,payload:{items:older,hasMoreHistory:false,historyCursor:null}});
  if(action==='draftChanged'){drafts.set(selected,{text:payload.text,status:'draft'});}
  if(action==='discardDraft'){drafts.set(selected,{text:'',status:'draft'});composer();}
  if(action==='dictateStart'){drafts.set(selected,{...drafts.get(selected),status:'recording',seconds:4});composer();}
  if(action==='dictateStop'){drafts.set(selected,{text:'Please check the failing tests.',status:'draft'});composer();}
  if(action==='dictateCancel'){drafts.set(selected,{...drafts.get(selected),status:'draft'});composer();}
  if(action==='sendMessage'){drafts.set(selected,{text:'',status:'sent'});composer();}
});
window.QuestView.receive({kind:'list',payload:{threads:scenario==='empty'?[]:threads,settledThreads:scenario==='empty'?[]:settledThreads}});
if(params.get('mode')==='reader')open('reader');
window.previewReady=true;
