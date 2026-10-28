// Presentation-only view of T3's persisted GitHub PR links. Never executes repository actions.
export function normalizePullRequests(thread, now=Date.now()){
  const links=Array.isArray(thread.pullRequests)?thread.pullRequests:[];
  const sources=links.length?links:[thread.linkedPullRequest,thread.branchPullRequest].filter(Boolean);
  const seen=new Set();
  return sources.flatMap(link=>{
    if(link.source==='stack-dismissed')return [];
    let url;try{url=new URL(link.url);}catch{return [];}
    const match=url.pathname.match(/^\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/([1-9][0-9]*)\/?$/);
    if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||!match)return [];
    const repository=match[1],number=Number(match[2]);
    if(!Number.isSafeInteger(number)||link.number!==number||link.repository!==repository||seen.has(repository+'#'+number))return [];
    seen.add(repository+'#'+number);
    const snapshot=link.snapshot||{};
    const state=['open','closed','merged'].includes(snapshot.state)?snapshot.state:'unknown';
    const checks=['passing','failing','pending'].includes(snapshot.checksState)?snapshot.checksState:'unknown';
    const review=['approved','changes-requested','review-required'].includes(snapshot.reviewDecision)?snapshot.reviewDecision:'unknown';
    const mergeability=['mergeable','conflicting'].includes(snapshot.mergeability)?snapshot.mergeability:'unknown';
    const age=now-Date.parse(snapshot.syncedAt);
    const stale=!Number.isFinite(age)||age>5*60*1000||age< -60000;
    let nextStep='Review merge requirements on GitHub';
    if(state==='merged')nextStep='Merged';
    else if(state==='closed')nextStep='Closed without merge';
    else if(stale||state==='unknown')nextStep='Refresh status on GitHub';
    else if(snapshot.isDraft)nextStep='Finish the draft';
    else if(mergeability==='conflicting')nextStep='Resolve branch conflicts';
    else if(checks==='failing')nextStep='Fix failing checks';
    else if(review==='changes-requested')nextStep='Address requested changes';
    else if(checks==='pending')nextStep='Wait for checks';
    else if(review==='review-required')nextStep='Get a review';
    else if(checks==='unknown'||review==='unknown')nextStep='Check CI and review status';
    return [{host:'github.com',repository,number,url:`https://github.com/${repository}/pull/${number}`,
      title:String(snapshot.title||`Pull request #${number}`).slice(0,500),state,isDraft:snapshot.isDraft===true,
      headBranch:String(snapshot.headBranch||''),baseBranch:String(snapshot.baseBranch||''),checks,review,mergeability,
      syncedAt:snapshot.syncedAt||null,stale,nextStep,
      stack:(link.stack?.layers||[]).slice(0,30).filter(l=>Number.isSafeInteger(l.number)&&l.number>0).map(l=>({number:l.number,headBranch:String(l.headBranch||''),state:['open','closed','merged'].includes(l.state)?l.state:'unknown'})),
    }];
  });
}
