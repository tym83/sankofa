// Visual review: npm run screenshots writes web/screenshots/*.png.
import { test, type Page } from '@playwright/test';

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1');
test.describe.configure({ mode: 'serial' });

const dir = 'screenshots';
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `${dir}/${project}-${name}.png` });
const settle = (page: Page, ms = 2600) => page.waitForTimeout(ms);

test('key views', async ({ page }, info) => {
  const p = info.project.name;
  await page.addInitScript(() => localStorage.setItem('sankofa.edition', 'f'));
  await page.goto('/');
  await settle(page, 5500);
  await shot(page, '01-cover', p);

  await page.locator('#opener').scrollIntoViewIfNeeded();
  await settle(page, 800);
  await shot(page, '02-opener', p);

  await page.locator('#contents').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 60));
  await settle(page, 1600);
  await shot(page, '03-contents', p);

  const chapters = page.locator('article.chapter');
  const n = await chapters.count();
  for (const i of [0, 1, Math.min(4, n - 1)]) {
    const ch = chapters.nth(i);
    const id = await ch.getAttribute('data-chapter');
    await ch.locator('.hero').scrollIntoViewIfNeeded();
    await settle(page, 1600);
    await shot(page, `10-${id}-hero`, p);
    const steps = ch.locator('.step');
    const count = await steps.count();
    for (const s of [0, 1, 2]) {
      if (s >= count) break;
      await steps.nth(s).evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await settle(page, 2400);
      await shot(page, `11-${id}-step${s}`, p);
    }
    if (i === 0) {
      await ch.locator('.interlude').scrollIntoViewIfNeeded();
      await settle(page, 1400);
      await shot(page, `12-${id}-interlude`, p);
      await ch.locator('.strip').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await settle(page, 1400);
      await shot(page, `13-${id}-strip`, p);
    }
  }

  await page.locator('.finale').scrollIntoViewIfNeeded();
  await settle(page, 1500);
  await shot(page, '20-finale-timeline', p);

  await page.goto('/#zoom=1');
  await settle(page, 3500);
  await shot(page, '30-atlas-z1', p);
  await page.goto('/#zoom=2');
  await page.reload();
  await settle(page, 3000);
  await shot(page, '31-atlas-z2', p);
  await page.goto('/#t=1900-1935&zoom=3&place=chicago');
  await page.reload();
  await settle(page, 3500);
  await shot(page, '32-atlas-z3-1900-1935', p);

  const data = await page.evaluate(() => fetch('data/cards.json').then((r) => r.json()));
  const withImg = data.cards.find((c: { media?: unknown[]; zoom: number }) => c.media?.length && c.zoom === 4) ?? data.cards[0];
  await page.goto(`/#focus=${withImg.id}&zoom=4`);
  await page.reload();
  await settle(page, 3200);
  await shot(page, '33-atlas-card', p);

  await page.goto('/#path=' + data.cards.slice(0, 5).map((c: { id: string }) => c.id).join('.'));
  await page.reload();
  await settle(page, 3200);
  await shot(page, '34-atlas-path', p);

  await page.goto(`/#focus=${withImg.id}`);
  await page.reload();
  await settle(page, 2000);
  await shot(page, '40-card-over-story', p);

  await page.evaluate(() => {
    localStorage.setItem('sankofa.theme', 'light');
  });
  await page.goto('/#ch=v1');
  await page.reload();
  await settle(page, 2500);
  await shot(page, '50-light-chapter', p);
  await page.goto('/#zoom=1');
  await page.reload();
  await settle(page, 3200);
  await shot(page, '51-light-atlas', p);
});
