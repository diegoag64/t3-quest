import {test,expect} from '@playwright/test';
const ready=async(page,url='/')=>{await page.goto(url);await page.waitForFunction(()=>window.previewReady);};
const noOverflow=async page=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
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
for(const size of [{width:1000,height:780},{width:420,height:480}]){
  test(`reader ${size.width} keeps history visible and controls inside viewport`,async({page},info)=>{
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
