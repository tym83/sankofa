import { serveFixtureRoots } from './support/roots';
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

test('the listening room plays a labelled demo when the cluster is not reachable', async ({ page }) => {
  await page.goto('/#view=listen');
  await expect(page.locator('.listen.open')).toBeVisible();
  await expect(page.locator('.l-badge')).toHaveText(/Recorded demo/, { timeout: 8000 });
  await expect(page.locator('.l-node')).toHaveCount(3);
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect(page.locator('.listen.playing')).toBeVisible();
  await expect(page.locator('.l-call .slot').first()).toBeAttached({ timeout: 8000 });
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.listen.playing')).toHaveCount(0);
});

test('the listening room plays the live cluster from /pulse', async ({ page }) => {
  const voices = { type: 'voices', at: '2026-11-12T10:00:00Z', voices: [{ node: 'cp-1', alive: true, late: 0.1, ready: 2, notReady: 1 }, { node: 'w-1', alive: false, late: 1.3, ready: 0, notReady: 2 }] };
  const lease = { type: 'lease', node: 'cp-1', at: '2026-11-12T10:00:01Z', leaseSeconds: 40 };
  await page.route('**/pulse', (r) => r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, body: `retry: 60000\ndata: ${JSON.stringify(voices)}\n\ndata: ${JSON.stringify(lease)}\n\n` }));
  await page.goto('/#view=listen');
  await expect(page.locator('.l-badge')).toHaveText(/Live/);
  await expect(page.locator('.l-node')).toHaveCount(2);
  await expect(page.locator('.l-node.silent')).toHaveCount(1);
  await expect(page.locator('.l-status')).toContainText('1 of 2 nodes playing');
});

test('a chapter without a photograph opens on its own night map', async ({ page, request }) => {
  const data = await (await request.get('data/chapters.json')).json();
  const ch = data.chapters.find((c: { hero?: { file?: string } }) => !c.hero?.file);
  test.skip(!ch, 'every chapter has a hero image');
  await page.goto('/');
  const hero = page.locator(`#ch-${ch.id} .hero`);
  await hero.scrollIntoViewIfNeeded();
  await expect(hero).toHaveClass(/map-hero/);
  await expect(hero.locator('svg.geo path.land')).toBeAttached();
  await expect(hero.locator('svg.geo g.pt').first()).toBeAttached();
});

test('landing mid-chapter still shows a picture or the map in the sticky panel', async ({ page }) => {
  await page.goto('/');
  for (const id of ['v2', 'v3', 'v5', 'v6']) {
    const step = page.locator(`article.chapter[data-chapter="${id}"] .step:nth-child(3)`);
    if (!(await step.count())) continue;
    await step.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(step).toHaveClass(/on/);
    const graphic = page.locator(`#ch-${id} .graphic`);
    await expect
      .poll(async () =>
        graphic.evaluate((g) => {
          const vh = window.innerHeight;
          const inView = (el: Element | null) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.height > 50 && r.bottom > 0 && r.top < vh;
          };
          return g.classList.contains('show-img') ? inView(g.querySelector('figure.on img')) : inView(g.querySelector('svg.geo')) && !!g.querySelector('svg.geo path.land');
        }),
      )
      .toBe(true);
  }
});

test('the page is never wider than the screen', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);
  const [inner, client] = await page.evaluate(() => [window.innerWidth, document.documentElement.clientWidth]);
  expect(inner).toBe(client);
});

