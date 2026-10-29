import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {normalizePullRequests} from './pull-requests.mjs';
const execute=promisify(execFile);
const fields='number,title,isDraft,headRefName,baseRefName,reviewDecision,mergeable,statusCheckRollup,updatedAt';
export async function githubRead(args){
  try{
    const {stdout}=await execute('gh',args,{timeout:15000,maxBuffer:2_000_000,windowsHide:true,env:{...process.env,GH_PROMPT_DISABLED:'1',GH_PAGER:'cat'}});
    return JSON.parse(stdout);
  }catch{throw new Error('GitHub unavailable. Check gh auth login on your laptop and repository access.');}
}
export function checkState(checks){
  if(!Array.isArray(checks)||!checks.length)return 'unknown';
  const failure=new Set(['FAILURE','ERROR','TIMED_OUT','CANCELLED','ACTION_REQUIRED','STARTUP_FAILURE','STALE']);
  if(checks.some(c=>failure.has(c.conclusion)||failure.has(c.state)))return 'failing';
  if(checks.some(c=>c.state==='PENDING'||(c.status&&c.status!=='COMPLETED')))return 'pending';
  return checks.every(c=>['SUCCESS','NEUTRAL','SKIPPED'].includes(c.conclusion)||c.state==='SUCCESS')?'passing':'unknown';
}
export async function readRepository(repository,read=githubRead,now=Date.now()){
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||repository.split('/').some(s=>s==='.'||s==='..'))throw new Error('Invalid repository');
  const [prs,issues]=await Promise.all([
    read(['pr','list','--repo','github.com/'+repository,'--state','open','--limit','20','--json',fields]),
    read(['api','--hostname','github.com','--method','GET',`repos/${repository}/issues?state=open&sort=updated&per_page=30`]),
  ]);
  if(!Array.isArray(prs)||!Array.isArray(issues))throw new Error('Unsupported GitHub response');
  const syncedAt=new Date(now).toISOString();
  const pullRequests=normalizePullRequests({pullRequests:prs.slice(0,20).map(p=>({repository,number:p.number,url:`https://github.com/${repository}/pull/${p.number}`,snapshot:{state:'open',title:p.title,isDraft:p.isDraft,headBranch:p.headRefName,baseBranch:p.baseRefName,syncedAt,checksState:checkState(p.statusCheckRollup),reviewDecision:({'APPROVED':'approved','CHANGES_REQUESTED':'changes-requested','REVIEW_REQUIRED':'review-required'})[p.reviewDecision],mergeability:({'MERGEABLE':'mergeable','CONFLICTING':'conflicting'})[p.mergeable]}}))},now);
  return {repository,url:'https://github.com/'+repository,source:'github',fetchedAt:syncedAt,stale:false,
    partial:prs.length>=20||issues.length>=30||issues.filter(i=>!i.pull_request).length>20,pullRequests,
    issues:issues.filter(i=>!i.pull_request&&Number.isSafeInteger(i.number)&&i.number>0).slice(0,20).map(i=>({number:i.number,title:String(i.title||'Untitled issue').slice(0,500),url:`https://github.com/${repository}/issues/${i.number}`,labels:(i.labels||[]).slice(0,6).map(l=>typeof l==='string'?l:l.name).filter(Boolean),milestone:i.milestone?.title||null,updatedAt:i.updated_at})),
  };
}
export function createRepositoryReader(threadSource,read=githubRead,clock=Date.now){
  const cache=new Map(),pending=new Map();
  async function load(repository){
    const old=cache.get(repository);
    if(old&&clock()-old.at<60000)return old.value;
    if(pending.has(repository))return pending.get(repository);
    const promise=readRepository(repository,read,clock()).then(value=>{cache.set(repository,{at:clock(),value});while(cache.size>30)cache.delete(cache.keys().next().value);return value;}).catch(()=>{
      const value=old?{...old.value,stale:true,pullRequests:old.value.pullRequests.map(pr=>({...pr,stale:true,nextStep:'Refresh status on GitHub'}))}:{repository,pullRequests:[],issues:[],stale:true};
      const result={...value,error:'GitHub unavailable. Check gh auth login on your laptop and repository access.'};
      // Back off failures too, so repeated panel clicks do not hammer GitHub.
      cache.set(repository,{at:clock(),value:result});return result;
    }).finally(()=>pending.delete(repository));
    pending.set(repository,promise);return promise;
  }
  return async id=>{
    const thread=threadSource().find(t=>t.id===id&&!t.deletedAt&&!t.archivedAt);
    if(!thread)throw Object.assign(new Error('Thread no longer available.'),{status:404});
    const repositories=[...new Set(normalizePullRequests(thread,clock()).map(p=>p.repository))];
    return {repositories:await Promise.all(repositories.slice(0,3).map(load)),partial:repositories.length>3};
  };
}
