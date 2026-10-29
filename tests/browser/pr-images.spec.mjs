import { test, expect } from '@playwright/test';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100"><rect width="1600" height="1100" fill="#0c0c0c"/><rect width="340" height="1100" fill="#171717"/><text x="40" y="80" fill="#999" font-family="sans-serif" font-size="28">T3 CODE / QUEST</text><text x="40" y="170" fill="#5ee9b5" font-family="sans-serif" font-size="24">example-project</text><text x="40" y="230" fill="#eee" font-family="sans-serif" font-size="24">Improve PR browsing</text><text x="400" y="80" fill="#eee" font-family="sans-serif" font-size="30">Improve PR browsing</text><text x="400" y="200" fill="#aaa" font-family="sans-serif" font-size="26">Worked for 38s</text><text x="400" y="300" fill="#eee" font-family="sans-serif" font-size="34">Ready to review</text><text x="400" y="380" fill="#aaa" font-family="sans-serif" font-size="26">Inspect screenshots without leaving the PR.</text><rect x="400" y="460" width="1100" height="390" rx="14" fill="#171717" stroke="#333"/><text x="440" y="530" fill="#51a2ff" font-family="sans-serif" font-size="26">PR #42 · Review changes</text><text x="440" y="610" fill="#5ee9b5" font-family="sans-serif" font-size="26">Checks passed</text><text x="440" y="710" fill="#aaa" font-family="sans-serif" font-size="24">Synthetic screenshot for browser tests</text></svg>';
test.beforeEach(async ({ page }) => {
  await page.route('https://images.example/**', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }));
  await page.goto('/pr-fixture.html');
});
const source = page => page.locator('.markdown-body img').first();
const dialog = page => page.getByRole('dialog', { name: 'PR image viewer' });
async function openImage(page) {
  await source(page).scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  await source(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByText('Use + to enlarge.', { exact: false })).toBeVisible();
  return before;
}

test('PR images open, zoom, pan, and return to the same scroll position', async ({ page }, info) => {
  const before = await openImage(page);
  await expect(page).toHaveURL(/pr-fixture.html$/);
  expect(await page.evaluate(() => !!window.siteImageHandlerCalled)).toBe(false);
  const image = dialog(page).getByRole('img');
  const fitWidth = await image.evaluate(el => el.clientWidth);
  await dialog(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect(await image.evaluate(el => el.clientWidth)).toBeGreaterThan(fitWidth);
  await dialog(page).getByRole('button', { name: 'Actual image size' }).click();
  expect(await image.evaluate(el => el.clientWidth)).toBe(1600);
  const stage = dialog(page).getByLabel('Pan image');
  const old = await stage.evaluate(el => [el.scrollLeft, el.scrollTop]);
  const box = await stage.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2 - 70, { steps: 6 }); await page.mouse.up();
  const moved = await stage.evaluate(el => [el.scrollLeft, el.scrollTop]); expect(moved[0]).toBeGreaterThan(old[0]); expect(moved[1]).toBeGreaterThan(old[1]);
  await page.screenshot({ path: info.outputPath('pr-image-zoom.png') });
  await dialog(page).getByRole('button', { name: 'Fit image' }).click();
  await page.screenshot({ path: info.outputPath('pr-image-fit.png') });
  await dialog(page).getByRole('button', { name: 'Close image' }).click(); await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
  await page.locator('#bottom').scrollIntoViewIfNeeded(); await expect(page.locator('#bottom')).toBeInViewport();
  await page.locator('#bottom').click();
});

test('Back and Escape dismiss images, repeated injection does not duplicate handlers', async ({ page }) => {
  await page.addScriptTag({ url: '/pr-browser.js' });
  const before = await openImage(page);
  await page.goBack(); await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
  await openImage(page); await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
  const emoji = page.locator('.emoji'); await emoji.click(); await expect(dialog(page)).toHaveCount(0);
});

test('viewer fits a narrow panel and adjusts when the viewport is resized', async ({ page }, info) => {
  await page.setViewportSize({ width: 420, height: 480 }); await openImage(page);
  for (const size of [{ width: 420, height: 480 }, { width: 1000, height: 620 }, { width: 420, height: 350 }]) {
    await page.setViewportSize(size);
    await expect.poll(async () => {
      const stage = await dialog(page).getByLabel('Pan image').boundingBox(); const img = await dialog(page).getByRole('img').boundingBox();
      return stage && img && stage.height > 120 && img.width <= stage.width && img.height <= stage.height;
    }).toBe(true);
    await expect(dialog(page).getByRole('button', { name: 'Close image' })).toBeInViewport();
  }
  await page.screenshot({ path: info.outputPath('pr-image-narrow.png') });
});

