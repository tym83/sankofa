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

test('keyboard: a card link opens with Enter and closes with Escape', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('article.chapter a.xref').first();
  await link.focus();
  await page.keyboard.press('Enter');
  const drawer = page.locator('.drawer.on article.card');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(link).toBeFocused();
});

test('reduced motion still reaches the deep-linked point', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/#t=1900-1935&zoom=3');
  await expect(page.locator('.atlas .levels button[aria-pressed="true"] b')).toHaveText('3');
  await expect(page.locator('.atlas-bar .when')).toContainText('1900–1935');
  await ctx.close();
});

test('the descent opens at a deep-linked year and keeps the year in the link', async ({ page }) => {
  await page.goto('/#t=1803&view=descent');
  await expect(page.locator('.descent.open')).toBeVisible();
  await expect.poll(async () => Number(await page.locator('.dm-year').textContent())).toBeGreaterThan(1795);
  expect(Number(await page.locator('.dm-year').textContent())).toBeLessThan(1811);
  await page.locator('.descent').evaluate((el) => el.scrollBy(0, 3000));
  await expect.poll(() => page.evaluate(() => Number(new URLSearchParams(location.hash.slice(1)).get('t')))).toBeGreaterThan(1810);
  expect(page.url()).toContain('view=descent');
  const card = page.locator('.descent a.dc').first();
  const id = await card.getAttribute('data-card');
  await page.locator('.descent').evaluate((el, id) => el.querySelector(`a.dc[data-card="${id}"]`)!.scrollIntoView({ block: 'center' }), id);
  await card.click();
  await expect(page.locator('.drawer.on article.card')).toBeVisible();
});

test('the cover leads into the descent', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Descend through seven centuries' }).click();
  await expect(page.locator('.descent.open')).toBeVisible();
  await expect(page.locator('.dm-year')).toHaveText(/^13\d\d$/);
});
