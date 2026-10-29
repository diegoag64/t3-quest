import {test,expect} from '@playwright/test';
const ready=async(page,url='/')=>{await page.goto(url);await page.waitForFunction(()=>window.previewReady);};
const noOverflow=async page=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
test('subagent cards stay visible as they finish while command logs remain folded',async({page},info)=>{
  await ready(page,'/?mode=reader&scenario=subagents');
  for(const status of ['running','completed','failed']){
    await page.evaluate(status=>{
      const data=structuredClone(QuestTest.state.detail);
      const child=data.items.find(r=>r.id==='child');child.item.status=status;
      Object.assign(data.items.find(r=>r.id==='command').item,{status:'failed',exitCode:1});
      if(!data.items.some(r=>r.id==='child-notice'))data.items.push({id:'child-notice',position:7,item:{id:'child-notice',type:'notification',runId:'run-1',source:{childThreadId:child.item.childThreadId},summary:'Task update'}});
      QuestView.receive({kind:'snapshot',threadId:'reader',payload:data});
    },status);
    const card=page.locator('.timeline>.subagent');
    await expect(card).toHaveCount(1);await expect(card).toBeVisible();
    await expect(card).toContainText(status==='completed'?'Finished':status);
    await expect(page.locator('.work .subagent')).toHaveCount(0);
    await expect(page.locator('.work')).not.toHaveAttribute('open','');
    await expect(page.locator('.tool-label').filter({hasText:'npm test'})).toBeHidden();
  }
  await page.locator('.timeline>.subagent').scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('visible-subagent-cards.png')});
  await page.locator('.timeline>.subagent').click();
  await expect(page.locator('.breadcrumb')).toContainText('Review conversation layout');
  await page.getByRole('button',{name:'Back to parent thread'}).click();
  await expect(page.locator('.timeline>.subagent')).toBeVisible();
  await expect(page.locator('.work')).not.toHaveAttribute('open','');
});
test('subagent threads support nested navigation and restore parent history and drafts',async({page},info)=>{
  await ready(page,'/?mode=reader&scenario=subagents');
  const draft=page.getByRole('textbox',{name:'Message draft'});
  await draft.fill('Parent draft');
  await page.getByRole('button',{name:'Load earlier messages'}).click();
  await page.locator('.work>summary').click();
  await page.locator('[data-child-thread-id="child-review"]').scrollIntoViewIfNeeded();
  const parentScroll=await page.locator('.timeline-scroll').evaluate(n=>n.scrollTop);
  await page.locator('[data-child-thread-id="child-review"]').click();
  await expect(page.locator('.breadcrumb')).toContainText('Review conversation layout');
  await expect(draft).toHaveValue('');await draft.fill('Child draft');
  await page.evaluate(()=>{
    const data=structuredClone(QuestTest.state.detail);data.items[0].item.text='Child progress updated live.';
    QuestView.receive({kind:'snapshot',threadId:'child-review',payload:data});
  });
  await expect(page.getByText('Child progress updated live.')).toBeVisible();
  await page.screenshot({path:info.outputPath('subagent-reader.png')});
  await page.locator('[data-child-thread-id="grandchild-check"]').click();
  await expect(page.locator('.breadcrumb')).toContainText('Check nested history');
  await page.getByRole('button',{name:'Back to parent thread'}).click();
  await expect(page.locator('.breadcrumb')).toContainText('Review conversation layout');
  await expect(draft).toHaveValue('Child draft');
  await page.getByRole('button',{name:'Back to parent thread'}).click();
  await expect(page.locator('.breadcrumb')).toContainText('Polish the Quest thread reader');
  await expect(draft).toHaveValue('Parent draft');
  await expect(page.locator('.work')).toHaveAttribute('open','');
  expect(await page.evaluate(()=>QuestTest.state.items.some(r=>r.id==='older'))).toBe(true);
  expect(await page.locator('.timeline-scroll').evaluate(n=>n.scrollTop)).toBeCloseTo(parentScroll,0);
  await page.getByRole('button',{name:'Back to threads'}).click();
  await expect(page.locator('.list-only')).toBeVisible();
  expect(await page.evaluate(()=>previewActions.some(a=>a.action==='sendMessage'))).toBe(false);
});
test('a missing child can return to its parent and unrelated navigation clears the parent path',async({page})=>{
  await ready(page,'/?mode=reader&scenario=subagents');
  await page.locator('.work>summary').click();await page.locator('[data-child-thread-id="child-review"]').click();
  await page.evaluate(()=>QuestView.receive({kind:'error',threadId:'child-review',payload:{message:'Child unavailable.'}}));
  await expect(page.getByText('Child unavailable.')).toBeVisible();
  await page.evaluate(()=>QuestView.back());
  await expect(page.locator('.breadcrumb')).toContainText('Polish the Quest thread reader');
  await page.locator('[data-child-thread-id="child-review"]').click();
  await page.getByRole('button',{name:'Toggle thread sidebar'}).click();
  await page.locator('[data-thread-id="approval"]').click();
  await expect(page.getByRole('button',{name:'Back to threads'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Back to parent thread'})).toHaveCount(0);
});
test('desktop environments filter threads and keep draft permissions separate',async({page},info)=>{
  await page.setViewportSize({width:420,height:480});await ready(page,'/?scenario=environments');
  const filter=page.getByRole('combobox',{name:'Filter by environment'});
  await expect(page.locator('.thread-row')).toHaveCount(3);
  await expect(page.locator('.thread-row').last()).toContainText('Offline');
  await page.screenshot({path:info.outputPath('environments.png')});await noOverflow(page);
  await filter.selectOption('desktop');await expect(page.locator('.thread-row')).toHaveCount(1);
  await page.locator('.thread-row').click();
  const input=page.getByRole('textbox',{name:'Message draft'});
  await input.fill('Desktop draft');
  await expect(page.getByRole('button',{name:'Send message'})).toBeDisabled();
  await expect(page.locator('.voice-hint')).toContainText('Read-only environment');
  await page.getByRole('button',{name:'Back to threads'}).click();
  await expect(filter).toHaveValue('desktop');
  await filter.selectOption('laptop');await page.locator('.thread-row').click();
  await expect(input).toHaveValue('');await input.fill('Laptop draft');
  await expect(page.getByRole('button',{name:'Send message'})).toBeEnabled();
  await page.evaluate(()=>{
    const threads=structuredClone(QuestTest.state.threads);threads[0].environmentConnected=false;
    QuestView.receive({kind:'list',payload:{threads}});
  });
  await expect(page.getByRole('button',{name:'Send message'})).toBeDisabled();
  await expect(page.locator('.voice-hint')).toContainText('Environment offline');
  expect(await page.evaluate(()=>previewActions.some(a=>a.action==='sendMessage'))).toBe(false);
});
test('switching to an uncached child clears the previous thread context',async({page},info)=>{
  await ready(page,'/?mode=reader');
  await page.getByRole('textbox',{name:'Message draft'}).fill('Draft for the parent');
  await page.evaluate(()=>QuestView.selectThread('uncached-child'));
  await expect(page.locator('.breadcrumb')).toHaveText('Loading conversation…');
  await expect(page.locator('.top-state')).toHaveText('Connecting…');
  await expect(page.locator('.composer-model')).toHaveText('');
  await expect(page.locator('.pr-toggle')).toHaveText('PRs');
  await expect(page.getByRole('textbox',{name:'Message draft'})).toHaveValue('');
  await expect(page.getByRole('button',{name:'Send message'})).toBeDisabled();
  await page.evaluate(()=>QuestView.receive({kind:'error',threadId:'uncached-child',payload:{message:'Laptop disconnected. Retrying…'}}));
  await expect(page.getByText('No messages in this thread yet.')).toHaveCount(0);
  await expect(page.getByText('Beginning of conversation')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('uncached-offline.png')});
});
for(const commandStatus of ['completed','failed'])test(`earlier command failures fold behind the final reply like T3 (${commandStatus})`,async({page},info)=>{
  await ready(page,'/?mode=reader');
  await page.evaluate(status=>{
    const data=structuredClone(QuestTest.state.detail);
    Object.assign(data.items.find(r=>r.id==='command').item,{status,exitCode:1,outputIndicatesFailure:true,output:'One test failed.'});
    QuestView.receive({kind:'snapshot',threadId:'reader',payload:data});
  },commandStatus);
  await expect(page.locator('.timeline>.tool')).toHaveCount(0);
  await expect(page.locator('.tool-label').filter({hasText:'npm test'})).toBeHidden();
  await expect(page.locator('.timeline>.assistant')).toBeVisible();
  await page.locator('.work').scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('folded-command-failure.png')});
  await page.locator('.work>summary').click();
  await page.locator('.work .tool>summary').filter({hasText:'npm test'}).click();
  await expect(page.getByText('One test failed.')).toBeVisible();
});
test('failures after the final reply remain visible',async({page})=>{
  await ready(page,'/?mode=reader');
  await page.evaluate(()=>{
    const data=structuredClone(QuestTest.state.detail);
    const command=structuredClone(data.items.find(r=>r.id==='command'));
    command.id=command.item.id='late-failure';command.position=Math.max(...data.items.map(r=>r.position))+1;
    Object.assign(command.item,{exitCode:1,outputIndicatesFailure:true,output:'A later check failed.'});
    data.items.push(command);
    QuestView.receive({kind:'snapshot',threadId:'reader',payload:data});
  });
  await expect(page.locator('.timeline>.tool>summary')).toHaveText('npm test');
  await page.locator('.timeline>.tool>summary').click();
  await expect(page.getByText('A later check failed.')).toBeVisible();
});
test('stream updates preserve reading position, open work and draft selection',async({page})=>{
  await ready(page,'/?mode=reader&scenario=long');
  const input=page.getByRole('textbox',{name:'Message draft'});
  await input.fill('Keep this draft intact');
  await input.evaluate(n=>n.setSelectionRange(5,9));
  await page.locator('.work>summary').click();
  await input.focus();
  await page.locator('.timeline-scroll').evaluate(n=>n.scrollTop=180);
  const before=await page.locator('.timeline-scroll').evaluate(n=>n.scrollTop);
  await page.evaluate(()=>{
    const data=structuredClone(QuestTest.state.detail);data.items.at(-1).item.text+='\n\nNew progress from the agent.';
    QuestView.receive({kind:'snapshot',threadId:'reader',payload:data});
  });
  expect(await page.locator('.timeline-scroll').evaluate(n=>n.scrollTop)).toBeCloseTo(before,0);
  await expect(page.locator('.work')).toHaveAttribute('open','');
  await expect(input).toBeFocused();await expect(input).toHaveValue('Keep this draft intact');
  expect(await input.evaluate(n=>[n.selectionStart,n.selectionEnd])).toEqual([5,9]);
  await page.getByRole('button',{name:'Latest ↓'}).click();
  expect(await page.locator('.timeline-scroll').evaluate(n=>n.scrollHeight-n.clientHeight-n.scrollTop)).toBeLessThan(2);
});
test('history metadata updates and reconnect recover without a message change',async({page})=>{
  await ready(page,'/?mode=reader');
  await page.evaluate(()=>{
    const data=structuredClone(QuestTest.state.detail);data.hasMoreHistory=false;data.historyCursor=null;
    QuestView.receive({kind:'snapshot',threadId:'reader',payload:data});
  });
  await expect(page.getByRole('button',{name:'Load earlier messages'})).toHaveCount(0);
  await page.evaluate(()=>{
    QuestView.receive({kind:'error',threadId:'reader',payload:{message:'Disconnected'}});
    QuestView.receive({kind:'snapshot',threadId:'reader',payload:structuredClone(QuestTest.state.detail)});
  });
  await expect(page.locator('.top-state')).toHaveText('Live');await expect(page.locator('.error-banner')).toBeHidden();
});
test('cached PR evidence ages without another network response',async({page},info)=>{
  await page.clock.install();await ready(page,'/?mode=reader');
  await page.getByRole('button',{name:'Show pull requests'}).click();
  await expect(page.locator('.pr-panel .pr-next')).toHaveText('Get a review');
  await page.clock.fastForward(6*60*1000);
  await expect(page.locator('.pr-panel .pr-next')).toHaveText('Refresh status on GitHub');
  await expect(page.getByText('Status may be outdated')).toBeVisible();
  await page.screenshot({path:info.outputPath('stale-pr.png')});
});
test('resuming releases canceled history, output and repository requests',async({page})=>{
  await ready(page,'/?mode=reader');
  await page.evaluate(()=>{
    const data=structuredClone(QuestTest.state.detail);
    Object.assign(data.items.find(r=>r.id==='command').item,{output:undefined,outputOmitted:true});
    QuestView.receive({kind:'snapshot',threadId:'reader',payload:data});
  });
  await page.locator('.work>summary').click();await page.locator('.tool>summary').first().click();
  await page.getByRole('button',{name:'Load full output'}).click();
  await expect(page.getByRole('button',{name:'Loading output…'})).toBeDisabled();
  await page.evaluate(()=>{
    QuestTest.state.loadingHistory=true;QuestTest.state.repositoryLoading=true;
    QuestView.receive({kind:'resume',threadId:'reader',payload:{}});
  });
  await expect(page.getByRole('button',{name:'Load earlier messages'})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Load full output'})).toBeEnabled();
  await page.getByRole('button',{name:'Show pull requests'}).click();
  await expect(page.getByRole('button',{name:'Repository activity',exact:true})).toBeEnabled();
});
test('compact sidebar filters, preserves scroll and returns from reader',async({page},info)=>{
  await page.setViewportSize({width:420,height:480});await ready(page);
  await expect(page.getByRole('button',{name:/Polish the Quest/})).toBeVisible();await noOverflow(page);
  await page.screenshot({path:info.outputPath('compact.png')});
  await page.getByRole('searchbox').fill('failing');await expect(page.locator('.thread-row')).toHaveCount(1);
  await page.getByRole('searchbox').fill('');
  await page.locator('.sidebar-list').evaluate(n=>n.scrollTop=140);const scroll=await page.locator('.sidebar-list').evaluate(n=>n.scrollTop);
  await page.locator('.thread-row').nth(3).click();await page.getByRole('button',{name:'Back to threads'}).click();
  expect(await page.locator('.sidebar-list').evaluate(n=>n.scrollTop)).toBe(scroll);
});
for(const size of [{width:1000,height:780},{width:420,height:480},{width:420,height:350}]){
  test(`reader ${size.width}x${size.height} keeps history visible and controls inside viewport`,async({page},info)=>{
    await page.setViewportSize(size);await ready(page,'/?mode=reader');await noOverflow(page);
    const timeline=page.locator('.timeline-scroll');expect((await timeline.boundingBox()).height).toBeGreaterThan(120);
    await expect(page.getByRole('textbox',{name:'Message draft'})).toBeVisible();await expect(page.getByRole('button',{name:'Send message'})).toBeInViewport();
    await page.screenshot({path:info.outputPath('reader.png')});
    await timeline.evaluate(n=>n.scrollTop=0);await page.getByRole('button',{name:'Load earlier messages'}).click();await expect(page.getByText(/Earlier discussion/)).toBeVisible();
    await page.locator('.work>summary').click();await expect(page.locator('.tool').first()).toBeVisible();
  });
}
test('dictation produces a reviewable draft and never sends on stop',async({page})=>{
  await ready(page,'/?mode=reader');await page.getByRole('button',{name:'Record voice draft'}).click();
  await expect(page.getByRole('button',{name:'Send message'})).toBeDisabled();await page.getByRole('button',{name:'Stop & transcribe'}).click();
  await expect(page.getByRole('textbox',{name:'Message draft'})).toHaveValue('Please check the failing tests.');
  expect(await page.evaluate(()=>previewActions.some(a=>a.action==='sendMessage'))).toBe(false);
  await page.getByRole('button',{name:'Back to threads'}).click();await page.locator('[data-thread-id=reader]').click();
  await expect(page.getByRole('textbox',{name:'Message draft'})).toHaveValue('Please check the failing tests.');
  await page.getByRole('button',{name:'Send message'}).click();await expect(page.getByRole('textbox',{name:'Message draft'})).toHaveValue('');
});
test('offline and long messages remain readable',async({page},info)=>{
  await ready(page,'/?mode=reader&scenario=offline');await expect(page.locator('.error-banner')).toBeVisible();await expect(page.locator('.top-state')).toHaveText('Offline');
  await page.screenshot({path:info.outputPath('offline.png')});
  await ready(page,'/?mode=reader&scenario=long');await noOverflow(page);const scroll=page.locator('.timeline-scroll');
  expect(await scroll.evaluate(n=>n.scrollHeight>n.clientHeight)).toBe(true);await expect(page.getByRole('button',{name:'Send message'})).toBeInViewport();
});
test('linked PRs show checks and next steps while preserving the draft',async({page},info)=>{
  await ready(page);await page.getByRole('button',{name:'Pull requests',exact:true}).click();
  await expect(page.locator('.pr-card')).toHaveCount(2);await expect(page.getByText('Fix failing checks')).toBeVisible();
  await page.locator('.pr-title').first().click();
  expect(await page.evaluate(()=>previewActions.at(-1))).toEqual({action:'openPr',payload:{url:'https://github.com/example/t3-quest/pull/42'}});
  await expect(page.getByRole('searchbox')).toBeVisible();
  await page.getByRole('button',{name:'Thread',exact:true}).first().click();await page.getByRole('textbox',{name:'Message draft'}).fill('Check the review feedback.');
  await page.getByRole('button',{name:'Show pull requests'}).click();
  await expect(page.locator('.pr-panel')).toBeVisible();await expect(page.locator('.pr-panel').getByText('Get a review')).toBeVisible();
  await expect(page.locator('.pr-panel').getByText('Checks passed')).toBeVisible();await noOverflow(page);
  expect((await page.locator('.timeline-scroll').boundingBox()).height).toBeGreaterThan(120);
  await page.screenshot({path:info.outputPath('pull-requests.png')});
  await page.getByRole('button',{name:'View PR',exact:true}).click();
  expect(await page.evaluate(()=>previewActions.at(-1))).toEqual({action:'openPr',payload:{url:'https://github.com/example/t3-quest/pull/42'}});
  await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('textbox',{name:'Message draft'})).toHaveValue('Check the review feedback.');
});
test('repository view shows open work and handles failure without replacing the conversation',async({page},info)=>{
  await ready(page,'/?mode=reader');await page.getByRole('button',{name:'Show pull requests'}).click();
  await page.getByRole('button',{name:'Repository activity',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Open issues'})).toBeVisible();
  await expect(page.getByRole('button',{name:'#44 Improve microphone feedback'})).toBeVisible();
  await page.locator('.pr-list').evaluate(n=>n.scrollTop=n.scrollHeight);await page.screenshot({path:info.outputPath('repository.png')});
  await page.evaluate(()=>QuestView.receive({kind:'repositoryError',threadId:'reader',payload:{}}));
  await expect(page.getByText(/Could not refresh repository activity/)).toBeVisible();
  await expect(page.locator('.top-state')).toHaveText('Live');
  await page.evaluate(()=>QuestView.receive({kind:'repository',threadId:'other',payload:{repositories:[]}}));
  await expect(page.getByRole('button',{name:'#44 Improve microphone feedback'})).toBeVisible();
});
test('compact offline and empty states explain the data source',async({page},info)=>{
  await page.setViewportSize({width:420,height:480});await ready(page);
  await page.evaluate(()=>QuestView.receive({kind:'list',payload:{threads:QuestTest.state.threads,connected:false,connectionLabel:'Offline · showing last received threads'}}));
  await expect(page.locator('.sidebar-footer')).toHaveText('Offline · showing last received threads');
  await expect(page.locator('.thread-row').first()).toBeVisible();
  await page.screenshot({path:info.outputPath('offline-list.png')});
  await ready(page,'/?scenario=empty');await expect(page.getByText(/No active threads/)).toBeVisible();
  await page.getByRole('button',{name:'Pull requests',exact:true}).click();await expect(page.getByText(/No linked pull requests/)).toBeVisible();
});
test('narrow PR drawer stays in bounds and restores the reader',async({page},info)=>{
  await page.setViewportSize({width:420,height:480});await ready(page,'/?mode=reader');
  await page.getByRole('button',{name:'Show pull requests'}).click();
  await expect(page.getByRole('button',{name:'Close',exact:true})).toBeInViewport();await noOverflow(page);
  const box=await page.locator('.pr-panel').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(420);
  await page.screenshot({path:info.outputPath('narrow-prs.png')});
  await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('textbox',{name:'Message draft'})).toBeInViewport();
});