test('the language switch turns the museum Russian and remembers it', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('sankofa.lang', 'en');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('[data-lang-switch]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page).toHaveURL(/lang=ru/);
  await expect(page.locator('.deck:visible')).toContainText('Семь веков');
  await expect(page.locator('.toc-head h2')).toHaveText('Восемь глав');
  expect(await page.evaluate(() => localStorage.getItem('sankofa.lang'))).toBe('ru');
  await page.locator('[data-lang-switch]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).not.toHaveURL(/lang=ru/);
});

test('a deep link with lang=ru opens the atlas and the card in Russian', async ({ page, request }) => {
  const data = await (await request.get('data/cards.json')).json();
  const c = data.cards.find((x: { translations?: { ru?: { title: string } }; edition: string }) => x.translations?.ru?.title && x.edition === 'both');
  test.skip(!c, 'no translated card yet');
  await page.goto(`/#focus=${c.id}&lang=ru&zoom=${c.zoom}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('.atlas.open .atlas-bar h2')).toHaveText('Атлас');
  const card = page.locator(`.drawer.on article.card[data-card-id="${c.id}"]`);
  await expect(card.locator('h2')).toHaveText(c.translations.ru.title);
  await card.getByRole('button', { name: 'Открыть в терминале' }).click();
  await expect(card.locator('.term code')).toContainText('lang=ru');
});

test('the engine room shows cards as Kubernetes objects', async ({ page }) => {
  await page.goto('/#view=engine');
  await expect(page.locator('.engine.open')).toBeVisible();
  await expect(page.locator('.engine .term pre').first()).toContainText('kubectl get cards');
  await expect(page.locator('.e-yaml pre')).toContainText('kind: Card');
  await expect(page.locator('.e-card')).toHaveCount(7);
});

test('#view=atlas opens the atlas on first load, and a card shows its object', async ({ page }) => {
  await page.goto('/#view=atlas');
  await expect(page.locator('.atlas.open')).toBeVisible();
  await page.goto('about:blank');
  await page.goto('/#focus=equiano');
  await expect(page.locator('.drawer.on article.card')).toBeVisible();
  const det = page.locator('.drawer.on details.k8s');
  await det.locator('summary').click();
  await expect(det.locator('pre')).toContainText('sankofa dict equiano');
  await expect(det.locator('pre')).toContainText('apiVersion: sankofa.kuberoot.dev/v1alpha1');
});

test('the demo lets you break a node and hear it fall silent', async ({ page }) => {
  await page.goto('/#view=listen');
  await expect(page.locator('.l-badge')).toHaveText(/Recorded demo/, { timeout: 8000 });
  await page.getByRole('button', { name: 'Break a node' }).click();
  // At once: the node is marked, its heartbeat is late and its pods are silent.
  const broken = page.locator('.l-node.broken');
  await expect(broken).toHaveCount(1);
  await expect(broken.locator('.st')).toContainText(/late|опаздывает/);
  await expect.poll(async () => Number((await broken.locator('.st').textContent())?.match(/(\d+)\s*s late/)?.[1] ?? 0)).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'Mend the node' })).toBeVisible();
});

test('cover opens on a real image with the first surprise, and the end returns to Sankofa', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cover-art img')).toBeVisible();
  await expect(page.locator('.cover-wow:visible')).toContainText(/Mecca|Мекку/);
  await expect(page.locator('.cover .kicker')).toHaveCount(0);
  await expect(page.locator('.coda h2')).toHaveText(/Go\sback\sand\sfetch\sit|Вернись\sи\sзабери/);
});

test('a chapter leads with a few cards and reveals the rest on request', async ({ page }) => {
  await page.goto('/');
  const strip = page.locator('article.chapter').first().locator('.strip');
  const before = await strip.locator('.teaser').count();
  expect(before).toBeLessThanOrEqual(4);
  const more = strip.locator('.more');
  if (await more.count()) {
    await more.scrollIntoViewIfNeeded();
    await more.click();
    expect(await strip.locator('.teaser').count()).toBeGreaterThan(before);
  }
});

test('descent cards hold their text and the level control changes what is shown', async ({ page }) => {
  for (const url of ['/#view=descent&zoom=5', '/#view=descent&zoom=5&lang=ru']) {
    await page.goto('about:blank');
    await page.goto(url);
    await page.waitForLoadState('load');
    await expect(page.locator('.descent.open')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const spill = await page.locator('.descent a.dc').evaluateAll((els) =>
      els.filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1 || [...e.querySelectorAll('.tx')].some((t) => t.scrollWidth > t.clientWidth + 1)).map((e) => e.getAttribute('data-card')),
    );
    expect(spill).toEqual([]);
  }
  const all = await page.locator('.descent a.dc').count();
  await page.locator('.d-levels button').first().click();
  await expect.poll(() => page.locator('.descent a.dc').count()).toBeLessThan(all);
  const one = await page.locator('.descent a.dc').count();
  expect(one).toBeGreaterThan(0);
  expect(page.url()).toContain('zoom=1');
  await page.locator('.d-levels button').nth(3).click();
  await expect.poll(() => page.locator('.descent a.dc').count()).toBeGreaterThan(one);
  await expect(page.locator('.descent .d-chapter')).toHaveCount(0);
  await expect(page.locator('.dm-era .main')).not.toBeEmpty();
});

test('each chapter ends on the cluster, and maps never stack labels', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.ch-cluster').first()).toContainText(/Griot/);
  await expect(page.locator('.toc-head h2')).toHaveText(/Eight chapters|Восемь глав/);
  const step = page.locator('article.chapter').nth(4).locator('.step').nth(1);
  await step.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(2500);
  const overlaps = await page.locator('article.chapter').nth(4).locator('.graphic svg.geo').evaluate((svg) => {
    const boxes = [...svg.querySelectorAll('g.pt text.lbl')]
      .filter((t) => getComputedStyle(t).display !== 'none' && t.textContent)
      .map((t) => t.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2) n++;
      }
    return n;
  });
  expect(overlaps).toBe(0);
});

test('a card panel holds the page still; the counter keeps the card wording', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cover-lang')).toHaveCount(0);
  await page.locator('a.xref').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.locator('a.xref').first().click();
  await expect(page.locator('.drawer.on')).toBeVisible();
  await page.waitForTimeout(800); // let any smooth scroll settle
  const y = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  await page.keyboard.press('Escape');
  const sig = page.locator('.sig-counter');
  if (await sig.count()) await expect(sig.locator('.sig-q')).toHaveText(/nearly|almost|about|почти|около/);
});

test('the listening room moves pods off a node that is declared down', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#view=listen');
  await page.clock.runFor(5000);
  await expect(page.locator('.l-badge')).toHaveText(/Recorded demo/);
  const pods = await page.locator('.l-pod:not(.guest)').count();
  await page.getByRole('button', { name: 'Break a node' }).click();
  await expect(page.locator('.l-pod.off').first()).toBeAttached();
  await page.clock.runFor(17000);
  await expect(page.locator('.l-move')).toBeVisible();
  await expect(page.locator('.l-pod:not(.guest)')).toHaveCount(pods);
  await expect(page.locator('.l-node.broken .st')).toContainText(/moved|переехали/);
});

test('roots: Cyrillic search finds an artist and the chain ends at a museum card', async ({ page, request }) => {
  const data = await (await request.get('data/cards.json')).json();
  const artists = data.roots ?? [];
  test.skip(!artists.length, 'no roots exported');
  const a = [...artists].sort((x: { paths: string[][] }, y: { paths: string[][] }) => Math.max(...y.paths.map((p) => p.length)) - Math.max(...x.paths.map((p) => p.length)))[0];
  const cyr = [a.nameRu, ...(a.aliases ?? [])].find((n: string) => /[А-Яа-яЁё]/.test(n ?? ''));
  await page.goto('/#view=roots');
  await expect(page.locator('.roots.open')).toBeVisible();
  if (cyr) {
    await page.locator('.r-input').fill(cyr.slice(0, 4));
    await expect(page.locator(`.r-hit[data-id="${a.id}"]`)).toBeVisible();
    await page.locator('.r-input').press('Enter');
  } else {
    await page.goto(`/#view=roots&artist=${a.id}`);
  }
  await expect(page.locator(`.r-tree[data-root="${a.id}"]`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`artist=${a.id}`));

  // A deep link renders the chain and it ends at a card.
  await page.goto('about:blank');
  await page.goto(`/#view=roots&artist=${a.id}`);
  const end = page.locator('.r-tree .r-card').last();
  await expect(end).toBeVisible();
  const cardId = await end.getAttribute('data-card');
  expect(a.paths.some((p: string[]) => p[p.length - 1] === `card:${cardId}` || p[p.length - 1].startsWith('card:'))).toBe(true);
  await expect(page.locator('.r-claim').first()).toBeVisible();
  await expect(page.locator('.r-src a')).not.toHaveCount(0);
  await end.click();
  await expect(page.locator('.drawer.on article.card')).toBeVisible();
});

test('the listening room narrates leases, calls and a guest drummer joining and leaving', async ({ page }) => {
  const voices = { type: 'voices', at: '2026-11-12T10:00:00Z', voices: [{ node: 'cp-1', alive: true, late: 0.1, ready: 3, notReady: 0 }, { node: 'w-1', alive: true, late: 0.1, ready: 2, notReady: 0 }] };
  const ev = (o: object) => `data: ${JSON.stringify(o)}\n\n`;
  await page.route('**/pulse', (r) =>
    r.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body:
        'retry: 60000\n' +
        ev(voices) +
        ev({ type: 'lease', node: 'cp-1', at: 'x', leaseSeconds: 40 }) +
        ev({ type: 'pod', phase: 'joined', name: 'guest-drummer', node: 'w-1', at: 'x' }),
    }),
  );
  await page.goto('/#view=listen');
  await expect(page.locator('.l-badge')).toHaveText(/Live/);
  await expect(page.locator('.l-what')).toContainText('What you are hearing');
  await expect(page.locator('.l-subs')).toContainText('Atsimevu checked in: alive');
  await expect(page.locator('.l-subs li').first()).toHaveText('A new voice joins: guest-drummer on Sogo');
  await expect(page.locator('.l-pod.guest')).toHaveCount(1);
  await expect(page.locator('.l-next')).toContainText('guest-drummer');
});

