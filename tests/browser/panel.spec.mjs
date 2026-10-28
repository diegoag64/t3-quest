import {test,expect} from '@playwright/test';
const ready=async(page,url='/')=>{await page.goto(url);await page.waitForFunction(()=>window.previewReady);};
const noOverflow=async page=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
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
test('failed commands remain visible outside folded completed work',async({page},info)=>{
  await ready(page,'/?mode=reader');
  await page.evaluate(()=>{
    const data=structuredClone(QuestTest.state.detail);
    Object.assign(data.items.find(r=>r.id==='command').item,{exitCode:1,outputIndicatesFailure:true,output:'One test failed.'});
    QuestView.receive({kind:'snapshot',threadId:'reader',payload:data});
  });
  await expect(page.locator('.timeline>.tool>summary')).toHaveText('npm test');
  await page.locator('.timeline>.tool>summary').click();
  await expect(page.getByText('One test failed.')).toBeVisible();
  await page.screenshot({path:info.outputPath('failed-command.png')});
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
  await page.locator('.pr-title').first().click();await page.getByRole('textbox',{name:'Message draft'}).fill('Check the review feedback.');
  await page.getByRole('button',{name:'Show pull requests'}).click();
  await expect(page.locator('.pr-panel')).toBeVisible();await expect(page.locator('.pr-panel').getByText('Get a review')).toBeVisible();
  await expect(page.locator('.pr-panel').getByText('Checks passed')).toBeVisible();await noOverflow(page);
  expect((await page.locator('.timeline-scroll').boundingBox()).height).toBeGreaterThan(120);
  await page.screenshot({path:info.outputPath('pull-requests.png')});
  await page.getByRole('button',{name:'Open on GitHub'}).click();
  expect(await page.evaluate(()=>previewActions.at(-1))).toEqual({action:'openLink',payload:{url:'https://github.com/example/t3-quest/pull/42'}});
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
