(() => {
  'use strict';
  const app = document.getElementById('app');
  const state = { mode:'list', threads:[], settledThreads:[], selected:null, detail:null, items:[], historyLoaded:false, query:'', project:'', loadingHistory:false, signature:'', loadedItems:new Map(), composer:null, sidebarTab:'threads', repository:null, repositoryLoading:false, repositoryError:'' };
  const colors={gray:'#9ca3af',red:'#f87171',orange:'#fb923c',amber:'#fbbf24',yellow:'#facc15',lime:'#a3e635',green:'#4ade80',emerald:'#34d399',teal:'#2dd4bf',cyan:'#22d3ee',sky:'#38bdf8',blue:'#60a5fa',indigo:'#818cf8',violet:'#a78bfa',purple:'#c084fc',fuchsia:'#e879f9',pink:'#f472b6',rose:'#fb7185'};
  const paths={back:'m15 18-6-6 6-6',sidebar:'M9 3v18M3 3h18v18H3z',search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',check:'m8 12 3 3 5-6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',circle:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',alert:'M12 8v5m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',lock:'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4',terminal:'m4 6 6 6-6 6m9 0h7',branch:'M6 3v12a6 6 0 0 0 12 0V9M3 5a3 3 0 1 0 6 0 3 3 0 1 0-6 0M15 6a3 3 0 1 0 6 0 3 3 0 1 0-6 0',file:'M14 2H5v20h14V7zM14 2v6h5',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',gauge:'M4 18a9 9 0 1 1 16 0M12 14l4-6',arrow:'m6 12 6-6 6 6M12 6v14',chevron:'m9 6 6 6-6 6'};
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function icon(name){const box=el('span','icon');box.innerHTML='<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="'+(paths[name]||paths.circle)+'"/></svg>';return box;}
  function button(label,cls,action){const b=el('button',cls,label);b.type='button';b.onclick=action;return b;}
  function request(action,payload={}) {if(window.T3Quest)window.T3Quest.request(action,JSON.stringify(payload));else window.dispatchEvent(new CustomEvent('quest-request',{detail:{action,payload}}));}
  function provider(name){const n=String(name||'').toLowerCase();if(n.includes('codex')||n.includes('openai')){const i=el('img','provider');i.src='codex.svg';i.alt='Codex';return i;}if(n.includes('claude')||n.includes('anthropic')){const i=el('img','provider');i.src='claude.svg';i.alt='Claude';return i;}const i=icon('spark');i.title=name||'Agent';return i;}
  // Same generated badge algorithm as T3 Code projectIdentity.ts.
  function identity(name,override){const normalized=String(name||'Project').normalize('NFKC').trim();const words=normalized.match(/[\p{L}\p{N}]+/gu)||[];const glyphs=Array.from(words[0]||'PR');const second=glyphs.slice(1).find(g=>/\p{N}/u.test(g))||(words.length>1?Array.from(words.at(-1))[0]:glyphs.at(-1))||glyphs[0];let index=0;for(const glyph of normalized.toLocaleLowerCase('en-US')||'project')index=(index*31+glyph.codePointAt(0))%Object.keys(colors).length;return {text:override?.kind==='monogram'?override.text:override?.kind==='emoji'?override.emoji:Array.from((glyphs[0]+second).toUpperCase()).slice(0,2).join(''),color:colors[override?.color]||Object.values(colors)[index]};}
  function badge(t){const id=identity(t.project,t.projectIcon);const b=el('span','badge',id.text);b.style.color=id.color;b.style.backgroundColor=id.color+'24';return b;}
  function projectLabel(t){const p=el('span','project-label');p.append(badge(t),el('span','truncate',t.project||'Project'));return p;}
  function status(t){if(t.pendingRuntimeRequest){const approval=/approval|permission/.test(t.pendingRuntimeRequest.kind||'');return {label:approval?'Approval':'Input',cls:approval?'approval':'input',icon:'alert'};}if(t.status==='needs-you')return {label:'Input',cls:'input',icon:'alert'};if(t.status==='running')return {label:'Working',cls:'working',icon:'circle'};if(t.status==='waiting')return {label:'Waiting',cls:'',icon:'circle'};if(t.status==='failed')return {label:'Failed',cls:'failed',icon:'alert'};if(t.status==='completed')return {label:'Done',cls:'done',icon:'check'};if(t.status==='interrupted')return {label:'Stopped',cls:'',icon:'circle'};return {label:'',cls:'',icon:'circle'};}
  function statusNode(t){const v=status(t),n=el('span','status '+v.cls);if(v.label)n.append(icon(v.icon),document.createTextNode(v.label));return n;}
  function row(t){const b=button('', 'thread-row'+(t.id===state.selected?' active':''),()=>request('openThread',{id:t.id}));b.title=t.title;b.dataset.threadId=t.id;const top=el('div','row-top');top.append(projectLabel(t),statusNode(t));const title=el('div','row-title');title.append(el('span','truncate',t.title||'Untitled'));b.append(top,title);if(t.branch){const branch=el('div','row-branch');branch.append(el('span','truncate',t.branch));if(t.pullRequests?.length)branch.append(el('span','pr-inline','#'+t.pullRequests[0].number));branch.append(provider(t.provider));b.append(branch);}else title.append(provider(t.provider));return b;}
  function makeSidebar(){const aside=el('aside','sidebar');const search=el('div','search-row');const field=el('input');field.type='search';field.placeholder='Search';field.setAttribute('aria-label','Search threads');field.value=state.query;field.oninput=()=>{state.query=field.value;renderLists();};const select=el('select','project-select');select.setAttribute('aria-label','Filter by project');select.onchange=()=>{state.project=select.value;renderLists();};search.append(icon('search'),field,select);const tabs=el('div','sidebar-tabs');for(const [key,label] of [['threads','Threads'],['prs','Pull requests']]){const tab=button(label,'sidebar-tab',()=>{state.sidebarTab=key;renderLists();});tab.dataset.tab=key;tabs.append(tab);}aside.append(search,tabs,el('div','sidebar-list'),el('div','sidebar-footer','Synced from your laptop'));return aside;}
  function prCard(pr,threadId){
    const card=el('article','pr-card');
    const title=button('', 'pr-title',()=>threadId?request('openThread',{id:threadId}):request('openLink',{url:pr.url}));
    title.append(icon('branch'),el('span','pr-number','#'+pr.number),el('span','truncate',pr.title));
    card.append(title,el('div','pr-repository',pr.repository));
    const signals=el('div','pr-signals');
    const lifecycle=pr.isDraft&&pr.state==='open'?'Draft':pr.state==='merged'?'Merged':pr.state==='closed'?'Closed':pr.state==='open'?'Open':'Unknown';
    signals.append(el('span','pr-state '+pr.state,lifecycle));
    if(pr.state==='open'){
      const checks={passing:'Checks passed',failing:'Checks failed',pending:'Checks pending',unknown:'Checks unknown'};
      const review={approved:'Approved','changes-requested':'Changes requested','review-required':'Review required',unknown:'Review unknown'};
      signals.append(el('span','pr-checks '+pr.checks,checks[pr.checks]||checks.unknown),el('span','pr-review',review[pr.review]||review.unknown));
    }
    card.append(signals,el('div','pr-next',pr.nextStep||'Check status on GitHub'));
    if(pr.headBranch)card.append(el('div','pr-branches',pr.headBranch+' → '+pr.baseBranch));
    if(pr.stack?.length){const stack=el('div','pr-stack');stack.append(el('span','muted','Stack, base first'));for(const layer of pr.stack)stack.append(el('div','',`#${layer.number} · ${layer.headBranch} · ${layer.state}`));card.append(stack);}
    const freshness=el('div','pr-freshness'+(pr.stale?' stale':''),pr.stale?'Status may be outdated':pr.source==='github'?'Fetched from GitHub':'Synced from T3');
    if(pr.syncedAt)freshness.title='Last synced '+pr.syncedAt;
    card.append(freshness);
    if(!threadId)card.append(button('Open on GitHub','pr-open',()=>request('openLink',{url:pr.url})));
    return card;
  }
  function renderPullRequests(){
    const pane=document.querySelector('.pr-panel');if(!pane)return;
    const scroll=pane.querySelector('.pr-list')?.scrollTop||0;
    const header=el('div','pr-panel-header');header.append(el('strong','','Pull requests'),button('Close','pr-close',()=>{pane.hidden=true;document.querySelector('.pr-toggle')?.setAttribute('aria-expanded','false');}));
    const list=el('div','pr-list');const prs=state.detail?.thread?.pullRequests||[];
    if(!prs.length)list.append(el('div','empty','No pull requests linked to this thread. Link one in T3 Code on your laptop.'));
    for(const pr of prs)list.append(prCard(pr));
    const repository=el('section','repository-section');
    const refresh=button(state.repositoryLoading?'Loading repository…':state.repository?'Refresh repository':'Repository activity','pr-open',()=>{state.repositoryLoading=true;state.repositoryError='';renderPullRequests();request('loadRepository',{threadId:state.selected});});
    refresh.disabled=state.repositoryLoading;repository.append(refresh);
    if(state.repositoryError)repository.append(el('p','pr-freshness stale',state.repositoryError));
    if(state.repository){
      if(!state.repository.repositories?.length)repository.append(el('p','muted','Link a GitHub PR in T3 to identify this thread’s repository.'));
      for(const repo of state.repository.repositories||[]){
        repository.append(el('h3','repository-title',repo.repository));
        if(repo.error)repository.append(el('p','pr-freshness stale',repo.error));
        if(repo.fetchedAt)repository.append(el('div','pr-freshness'+(repo.stale?' stale':''),(repo.stale?'Last successful fetch: ':'Fetched: ')+new Date(repo.fetchedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})));
        repository.append(el('h4','','Open pull requests'));
        if(!repo.pullRequests.length)repository.append(el('p','muted',repo.error?'Pull requests unavailable.':'No open pull requests.'));
        for(const pr of repo.pullRequests)repository.append(prCard({...pr,source:'github'}));
        repository.append(el('h4','','Open issues'));
        repository.append(el('p','pr-freshness','Recently updated. This order is not a priority ranking.'));
        if(!repo.issues.length)repository.append(el('p','muted',repo.error?'Issues unavailable.':'No open issues.'));
        for(const issue of repo.issues){
          const card=el('article','issue-card');card.append(button('#'+issue.number+' '+issue.title,'issue-title',()=>request('openLink',{url:issue.url})));
          if(issue.labels?.length)card.append(el('div','pr-freshness',issue.labels.join(' · ')));
          if(issue.milestone)card.append(el('div','pr-freshness','Milestone: '+issue.milestone));
          repository.append(card);
        }
        if(repo.partial)repository.append(el('p','pr-freshness','Showing a limited selection. Open GitHub for the full repository.'));
      }
      if(state.repository.partial)repository.append(el('p','pr-freshness','Showing the first three linked repositories.'));
    }
    list.append(repository);pane.replaceChildren(header,list);list.scrollTop=scroll;
    const toggle=document.querySelector('.pr-toggle');if(toggle)toggle.textContent='PRs'+(prs.length?' · '+prs.length:'');
  }
  function renderLists(){
    for(const aside of document.querySelectorAll('.sidebar')){
      const select=aside.querySelector('select');
      const projects=[...new Set([...state.threads,...state.settledThreads].map(t=>t.project))].sort();
      select.replaceChildren(new Option('All projects',''),...projects.map(p=>new Option(p,p)));
      if(projects.includes(state.project))select.value=state.project;else state.project='';
      for(const tab of aside.querySelectorAll('.sidebar-tab'))tab.setAttribute('aria-pressed',String(tab.dataset.tab===state.sidebarTab));
      const list=aside.querySelector('.sidebar-list');const open=list.querySelector('.settled')?.open;const scroll=list.scrollTop;list.replaceChildren();
      const filter=t=>(!state.project||t.project===state.project)&&[t.title,t.project,t.branch].join(' ').toLowerCase().includes(state.query.toLowerCase());
      if(state.sidebarTab==='prs'){
        const seen=new Set();
        for(const t of [...state.threads,...state.settledThreads]){
          if(state.project&&t.project!==state.project)continue;
          for(const pr of t.pullRequests||[]){
            if(seen.has(pr.url)||![pr.title,pr.repository,pr.number,t.title].join(' ').toLowerCase().includes(state.query.toLowerCase()))continue;
            seen.add(pr.url);list.append(prCard(pr,t.id));
          }
        }
        if(!seen.size)list.append(el('div','empty',state.query?'No matching pull requests.':'No linked pull requests. Link a PR to a thread in T3 Code.'));
      }else{
        const active=state.threads.filter(filter);active.forEach(t=>list.append(row(t)));
        if(!active.length)list.append(el('div','empty',state.query?'No matching threads.':'No active threads. Connect your laptop or check Settled below.'));
        const settled=state.settledThreads.filter(filter);
        if(settled.length){const group=el('details','settled');group.open=!!open||!!state.query;group.append(el('summary','',`Settled  ·  ${settled.length}`));settled.forEach(t=>group.append(row(t)));list.append(group);}
      }
      list.scrollTop=scroll;
    }
  }
  function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  const markdownRenderer=new marked.Renderer();
  markdownRenderer.image=({text})=>'<span class="image-label">Image: '+escape(text||'attachment')+'</span>';
  function markdown(text){const n=el('div','markdown');const html=marked.parse(String(text||''),{breaks:false,gfm:true,renderer:markdownRenderer});n.innerHTML=DOMPurify.sanitize(html,{ALLOWED_TAGS:['p','br','strong','em','del','s','ul','ol','li','blockquote','pre','code','h1','h2','h3','h4','h5','h6','a','table','thead','tbody','tr','th','td','hr','span','sup','sub','input'],ALLOWED_ATTR:['href','title','class','start','type','checked','disabled'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false});n.querySelectorAll('input').forEach(i=>{i.disabled=true;i.type='checkbox';});for(const a of n.querySelectorAll('a')){const href=a.getAttribute('href')||'';a.removeAttribute('target');a.onclick=e=>{e.preventDefault();if(/^https?:\/\//i.test(href))request('openLink',{url:href});else request('notice',{text:'File links can be opened in T3 Code on your laptop.'});};}return n;}
  function valueText(v){if(v==null)return '';return typeof v==='string'?v:JSON.stringify(v,null,2);}
  function commandLabel(i){if(i.type==='reasoning')return 'Thought';if(i.type==='command_execution')return i.input||'Command';if(i.type==='dynamic_tool'){const input=i.input;return i.title||input?.command||input?.cmd||input?.description||String(i.toolName||'Tool').replace(/^.*__/, '').replace(/_/g,' ');}return i.title||i.fileName||i.message||i.summary||i.failure?.message||i.type.replace(/_/g,' ');}
  function itemDetails(i){const content=el('div','tool-content');if(i.type==='reasoning'||i.type==='proposed_plan')content.append(markdown(i.text||i.markdown));else if(i.type==='file_change'){const diff=i.diffStr||i.changes?.map(c=>c.diff||c.diffStr||valueText(c)).join('\n')||(i.oldStr||'')+'\n'+(i.newStr||'');const pre=el('pre','tool-output');for(const line of String(diff||'File changed').split('\n')){const s=el('span',line.startsWith('+')?'diff-add':line.startsWith('-')?'diff-remove':'',line+'\n');pre.append(s);}content.append(pre);}else if(i.type==='todo_list'){for(const step of i.steps||[])content.append(el('p','',`${step.status==='completed'?'✓':'○'} ${step.step||step.text||step.title||''}`));}else {const input=i.type==='command_execution'?i.input:i.input||i.prompt||i.detail;const output=i.output??i.result??i.failure??i.results??i.questions??i.steps??i.files??i.message??i.summary;if(input)content.append(el('pre','tool-output',valueText(input)));if(output)content.append(el('pre','tool-output',valueText(output)));if(i.exitCode!==undefined)content.append(el('div','muted','Exit code '+i.exitCode));}
    if(i.outputOmitted){const fetch=button('Load full output','fetch-output',()=>{fetch.disabled=true;fetch.textContent='Loading output…';request('loadItem',{threadId:state.selected,itemId:i.id});});content.append(fetch);content.dataset.itemId=i.id;}return content;}
  function tool(i){const d=el('details','tool');d.dataset.foldId=i.id;const summary=el('summary');summary.append(icon(i.type==='command_execution'?'terminal':i.type==='file_change'?'file':i.type==='error'?'alert':'circle'),el('span','truncate tool-label',commandLabel(i)));if(i.status==='failed')summary.style.color='#ff6467';d.append(summary,itemDetails(i));return d;}
  function duration(start,end){const s=(Date.parse(end)-Date.parse(start))/1000;if(!Number.isFinite(s)||s<0)return '';if(s<10)return s.toFixed(1)+'s';if(s<60)return Math.round(s)+'s';return Math.floor(s/60)+'m '+Math.round(s%60)+'s';}
  function workGroup(rows,run){const d=el('details','work entry');d.dataset.foldId='work:'+rows[0].id;d.dataset.entryId=rows[0].id;const elapsed=duration(run?.startedAt,run?.completedAt);d.append(el('summary','',(run?.status==='running'?'Working':elapsed?'Worked for '+elapsed:'Activity')));const body=el('div','work-body');rows.forEach(r=>body.append(['assistant_message','user_message','proposed_plan'].includes(r.item.type)?message(r):r.item.type==='subagent'?subagent(r):tool(r.item)));d.append(body);return d;}
  function subagent(row){const i=row.item;const b=button('','subagent entry',()=>{if(i.childThreadId)request('openThread',{id:i.childThreadId});else{const detail=b.querySelector('.subagent-detail');if(detail)detail.remove();else{const p=markdown(i.result||i.progress||i.prompt);p.classList.add('subagent-detail');b.append(p);}}});b.dataset.entryId=row.id;const line=el('div','subagent-line');const avatar=el('span','subagent-avatar');avatar.append(provider(i.providerInstanceId||i.driver));const body=el('div','subagent-body');body.append(el('div','subagent-title truncate',i.title||'Delegated task'),el('div','subagent-preview truncate',String(i.result||i.progress||i.prompt||'').replace(/[`*_]/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')));line.append(avatar,body,el('span','subagent-status',i.status==='completed'?'Finished':i.status||''),el('span','subagent-time',i.completedAt?new Date(i.completedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):''),icon('chevron'));b.append(line);return b;}
  function message(row){const i=row.item;const n=el('article','entry '+(i.type==='user_message'?'user':'assistant'));n.dataset.entryId=row.id;n.append(markdown(i.text||i.markdown));for(const a of i.attachments||[])n.append(el('span','attachment',a.name||a.fileName||a.mimeType||'Attachment'));return n;}
  function buildTimeline(){
    const nodes=[];const runs=new Map((state.detail?.runs||[]).map(r=>[r.id,r]));const groups=new Map();const finalIds=new Set();
    for(const r of state.items){if(r.item.runId){const rows=groups.get(r.item.runId)||[];rows.push(r);groups.set(r.item.runId,rows);}}
    const folds=new Map(),hidden=new Set();
    for(const [id,rows] of groups){const run=runs.get(id);if(!run||!['completed','failed'].includes(run.status)||rows.some(r=>r.item.streaming))continue;
      const last=rows.findLast(r=>r.item.type==='assistant_message');if(!last)continue;finalIds.add(last.id);
      const folded=rows.filter(r=>r.id!==last.id&&!['user_message','notification','error','user_input_request','approval_request','secret_request','proposed_plan'].includes(r.item.type)&&r.item.status!=='failed'&&!['running','inProgress'].includes(r.item.status)&&(r.item.type!=='checkpoint'||r.item.files?.length));
      if(folded.length){folds.set(folded[0].id,{rows:folded,run});folded.forEach(r=>hidden.add(r.id));}
    }
    let pending=[];const flush=()=>{if(pending.length){nodes.push(workGroup(pending,runs.get(pending[0].item.runId)));pending=[];}};
    for(const r of state.items){const i=r.item;const fold=folds.get(r.id);if(fold){flush();nodes.push(workGroup(fold.rows,fold.run));}if(hidden.has(r.id))continue;
      if(['assistant_message','user_message','proposed_plan'].includes(i.type)){flush();if(finalIds.has(r.id))nodes.push(el('div','run-divider'));nodes.push(message(r));}
      else if(i.type==='subagent'){flush();nodes.push(subagent(r));}
      else if(i.type==='checkpoint'){if(i.files?.length)pending.push(r);}
      else if(['user_input_request','approval_request','secret_request'].includes(i.type)){flush();const q=el('div','entry question');q.dataset.entryId=r.id;q.append(el('strong','',i.type==='approval_request'?'Approval requested':i.type==='secret_request'?'Secret requested':'Input requested'),markdown(i.prompt||i.questions?.map(q=>q.question||q.header).join('\n\n')||i.title||''),el('small','', 'Read only · respond on your laptop'));nodes.push(q);}
      else if(i.type==='notification'||i.type==='error'){flush();const child=i.source?.childThreadId;const task=child&&state.items.find(r=>r.item.type==='subagent'&&r.item.childThreadId===child);if(task)nodes.push(subagent({...r,item:{...task.item,completedAt:i.completedAt||task.item.completedAt}}));else{const n=tool(i);n.classList.add('entry');n.dataset.entryId=r.id;nodes.push(n);}}
      else pending.push(r);
    }flush();return nodes;
  }
  function modelLabel(t){return (t.modelSelection?.model||'Agent').replace(/^gpt-/,'').split('-').map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(' ');}
  function makeComposer(){
    const composer=el('div','composer');
    const input=el('textarea','draft-input');input.maxLength=12000;input.rows=2;input.placeholder='Message this thread…';input.setAttribute('aria-label','Message draft');
    input.oninput=()=>{state.composer={...(state.composer||{}),text:input.value,status:'draft',error:''};request('draftChanged',{threadId:state.selected,text:input.value});updateComposer();};
    const hint=el('div','voice-hint');hint.setAttribute('aria-live','polite');
    const controls=el('div','composer-controls');const model=el('span','composer-model');
    const mic=button('Microphone','voice-start',()=>request('dictateStart',{threadId:state.selected}));mic.setAttribute('aria-label','Record voice draft');
    const stop=button('Stop & transcribe','voice-stop',()=>request('dictateStop',{threadId:state.selected}));
    const cancel=button('Cancel','voice-cancel',()=>request('dictateCancel',{threadId:state.selected}));
    const discard=button('Discard','draft-discard',()=>request('discardDraft',{threadId:state.selected}));
    const send=button('Send','draft-send',()=>request('sendMessage',{threadId:state.selected,text:input.value}));send.setAttribute('aria-label','Send message');
    controls.append(model,mic,stop,cancel,discard,send);composer.append(input,hint,controls);return composer;
  }
  function updateComposer(){
    const c=document.querySelector('.composer');if(!c)return;const d=state.composer||{};const status=d.status||'draft';
    const recording=status==='recording',transcribing=status==='transcribing',sending=status==='sending',uncertain=status==='uncertain';const busy=recording||transcribing||sending;
    const input=c.querySelector('.draft-input');if(input.value!==(d.text||'')&&(document.activeElement!==input||busy||uncertain||status==='sent'))input.value=d.text||'';
    input.readOnly=busy||uncertain;
    const mic=c.querySelector('.voice-start');mic.hidden=recording||transcribing;mic.disabled=sending||uncertain||!d.canRecord||d.otherRecording;
    c.querySelector('.voice-stop').hidden=!recording;c.querySelector('.voice-cancel').hidden=!(recording||transcribing);
    const discard=c.querySelector('.draft-discard');discard.hidden=!input.value;discard.disabled=busy;
    const send=c.querySelector('.draft-send');send.disabled=busy||!d.canSend||!input.value.trim();send.textContent=sending?'Sending…':uncertain?'Retry send':'Send';
    c.querySelector('.voice-hint').textContent=d.error||(recording?`Recording · ${d.seconds||0}s / 60s · you can return focus to Beat Saber`:transcribing?'Transcribing… Review the text before sending.':sending?'Sending to this thread…':status==='sent'?'Sent to T3. It will queue if the thread is busy.':!d.canSend?'Read-only connection · enable sending in Connect.':!d.canRecord?'Set up voice in Connect, or type a message.':'Tap the microphone, speak, then stop and review. Send queues behind active work.');
    c.classList.toggle('recording',recording);
  }
  function updateChrome(t){
    const bread=document.querySelector('.breadcrumb');bread.replaceChildren(projectLabel(t),el('span','muted slash','/'),el('span','title truncate',t.title));
    const footer=document.querySelector('.footer');const composer=footer.querySelector('.composer')||makeComposer();
    let activity='';if(t.pendingBackgroundTasks?.length)activity=`Running ${t.pendingBackgroundTasks.length} background task${t.pendingBackgroundTasks.length===1?'':'s'}`;
    if(t.settledAt)activity+=(activity?' · ':'')+'Settled';else activity+=(activity?' · ':'')+(status(t).label||'Idle');
    const a=el('div','activity-line');a.append(icon(t.settledAt?'check':'circle'),document.createTextNode(activity));
    // Keep the composer mounted while snapshots update, preserving text selection and keyboard focus.
    const prior=footer.querySelector('.activity-line');if(prior)prior.replaceWith(a);else footer.prepend(a);
    if(!composer.isConnected)footer.append(composer);
    const model=composer.querySelector('.composer-model');model.replaceChildren(provider(t.provider),document.createTextNode(modelLabel(t)));
    updateComposer();renderPullRequests();
  }
  function renderTimeline(initial=false){const scroller=document.querySelector('.timeline-scroll');const timeline=document.querySelector('.timeline');if(!timeline)return;const atBottom=initial||scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<100;const open=new Set([...timeline.querySelectorAll('details[open]')].map(n=>n.dataset.foldId));const top=scroller.getBoundingClientRect().top;const anchor=[...timeline.querySelectorAll('[data-entry-id]')].find(n=>n.getBoundingClientRect().bottom>top);const anchorId=anchor?.dataset.entryId;const offset=anchor?anchor.getBoundingClientRect().top-top:0;const oldTop=scroller.scrollTop;
    timeline.replaceChildren();const history=el('div','history-controls');if(state.detail?.hasMoreHistory){const b=button(state.loadingHistory?'Loading history…':'Load earlier messages','older',()=>{state.loadingHistory=true;b.disabled=true;b.textContent='Loading history…';request('loadHistory',{threadId:state.selected,cursor:state.detail.historyCursor});});b.disabled=state.loadingHistory;history.append(b);}else history.append(el('span','muted','Beginning of conversation'));timeline.append(history,...buildTimeline());if(!state.items.length)timeline.append(el('div','empty','No messages in this thread yet.'));for(const d of timeline.querySelectorAll('details'))if(open.has(d.dataset.foldId))d.open=true;
    if(atBottom)scroller.scrollTop=scroller.scrollHeight;else{const replacement=[...timeline.querySelectorAll('[data-entry-id]')].find(n=>n.dataset.entryId===anchorId);scroller.scrollTop=oldTop;if(replacement)scroller.scrollTop+=replacement.getBoundingClientRect().top-top-offset;document.querySelector('.new-messages').hidden=false;}
  }
  function mergeItems(oldRows,newRows){const map=new Map(oldRows.map(r=>[r.id,r]));for(const r of newRows)map.set(r.id,r);return [...map.values()].sort((a,b)=>a.position-b.position);}
  function receive(event){const data=event.payload||{};if(event.kind==='list'){state.threads=data.threads||[];state.settledThreads=data.settledThreads||[];renderLists();return;}
    if(event.threadId&&event.threadId!==state.selected)return;
    if(event.kind==='repository'){state.repository=data;state.repositoryLoading=false;state.repositoryError='';renderPullRequests();return;}
    if(event.kind==='repositoryError'){state.repositoryLoading=false;state.repositoryError='Could not refresh repository activity. Retry when the laptop is connected.';renderPullRequests();return;}
    if(event.kind==='composer'){state.composer=data;updateComposer();return;}
    if(event.kind==='error'){const banner=document.querySelector('.error-banner');if(banner){banner.hidden=false;banner.textContent=data.message||'Connection lost. Retrying…';}const live=document.querySelector('.top-state');if(live){live.textContent='Offline';live.classList.remove('live');}state.loadingHistory=false;renderTimeline();return;}
    if(event.kind==='item'){if(data.item){state.loadedItems.set(data.item.id,data.item);for(const r of state.items)if(r.item.id===data.item.id)r.item=data.item;}renderTimeline();return;}
    if(event.kind==='snapshot'||event.kind==='history'){const initial=!state.detail;const banner=document.querySelector('.error-banner');banner.hidden=true;const live=document.querySelector('.top-state');live.textContent='Live';live.classList.add('live');if(event.kind==='snapshot'){const signature=JSON.stringify({thread:data.thread,items:data.items,runs:data.runs});if(signature===state.signature)return;state.signature=signature;const min=Math.min(...data.items.map(r=>r.position));state.items=mergeItems(state.items.filter(r=>r.position<min),data.items);const previous=state.detail;state.detail={...data};if(state.historyLoaded&&previous){state.detail.historyCursor=previous.historyCursor;state.detail.hasMoreHistory=previous.hasMoreHistory;}updateChrome(data.thread);}else {state.items=mergeItems(data.items,state.items);state.detail.historyCursor=data.historyCursor;state.detail.hasMoreHistory=data.hasMoreHistory;state.historyLoaded=true;state.loadingHistory=false;}for(const r of state.items){const loaded=state.loadedItems.get(r.item.id);if(loaded&&loaded.updatedAt===r.item.updatedAt&&r.item.outputOmitted)r.item=loaded;}renderTimeline(initial);}
  }
  function selectThread(id){state.selected=id;state.composer=null;state.repository=null;state.repositoryLoading=false;state.repositoryError='';const prPanel=document.querySelector('.pr-panel');if(prPanel)prPanel.hidden=true;document.querySelector('.pr-toggle')?.setAttribute('aria-expanded','false');document.querySelector('.draft-input')?.blur();const draft=document.querySelector('.draft-input');if(draft)draft.value='';state.loadedItems.clear();state.detail=null;state.items=[];state.signature='';state.historyLoaded=false;state.loadingHistory=false;document.querySelector('.timeline')?.replaceChildren(el('div','loading','Loading conversation…'));const banner=document.querySelector('.error-banner');if(banner)banner.hidden=true;const known=[...state.threads,...state.settledThreads].find(t=>t.id===id);if(known)updateChrome(known);updateComposer();renderLists();}
  let compactSidebar=null,compactScroll=0;
  function configure(config){if(state.mode==='list'){compactSidebar=app.querySelector('.sidebar')||compactSidebar;compactScroll=compactSidebar?.querySelector('.sidebar-list')?.scrollTop||0;}state.mode=config.mode||'list';app.replaceChildren();if(state.mode==='list'){state.selected=null;state.detail=null;state.items=[];state.signature='';state.loadedItems.clear();state.loadingHistory=false;state.historyLoaded=false;app.className='list-only';app.append(compactSidebar||makeSidebar());renderLists();app.querySelector('.sidebar-list').scrollTop=compactScroll;return;}app.className='workspace';const header=el('header','topbar');const back=button('','icon-button',()=>request('compact'));back.title='Back to threads';back.setAttribute('aria-label','Back to threads');back.append(icon('back'));const toggle=button('','icon-button',()=>{aside.hidden=!aside.hidden;});toggle.title='Toggle thread sidebar';toggle.setAttribute('aria-label','Toggle thread sidebar');toggle.append(icon('sidebar'));const prToggle=button('PRs','pr-toggle',()=>{prPane.hidden=!prPane.hidden;prToggle.setAttribute('aria-expanded',String(!prPane.hidden));renderPullRequests();});prToggle.setAttribute('aria-label','Show pull requests');prToggle.setAttribute('aria-expanded','false');header.append(back,toggle,el('div','breadcrumb','Loading conversation…'),prToggle,el('span','top-state','Connecting…'));const body=el('div','workspace-body');const aside=makeSidebar();aside.hidden=true;const main=el('main','conversation');const banner=el('div','error-banner');banner.hidden=true;const scroll=el('div','timeline-scroll');scroll.append(el('div','timeline'));const jump=button('Latest ↓','new-messages',()=>{scroll.scrollTop=scroll.scrollHeight;jump.hidden=true;});jump.hidden=true;scroll.onscroll=()=>{if(scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<100)jump.hidden=true;};main.append(banner,scroll,jump,el('footer','footer'));const prPane=el('aside','pr-panel');prPane.setAttribute('aria-label','Pull requests');prPane.hidden=true;body.append(aside,main,prPane);app.append(header,body);if(config.threadId)selectThread(config.threadId);}
  window.QuestView={configure,receive,selectThread,decode(base64){receive(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)))));}};
  window.QuestTest={markdown,identity,mergeItems,state};
  configure({mode:'list'});
})();
