// Synthetic conversations only. This module never reads the user's bridge or GitHub session.
export const threads = [
  {id:'reader',title:'Polish the Quest thread reader',project:'t3-quest',branch:'feat/reader',provider:'codex',status:'completed',modelSelection:{model:'gpt-6-astra'},pullRequests:[]},
  {id:'working',title:'Investigate the failing integration test',project:'t3-quest',branch:'fix/retry',provider:'claude',status:'running'},
  {id:'approval',title:'Review the deployment plan',project:'website',branch:'preview',provider:'codex',status:'needs-you',pendingRuntimeRequest:{kind:'approval'}},
  {id:'failed',title:'Build the Android release',project:'t3-quest',branch:'main',provider:'codex',status:'failed'},
  {id:'waiting',title:'Wait for the preview deployment',project:'website',provider:'claude',status:'waiting'},
  ...Array.from({length:8},(_,n)=>({id:'task-'+n,title:'Check repository task '+(n+1),project:'t3-quest',branch:'main',provider:'codex',status:'completed'})),
];
threads[0].pullRequests=[{host:'github.com',repository:'example/t3-quest',number:42,url:'https://github.com/example/t3-quest/pull/42',title:'Keep the reader centered',state:'open',isDraft:false,checks:'passing',review:'review-required',headBranch:'feat/reader',baseBranch:'main',stale:false,syncedAt:new Date().toISOString(),nextStep:'Get a review',stack:[]}];
threads[1].pullRequests=[{...threads[0].pullRequests[0],number:43,url:'https://github.com/example/t3-quest/pull/43',title:'Retry interrupted requests',checks:'failing',review:'approved',nextStep:'Fix failing checks'}];
export const settledThreads=[{...threads[0],pullRequests:[],id:'settled',title:'Set up the compact panel',settledAt:'2026-10-27T12:00:00Z'}];
const row=(id,position,type,extra)=>({id,position,item:{id,type,runId:'run-1',status:'completed',...extra}});
export const conversation = {
  thread:threads[0],
  runs:[{id:'run-1',status:'completed',startedAt:'2026-10-28T01:00:00Z',completedAt:'2026-10-28T01:00:22Z'}],
  items:[
    row('user',1,'user_message',{text:'Make the thread reader easier to scan. Keep the compact panel in its original place.'}),
    row('progress',2,'assistant_message',{text:'I will check the panel geometry, then verify the reader and its scroll behavior.'}),
    row('command',3,'command_execution',{input:'npm test',output:'35 tests passed. No failed tests.',exitCode:0}),
    row('diff',4,'file_change',{fileName:'panel.css',diffStr:'-height: auto;\n+height: 100%;\n+min-height: 0;'}),
    row('child',5,'subagent',{title:'Review conversation layout',childThreadId:'working',providerInstanceId:'codex',result:'The history remains visible and scrollable.'}),
    row('answer',6,'assistant_message',{text:'The reader now keeps its history visible. The compact panel stays in place when you open a thread and return.\n\n- The reader uses the available height.\n- Long tool output stays inside its own scroll area.\n- Drafts stay attached to their thread.\n\n```js\nconst reader = { width: 1000, height: 780 };\n```\n\nSee [the pull request](https://github.com/example/t3-quest/pull/42) for the changes.\n\n### Verification\n\n| Check | Result |\n| --- | --- |\n| History scrolling | Passed |\n| Draft navigation | Passed |\n| Background microphone | Needs headset check |\n\nNext, review the PR checks before testing the headset.'}),
  ],hasMoreHistory:true,historyCursor:'fixture-history',
};
export const older=[row('older',0,'assistant_message',{runId:'older-run',text:'Earlier discussion: use the same reader and preserve the list position.'})];
