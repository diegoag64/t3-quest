import {EnvironmentId,ThreadId,TurnItemId,CommandId,MessageId,AuthOrchestrationReadScope,AuthOrchestrationOperateScope,ORCHESTRATION_V2_WS_METHODS} from '@t3tools/contracts';
import {createEnvironmentRpcCommand} from '@t3tools/client-runtime/state/runtime';
import {appAtomRegistry} from '../rpc/atomRegistry';
import {connectionAtomRuntime} from '../connection/runtime';
import {enabledEnvironmentIds} from '@t3tools/client-runtime/state/connections';
import {environmentCatalog} from '../connection/catalog';
import {environmentSummaries} from '../state/presentation';
import {environmentShell} from '../state/shell';
import {environmentThreadDetails,threadEnvironment} from '../state/threads';
import {readEnvironmentScope} from '../state/session';
import {waitForAtomValue} from '../state/waitForAtomValue';
import * as Option from 'effect/Option';
import {connectCompanion} from './client.mjs';

declare global {interface Window {questCompanion?:{configuration:()=>Promise<{url:string;token:string}|null>}}}
const itemCommand=createEnvironmentRpcCommand(connectionAtomRuntime,{label:'quest:item',tag:ORCHESTRATION_V2_WS_METHODS.getTurnItem});
const sendCommand=createEnvironmentRpcCommand(connectionAtomRuntime,{label:'quest:send',tag:ORCHESTRATION_V2_WS_METHODS.dispatchCommand});
const leases=new Map<string,{dispose:()=>void;timer:ReturnType<typeof setTimeout>}>();
const denied=()=>Object.assign(new Error('Connection unavailable or permission denied'),{status:403});
function release(){for(const lease of leases.values()){clearTimeout(lease.timer);lease.dispose();}leases.clear();}
function leaseThread(environmentId:EnvironmentId,threadId:ThreadId){
  const key=JSON.stringify([environmentId,threadId]),old=leases.get(key);
  if(old)clearTimeout(old.timer);
  else if(leases.size>=4){const first=leases.keys().next().value!;const entry=leases.get(first)!;clearTimeout(entry.timer);entry.dispose();leases.delete(first);}
  const ref={environmentId,threadId};
  const dispose=old?.dispose??appAtomRegistry.mount(environmentThreadDetails.threadAtom(ref));
  leases.set(key,{dispose,timer:setTimeout(()=>{dispose();leases.delete(key);},30000)});
  return ref;
}
async function execute(method:string,input:Record<string,string>){
  const enabled=new Set(enabledEnvironmentIds(appAtomRegistry.get(environmentCatalog.catalogValueAtom)));
  const identities=appAtomRegistry.get(environmentSummaries.identitiesAtom).filter(i=>enabled.has(i.environmentId));
  const connected=new Set(appAtomRegistry.get(environmentSummaries.connectedEnvironmentIdsAtom));
  if(method==='shell')return {environments:identities.map(identity=>{
    const id=identity.environmentId;
    const state=appAtomRegistry.get(environmentShell.stateValueAtom(id));
    const snapshot=Option.getOrNull(state.snapshot);
    const readable=readEnvironmentScope(id,AuthOrchestrationReadScope);
    return {id,label:identity.label,connected:connected.has(id)&&state.status==='live'&&readable,
      canSend:readEnvironmentScope(id,AuthOrchestrationOperateScope),
      projects:snapshot?.projects??[],threads:snapshot?.threads??[]};
  })};
  const environmentId=EnvironmentId.make(input.environmentId!),threadId=ThreadId.make(input.threadId!);
  if(!identities.some(i=>i.environmentId===environmentId)||!connected.has(environmentId)||!readEnvironmentScope(environmentId,AuthOrchestrationReadScope))throw denied();
  if(method==='item'){
    const result=await itemCommand.run(appAtomRegistry,{environmentId,input:{threadId,itemId:TurnItemId.make(input.itemId!)}});
    if(result._tag!=='Success')throw Error('Output unavailable');return result.value;
  }
  if(method==='send'){
    if(!readEnvironmentScope(environmentId,AuthOrchestrationOperateScope))throw denied();
    const bytes=new TextEncoder().encode(JSON.stringify([environmentId,threadId,input.requestId]));
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const messageId=MessageId.make('quest-message:'+digest);
    const result=await sendCommand.run(appAtomRegistry,{environmentId,input:{type:'message.dispatch',commandId:CommandId.make('quest:'+digest),messageId,threadId,text:input.text!,attachments:[],createdBy:'user',creationSource:'mobile',dispatchMode:{type:'queue_after_active'}}});
    if(result._tag!=='Success')throw Error('Delivery not confirmed');
    return {ok:true,requestId:input.requestId,messageId,sequence:result.value.sequence};
  }
  const ref=leaseThread(environmentId,threadId);
  const atom=environmentThreadDetails.statusAtom(ref);
  const ready=await waitForAtomValue({registry:appAtomRegistry,atom,predicate:value=>value==='live'||value==='deleted',timeoutMs:12000});
  if(!ready||appAtomRegistry.get(atom)!=='live')throw Error('Thread unavailable');
  if(method==='history'){
    const current=appAtomRegistry.get(environmentThreadDetails.historyAtom(ref));
    if(current.historyCursor===input.cursor){
      const result=await threadEnvironment.loadEarlierHistory.run(appAtomRegistry,{environmentId,input:{threadId}});
      if(result._tag!=='Success'||result.value._tag==='error'||result.value._tag==='busy')throw Error('History unavailable');
    }
  }
  const projection=appAtomRegistry.get(environmentThreadDetails.threadAtom(ref))?.projection;
  if(!projection)throw Error('Thread unavailable');
  const history=appAtomRegistry.get(environmentThreadDetails.historyAtom(ref));
  if(method==='history')return {items:projection.visibleTurnItems,nextCursor:history.historyCursor,hasMoreHistory:history.hasMoreHistory};
  // Provider session/turn records never cross the companion boundary.
  return {projection:{thread:projection.thread,runs:projection.runs,visibleTurnItems:projection.visibleTurnItems,updatedAt:projection.updatedAt},historyCursor:history.historyCursor,hasMoreHistory:history.hasMoreHistory};
}

export async function startQuestCompanion(){
  const config=await window.questCompanion?.configuration();
  if(!config)return;
  const stop=connectCompanion(config,execute,{onDisconnect:release});
  window.addEventListener('beforeunload',stop,{once:true});
}