test('in the demo the guest drummer comes and goes, in Russian too', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#view=listen&lang=ru');
  await page.clock.runFor(5000);
  await expect(page.locator('.l-badge')).toHaveText(/демо/);
  await page.clock.runFor(10000);
  await expect(page.locator('.l-subs')).toContainText('Вступает новый голос: guest-drummer');
  await expect(page.locator('.l-pod.guest')).toHaveCount(1);
  await page.clock.runFor(31000);
  await expect(page.locator('.l-subs')).toContainText('guest-drummer уходит');
  await expect(page.locator('.l-pod.guest')).toHaveCount(0);
});


test('roots unwind past the card, name the kind of each link and what was borrowed', async ({ page }) => {
  await serveFixtureRoots(page);
  await page.goto('/#view=roots&artist=the-prodigy');
  await expect(page.locator('.r-tree')).toBeVisible();
  await expect(page.locator('.r-link.k-sample .r-kind')).toContainText('sampled');
  await expect(page.locator('.r-link.k-sample .r-what')).toContainText('handclaps');
  // gospel grows from spirituals: the chain goes on past the first card
  await expect(page.locator('.r-lineage').first()).toBeVisible();
  await expect(page.locator('.r-card.r-deep').first()).toBeVisible();

  await page.goto('about:blank');
  await page.goto('/#view=roots&artist=television&lang=ru');
  await expect(page.locator('.r-story')).toContainText('[заглушка]');
  await expect(page.locator('.r-kind').first()).toContainText('называл влиянием');

  await page.goto('about:blank');
  await page.goto('/#view=roots');
  await expect(page.locator('.r-long').first()).toBeVisible();
});

