import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sankofa.edition', 'm'));
});

test('the story loads and a chapter follows the scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cover-title')).toBeVisible();
  const chapter = page.locator('article.chapter').first();
  await expect(chapter).toBeAttached();
  await chapter.scrollIntoViewIfNeeded();
  const steps = chapter.locator('.step');
  expect(await steps.count()).toBeGreaterThan(1);
  await steps.nth(1).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await expect(chapter.locator('.step.on')).toHaveCount(1);
  await expect(chapter.locator('.graphic svg.geo .land')).toBeAttached();
});

test('a deep link opens the atlas at the point with the focused card', async ({ page, request }) => {
  const data = await (await request.get('data/cards.json')).json();
  const c = data.cards.find((x: { id: string }) => x.id === 'zong') ?? data.cards.find((x: { edition: string }) => x.edition === 'both');
  const slug = c.places[0].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const t = c.years.length > 1 && c.years[1] !== c.years[0] ? `${c.years[0]}-${c.years[1]}` : `${c.years[0]}`;
  const frag = `focus=${c.id}&place=${slug}&t=${t}&zoom=${c.zoom}`;
  await page.goto('/#' + frag);
  await expect(page.locator('.atlas.open')).toBeVisible();
  const card = page.locator(`.drawer.on article.card[data-card-id="${c.id}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('h2')).toHaveText(c.title);
  await expect(page.locator(`.atlas .levels button[aria-pressed="true"] b`)).toHaveText(String(c.zoom));
  await card.getByRole('button', { name: 'Open in terminal' }).click();
  await expect(card.locator('.term code')).toHaveText(`sankofa atlas --at '${frag}'`);
  expect(page.url()).toContain(`focus=${c.id}`);
});

test('a shared path replays and records the visit', async ({ page, request }) => {
  const data = await (await request.get('data/cards.json')).json();
  const ids = data.cards.slice(0, 3).map((c: { id: string }) => c.id);
  await page.goto('/#path=' + ids.join('.'));
  await expect(page.locator('.pathbar.on')).toContainText(`/ ${ids.length}`);
  await page.getByRole('button', { name: 'Next card in the path' }).click();
  await expect(page.locator('.drawer.on article.card')).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem('sankofa.path'));
  expect(stored).toBeTruthy();
});
