import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {checkState,readRepository,createRepositoryReader} from '../bridge/repository.mjs';
import {makeServer} from '../bridge/server.mjs';
const link={repository:'example/app',number:1,url:'https://github.com/example/app/pull/1'};
test('repository checks preserve failures, pending work and unknown evidence',()=>{
  assert.equal(checkState([]),'unknown');
  assert.equal(checkState([{status:'COMPLETED',conclusion:'SUCCESS'},{state:'PENDING'}]),'pending');
  assert.equal(checkState([{status:'IN_PROGRESS'},{conclusion:'FAILURE'}]),'failing');
  assert.equal(checkState([{status:'COMPLETED',conclusion:'CANCELLED'}]),'failing');
  assert.equal(checkState([{status:'COMPLETED',conclusion:'SUCCESS'}]),'passing');
});
test('repository uses fixed read-only commands and canonical links',async()=>{
  const calls=[];
  const data=await readRepository('example/app',async args=>{
    calls.push(args);
    if(args[0]==='pr')return [{number:2,title:'Fix tests',isDraft:false,reviewDecision:'CHANGES_REQUESTED',mergeable:'MERGEABLE',statusCheckRollup:[{state:'SUCCESS'}]}];
    return [{number:3,title:'Next task',url:'javascript:alert(1)',labels:[{name:'bug'}],milestone:{title:'Version 1'}},{number:4,pull_request:{}}];
  });
  assert.equal(data.pullRequests[0].nextStep,'Address requested changes');
  assert.equal(data.issues.length,1);assert.equal(data.issues[0].url,'https://github.com/example/app/issues/3');
  assert.deepEqual(calls[0].slice(0,4),['pr','list','--repo','github.com/example/app']);
  assert.deepEqual(calls[1].slice(0,5),['api','--hostname','github.com','--method','GET']);
  await assert.rejects(readRepository('example/app; touch pwned'),/Invalid/);
});
test('repository cache coalesces requests and returns labeled stale data after failure',async()=>{
  let time=Date.now(),calls=0,fail=false;
  const reader=createRepositoryReader(()=>[{id:'t',pullRequests:[link]}],async()=>{calls++;if(fail)throw Error('sensitive upstream error');return [];},()=>time);
  const [a,b]=await Promise.all([reader('t'),reader('t')]);assert.deepEqual(a,b);assert.equal(calls,2);
  await reader('t');assert.equal(calls,2);
  fail=true;time+=61000;const stale=await reader('t');assert.equal(stale.repositories[0].stale,true);assert.ok(stale.repositories[0].fetchedAt);assert.doesNotMatch(JSON.stringify(stale),/sensitive/);
  await assert.rejects(reader('unknown'),/no longer/);
});
test('repository route requires auth and accepts a thread ID rather than arbitrary repo or URL',async t=>{
  const server=makeServer({token:'test-token',state:()=>({}),repositoryRead:async id=>({repositories:[],id})});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.close();server.closeAllConnections();});
  const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/api/threads/t/repository')).status,401);
  const headers={Authorization:'Bearer test-token'};
  assert.equal((await fetch(base+'/api/threads/t/repository',{headers:{...headers,Origin:'https://evil.test'}})).status,403);
  assert.equal((await fetch(base+'/api/threads/t/repository',{headers})).status,200);
  assert.equal((await fetch(base+'/api/threads/t/repository',{headers,method:'POST'})).status,404);
});