test('the music map counts its roots, finds an artist and lights its way down', async ({ page }) => {
  await serveFixtureRoots(page);
  await page.goto('/#view=roots-map');
  await expect(page.locator('.rmap.open')).toBeVisible();
  await expect(page.locator('.rm-head h2')).toHaveText(/Of \d+ artists, \d+ lead back to/);
  await expect(page.locator('.rm-node.card').first()).toBeAttached();
  await page.locator('.rm-input').fill('telev');
  await page.locator('.rm-input').press('Enter');
  await expect(page.locator('.rmap.lit')).toBeAttached();
  await expect(page.locator('.rm-info b')).toHaveText('Television');
  await expect(page.locator('.rm-info p')).toContainText('[placeholder]');
  // its way down reaches a museum card
  expect(await page.locator('.rm-node.card.on').count()).toBeGreaterThan(0);

  await page.goto('about:blank');
  await page.goto('/#view=roots-map&lang=ru');
  await expect(page.locator('.rm-head h2')).toHaveText(/^Из \d+ исполнител/);
});

test('breaking a node is told at once and the stopped node never checks in', async ({ page }) => {
  const voices = { type: 'voices', at: 'x', voices: [{ node: 'cp-1', alive: true, late: 0.1, ready: 3, notReady: 0 }, { node: 'w-1', alive: true, late: 0.1, ready: 2, notReady: 0 }] };
  const ev = (o: object) => `data: ${JSON.stringify(o)}\n\n`;
  await page.route('**/pulse', (r) =>
    r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: 'retry: 1500\n' + ev(voices) + ev({ type: 'lease', node: 'w-1', at: 'x', leaseSeconds: 40 }) }),
  );
  await page.goto('/#view=listen');
  await expect(page.locator('.l-badge')).toHaveText('Live: this museum’s own cluster');
  await page.getByRole('button', { name: 'Break a node' }).click();
  await expect(page.locator('.l-subs')).toContainText(/You\s+stopped\s+Sogo\.\s+Its\s+heartbeat\s+is\s+late;\s+the\s+cluster\s+will\s+give\s+up\s+on\s+it\s+in\s+\d+\s+s\./);
  // the stream reconnects and sends Sogo's check-in again: it is not shown
  await page.waitForTimeout(3500);
  await expect(page.locator('.l-subs')).toContainText(/Sogo\s+has\s+been\s+silent\s+for\s+\d+/);
  const lines = await page.locator('.l-subs li').allTextContents();
  const since = lines.findIndex((l) => /You\s+stopped/.test(l));
  expect(lines.slice(0, since).some((l) => /Sogo\s+checked\s+in/.test(l))).toBe(false);
});
