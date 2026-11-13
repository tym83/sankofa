// Visual review: npm run screenshots writes web/screenshots/*.png.
import { test, type Page } from '@playwright/test';

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1');
test.describe.configure({ mode: 'serial' });
test.setTimeout(480_000);

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
  for (let i = 0; i < n; i++) {
    const ch = chapters.nth(i);
    const id = await ch.getAttribute('data-chapter');
    await ch.locator('.hero').scrollIntoViewIfNeeded();
    await settle(page, 1600);
    await shot(page, `10-${id}-hero`, p);
    const steps = ch.locator('.step');
    const count = await steps.count();
    for (const s of i % 2 ? [0, 2] : [0, 1, 2]) {
      if (s >= count) break;
      await steps.nth(s).evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await settle(page, 2400);
      await shot(page, `11-${id}-step${s}`, p);
    }
    if (i === 0) {
      await ch.locator('.sig').evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top + Math.max(0, el.getBoundingClientRect().height - innerHeight) * 0.7));
      await settle(page, 1800);
      await shot(page, `12-${id}-signature`, p);
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

  for (const y of [1300, 1500, 1781, 1880, 1925, 1965, 2010]) {
    await page.goto(`/#t=${y}&view=descent`);
    await page.reload();
    await settle(page, 2600);
    await shot(page, `60-descent-${y}`, p);
  }

  await page.goto('/#view=listen');
  await page.reload();
  await settle(page, 4500);
  await page.getByRole('button', { name: 'Start listening' }).click();
  await settle(page, 6000);
  await shot(page, '70-listening-room', p);

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

test('key views in Russian', async ({ page }, info) => {
  const p = info.project.name;
  await page.addInitScript(() => {
    localStorage.setItem('sankofa.edition', 'f');
    localStorage.setItem('sankofa.lang', 'ru');
  });
  const views: [string, string, string?][] = [
    ['/#lang=ru', '80-ru-cover'],
    ['/#ch=v1&lang=ru', '81-ru-chapter-hero'],
    ['/#lang=ru', '82-ru-chapter-step', '#ch-v1 .step:nth-child(3)'],
    ['/#lang=ru&zoom=1', '83-ru-atlas'],
    ['/#lang=ru&t=1781&view=descent', '84-ru-descent'],
    ['/#lang=ru&view=listen', '85-ru-listen'],
    ['/#focus=equiano&lang=ru', '86-ru-card'],
    ['/#lang=ru&view=engine', '87-ru-engine'],
  ];
  for (const [url, name, sel] of views) {
    await page.goto(url);
    await page.reload();
    await settle(page, 2800);
    if (sel) {
      await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await settle(page, 2400);
    }
    await shot(page, name, p);
  }
});

test('the engine room and the coda', async ({ page }, info) => {
  const p = info.project.name;
  await page.goto('/#view=engine');
  await settle(page, 1500);
  await shot(page, '90-engine', p);
  await page.locator('.e-mech').scrollIntoViewIfNeeded();
  await settle(page, 800);
  await shot(page, '91-engine-mechanisms', p);
  await page.goto('/');
  await page.reload();
  await page.locator('.coda').scrollIntoViewIfNeeded();
  await settle(page, 1500);
  await shot(page, '92-coda', p);
});

test('descent levels', async ({ page }, info) => {
  const p = info.project.name;
  for (const [url, name] of [
    ['/#t=1781&view=descent&zoom=1', '61-descent-level1'],
    ['/#t=1781&view=descent&zoom=3', '62-descent-level3'],
    ['/#t=1925&view=descent&zoom=5', '63-descent-level5'],
    ['/#t=1925&view=descent&zoom=4&lang=ru', '64-ru-descent-level4'],
  ]) {
    await page.goto(url);
    await page.reload();
    await settle(page, 2800);
    await shot(page, name, p);
  }
});

test('signatures and the broken node', async ({ page }, info) => {
  const p = info.project.name;
  await page.goto('/');
  for (const [sel, name, frac] of [
    ['#ch-v1 .sig-counter', '93-sig-counter', -1],
    ['#ch-v5 .sig-plate', '94-sig-plate', 0.6],
    ['#ch-v7 .sig-insert', '95-sig-insert', 1],
  ] as [string, string, number][]) {
    await page.locator(sel).evaluate((el, f) => {
      const r = el.getBoundingClientRect();
      window.scrollBy(0, f < 0 ? r.top - 60 : r.top + f * Math.max(0, r.height - innerHeight));
    }, frac);
    await settle(page, 4500);
    await shot(page, name, p);
  }
  await page.goto('/#view=listen');
  await page.reload();
  await settle(page, 4500);
  await page.getByRole('button', { name: 'Break a node' }).click();
  await settle(page, 5000);
  await shot(page, '96-listen-broken', p);
});
