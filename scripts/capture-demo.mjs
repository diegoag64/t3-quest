import {mkdir} from 'node:fs/promises';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {previewServer} from './preview.mjs';

// Capture only the isolated synthetic preview, never the bridge or a live thread.
const output=fileURLToPath(new URL('../docs/screenshots/',import.meta.url));
await mkdir(output,{recursive:true});
const server=previewServer();
server.listen(0,'127.0.0.1');
await once(server,'listening');
let browser;
try{
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:420,height:480},deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>window.previewReady);
  const capture=name=>page.screenshot({path:output+name+'.png',animations:'disabled'});
  await capture('compact-threads');

  await page.setViewportSize({width:1000,height:780});
  await page.locator('[data-thread-id=reader]').click();
  await page.locator('.timeline-scroll').evaluate(n=>n.scrollTop=0);
  await capture('thread-reader');

  await page.getByRole('button',{name:'Record voice draft'}).click();
  await page.getByRole('button',{name:'Stop & transcribe'}).click();
  await expect(page.getByRole('textbox',{name:'Message draft'})).toHaveValue('Please check the failing tests.');
  await page.locator('.timeline-scroll').evaluate(n=>n.scrollTop=n.scrollHeight);
  await capture('voice-draft');
  expect(await page.evaluate(()=>previewActions.some(a=>a.action==='sendMessage'))).toBe(false);

  await page.getByRole('button',{name:'Discard',exact:true}).click();
  await page.getByRole('button',{name:'Show pull requests'}).click();
  await capture('pull-requests');
  await page.getByRole('button',{name:'Repository activity',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Open issues'})).toBeVisible();
  await page.locator('.pr-list').evaluate(n=>n.scrollTop=n.scrollHeight);
  await capture('repository-activity');
  await page.setViewportSize({width:420,height:480});
  await page.goto(`http://127.0.0.1:${server.address().port}/?scenario=environments`);
  await page.waitForFunction(()=>window.previewReady);
  await capture('desktop-environments');
  console.log('Saved six synthetic demo screenshots to docs/screenshots. No audio or messages were sent.');
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
