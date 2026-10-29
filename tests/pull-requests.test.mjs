import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePullRequests} from '../bridge/pull-requests.mjs';
const now=Date.parse('2026-10-28T06:00:00Z');
const link={host:'github.com',repository:'example/app',number:42,url:'https://github.com/example/app/pull/42',source:'manual',snapshot:{title:'Build the panel',state:'open',checksState:'passing',reviewDecision:'approved',mergeability:'mergeable',syncedAt:new Date(now).toISOString()}};
const normalize=(overrides={})=>normalizePullRequests({pullRequests:[{...link,snapshot:{...link.snapshot,...overrides}}]},now)[0];
test('PR next steps follow observed state without treating green CI as merge permission',()=>{
  assert.equal(normalize().nextStep,'Review merge requirements on GitHub');
  for(const [patch,label] of [[{checksState:'failing'},'Fix failing checks'],[{checksState:'pending'},'Wait for checks'],[{reviewDecision:'changes-requested'},'Address requested changes'],[{reviewDecision:'review-required'},'Get a review'],[{mergeability:'conflicting'},'Resolve branch conflicts'],[{isDraft:true},'Finish the draft'],[{state:'merged',checksState:'failing'},'Merged'],[{checksState:null},'Check CI and review status']])assert.equal(normalize(patch).nextStep,label);
  const old=normalize({syncedAt:'2026-10-27T00:00:00Z'});assert.ok(old.stale);assert.equal(old.nextStep,'Refresh status on GitHub');
});
test('PR links hide tombstones and reject unsafe or mismatched identities',()=>{
  assert.equal(normalizePullRequests({pullRequests:[link,link,{...link,source:'stack-dismissed'}]},now).length,1);
  for(const url of ['javascript:alert(1)','https://github.com.evil.test/example/app/pull/42','https://user:secret@github.com/example/app/pull/42','https://github.com/example/other/pull/42','https://github.com/example/app/pull/43'])assert.deepEqual(normalizePullRequests({pullRequests:[{...link,url}]},now),[]);
  const legacy=normalizePullRequests({linkedPullRequest:{...link,snapshot:null}},now)[0];assert.equal(legacy.state,'unknown');assert.ok(legacy.stale);
});
