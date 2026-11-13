// The long read: cover, opener, contents, eight chapters told in scroll steps
// over a sticky map or photograph, and the timeline at the end.
import type { App } from '../app';
import { richText } from '../app';
import type { Card, Chapter } from '../lib/types';
import { ERAS } from '../lib/types';
import { formatYears, KIND_LABEL, links } from '../lib/cards';
import { bookMarks, h, reducedMotion, revealOnScroll } from '../lib/dom';
import { lang, pick, t } from '../lib/i18n';
import { chapterCopy, eraColor, isNonPlace, readerCards } from '../lib/atlasModel';
import { MOVEMENTS, movementText } from '../lib/movements';
import { mediaSrc, progressive } from '../lib/media';
import { signature, SIGNATURE_CARD } from './signature';
import { GeoMap, LEVEL_K, type MapRoute } from './map';
import { Timeline } from './timeline';
import { editionNote } from './editionNote';
import { hideTip, showTip } from './tip';

/** The cover's own picture; a chapter that would repeat it opens on its map. */
const COVER_IMAGE = 'hero-v0.jpg';
const LEAD_CARDS = 4;

export function buildStory(app: App, main: HTMLElement): void {
  coverMap(main.querySelector<HTMLElement>('.cover-map'));
  // The opener names the chapters by their own titles.
  main.querySelectorAll<HTMLElement>('[data-chapter-list]').forEach((el) => {
    const ru = (el.closest<HTMLElement>('[data-l]')?.dataset.l ?? lang()) === 'ru';
    const names = app.chapters.map((c) => (ru ? `«${c.title}»` : c.title.replace(/^The /, 'the ')));
    el.textContent = names.length > 1 ? `${names.slice(0, -1).join(', ')} ${ru ? 'и' : 'and'} ${names[names.length - 1]}` : names.join('');
  });
  main.querySelectorAll<HTMLElement>('[data-edition-note]').forEach((el) => el.replaceWith(editionNote(app)));
  main.querySelectorAll<HTMLElement>('[data-book]').forEach((b) => b.replaceWith(bookMarks([b.dataset.book!])));

  main.append(toc(app));
  for (const ch of app.chapters) main.append(chapter(app, ch));
  main.append(finale(app), coda(app));
  revealOnScroll(main);
  heroParallax();
}

function coverMap(host: HTMLElement | null): void {
  if (!host) return;
  const map = new GeoMap(host, { frame: [[-100, -30], [45, 58]] });
  map.ready.then(() => {
    const routes: MapRoute[] = MOVEMENTS.map((m) => ({ id: m.id, legs: m.legs, color: eraColor(m.era), flow: true }));
    // Draw the movements one after another, like a slow inhale.
    routes.forEach((_, i) => setTimeout(() => map.setRoutes(routes.slice(0, i + 1)), reducedMotion() ? 0 : 400 + i * 900));
  });
}

function heroImg(app: App, ch: Chapter, eager: boolean, pos?: string, sizes = '100vw'): HTMLElement | null {
  if (!ch.hero?.file) return null;
  const src = mediaSrc(app, ch.hero.file, [sizes === '100vw' ? 1600 : 480]);
  const img = h('img', {
    style: pos ? `object-position:${pos}` : undefined,
    sizes,
    alt: ch.hero.caption ?? '',
    decoding: 'async',
    fetchpriority: eager ? 'high' : undefined,
  }) as HTMLImageElement;
  const load = () => {
    if (src.srcset) img.srcset = src.srcset;
    img.src = src.src;
  };
  if (eager) load();
  else {
    // Only the cover frame loads up front; the others when they come within a screen.
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        load();
      },
      { rootMargin: '100% 0px' },
    );
    io.observe(img);
  }
  return img;
}

/**
 * A chapter without a photograph opens on its own night map: every place in
 * the chapter lit, its movements and routes drawing themselves.
 */
function heroMap(app: App, ch: Chapter): HTMLElement {
  const host = h('div.hero-map', { 'aria-hidden': 'true' });
  const cards = [...new Set(ch.cards.map((id) => app.set.get(id)).filter(Boolean) as Card[])];
  const coords: [number, number][] = [...ch.places, ...cards.flatMap((c) => c.places)].map((p) => [p.lon, p.lat]);
  const moves = MOVEMENTS.filter((m) => m.era === ch.id);
  moves.forEach((m) => m.legs.forEach((l) => coords.push(l.from, l.to)));
  const frame = heroFrame(coords, window.innerWidth < 760);
  let started = false;
  const io = new IntersectionObserver(
    (entries) => {
      if (started || !entries.some((e) => e.isIntersecting)) return;
      started = true;
      io.disconnect();
      const map = new GeoMap(host, { frame, maxLabels: () => (window.innerWidth < 720 ? 2 : Infinity) });
      map.ready.then(() => {
        map.setPoints(
          cards.map((c) => ({
            id: c.id,
            lon: c.places[0].lon,
            lat: c.places[0].lat,
            label: c.places[0].name.split(/[,(]/)[0].trim(),
            color: eraColor(c.era),
            priority: 6 - c.zoom,
          })),
        );
        const routes: MapRoute[] = [
          ...moves.map((m) => ({ id: m.id, legs: m.legs, color: eraColor(m.era), flow: true })),
          ...cards
            .filter((c) => c.places.length > 1)
            .map((c) => ({
              id: c.id,
              legs: c.places.slice(1).map((p) => ({ from: [c.places[0].lon, c.places[0].lat] as [number, number], to: [p.lon, p.lat] as [number, number] })),
              color: eraColor(c.era),
              flow: true,
            })),
        ];
        // The routes draw one after another, like the cover.
        routes.forEach((_, i) => setTimeout(() => map.setRoutes(routes.slice(0, i + 1)), reducedMotion() ? 0 : 300 + i * 450));
      });
    },
    { rootMargin: '60% 0px' },
  );
  io.observe(host);
  return host;
}

/** A generous frame around the chapter's places, never narrower than an ocean. */
export function heroFrame(coords: [number, number][], narrow = false): [[number, number], [number, number]] {
  if (!coords.length) return [[-100, -30], [45, 58]];
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [lon, lat] of coords) {
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  const padX = narrow ? 4 : Math.max(12, (e - w) * 0.25);
  const padY = Math.max(10, (n - s) * 0.3);
  [w, e, s, n] = [w - padX, e + padX, s - padY, n + padY];
  const minW = narrow ? 34 : 70;
  if (e - w < minW) {
    const c = (w + e) / 2;
    [w, e] = [c - minW / 2, c + minW / 2];
  }
  return [
    [Math.max(-180, w), Math.max(-75, s)],
    [Math.min(180, e), Math.min(80, n)],
  ];
}

function toc(app: App): HTMLElement {
  return h(
    'section.toc',
    { id: 'contents', 'aria-label': t('Contents') },
    h('div.toc-head', {}, h('h2', {}, t('Eight chapters')), h('p', {}, t('Each era ships as a release of the distribution, from v0 to v7. Begin anywhere; every card leads somewhere else.'))),
    h(
      'div.toc-grid',
      {},
      app.chapters.map((ch) =>
        h(
          'a.toc-item.reveal',
          { href: `#ch=${ch.id}`, 'data-chapter': ch.id, style: `--era:${eraColor(ch.id)}` },
          heroImg(app, withHero(app, ch).ch, false, withHero(app, ch).pos, '(max-width: 720px) 46vw, 300px') ?? h('span.toc-glyph', { 'aria-hidden': 'true' }, ch.id),
          h('span.num', {}, pick({ en: `Chapter ${app.chapters.indexOf(ch) + 1}`, ru: `Глава ${app.chapters.indexOf(ch) + 1}` })),
          h('span.t', {}, h('b', {}, ch.title), h('span', {}, ch.kicker)),
        ),
      ),
    ),
  );
}

function stepCards(app: App, text: string): Card[] {
  const out: Card[] = [];
  for (const id of links(text)) {
    // The chapter's own card: the words of the step name it, whichever copy is held.
    const c = app.set.get(id);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * Chapters whose hero is a chart or a document open instead on a photograph
 * from their own cards; the chart keeps its place as the chapter's plate.
 */
const HERO_FROM_CARD: Record<string, { card: string; pos: string }> = {
  v5: { card: 'hurston', pos: '50% 22%' },
};

/** Chapter heroes that portray the subject of a paired card. */
const HERO_SUBJECT: Record<string, string> = { v3: 'douglass-covey' };

/**
 * Pictures follow the copy the reader holds: a paired card of the other copy
 * gives way to its counterpart in this one. Only pictures do; prose stays.
 */
function inCopy(app: App, c: Card): Card {
  if (c.edition === 'both' || c.edition === app.edition) return c;
  const p = app.set.partner(c.id);
  return p && p.media?.some((m) => m.type === 'image') ? p : c;
}

function withHero(app: App, ch: Chapter): { ch: Chapter; pos?: string; swapped: boolean } {
  const swap = HERO_FROM_CARD[ch.id];
  const m = swap ? app.set.get(swap.card)?.media?.find((x) => x.type === 'image') : undefined;
  if (m) return { ch: { ...ch, hero: { ...m, type: 'image' } }, pos: swap!.pos, swapped: true };
  // A hero that portrays a paired card's subject follows the copy too.
  const owner = HERO_SUBJECT[ch.id] ? app.set.get(HERO_SUBJECT[ch.id]) : ch.hero?.file ? app.set.all().find((c) => c.pair && c.media?.some((x) => x.file === ch.hero!.file)) : undefined;
  const mine = owner ? inCopy(app, owner) : undefined;
  const mm = mine && mine !== owner ? mine.media?.find((x) => x.type === 'image') : undefined;
  return mm ? { ch: { ...ch, hero: { ...mm, type: 'image' } }, pos: '50% 25%', swapped: true } : { ch, swapped: false };
}

function chapter(app: App, ch0: Chapter): HTMLElement {
  const { ch, pos: swapPos, swapped: swapMedia } = withHero(app, ch0);
  const swap = swapMedia ? { pos: swapPos } : undefined;
  const color = eraColor(ch.id);
  const cards = chapterCopy(app.set, app.edition, ch);

  const mapHero = !ch.hero?.file || ch.hero.file === COVER_IMAGE;
  const hero = h(
    `header.hero${mapHero ? '.map-hero' : ''}${swapMedia ? '.portrait' : ''}`,
    { style: `--era:${color}` },
    mapHero ? heroMap(app, ch) : heroImg(app, ch, false, swap?.pos),
    h(
      'div.hero-text',
      {},
      h('div.release', {}, h('span.v', {}, ch.id), h('span.kicker', {}, ch.kicker)),
      h('h2', { id: `title-${ch.id}` }, ch.title),
    ),
    mapHero ? h('p.credit', {}, t('The places of this chapter · map data: Natural Earth, public domain')) : null,
    ch.hero && !mapHero ? h('p.credit', {}, ch.hero.caption ? ch.hero.caption + ' · ' : '', ch.hero.credit, ' · ', ch.hero.url ? h('a', { href: ch.hero.url, rel: 'noopener', target: '_blank' }, ch.hero.license) : ch.hero.license) : null,
  );

  const mapHost = h('div.map', { 'aria-hidden': 'true' });
  const imgHost = h('div.img', { 'aria-hidden': 'true' });
  const graphic = h('div.graphic', {}, mapHost, imgHost);
  // Which picture each step shows: the first linked card with an image that
  // an earlier step has not shown. Step 0 always orients on the map.
  const used = new Set<string>();
  const stepImage: (Card | undefined)[] = ch.steps.map((s, i) => {
    // At most three pictures per chapter, so the map and the words breathe.
    if (i === 0 || used.size >= 3) return undefined;
    const c = stepCards(app, s)
      .map((x) => inCopy(app, x))
      .find((x) => x.media?.some((m) => m.type === 'image') && !used.has(x.id) && x.id !== SIGNATURE_CARD[ch.id] && x.media?.find((m) => m.type === 'image')?.file !== ch.hero?.file);
    if (c) used.add(c.id);
    return c;
  });
  const steps = ch.steps.map((s, i) => {
    const sc = stepCards(app, s);
    const anchor = sc.find((c) => !isNonPlace(c)) ?? sc[0];
    const where = anchor ? (isNonPlace(anchor) ? formatYears(anchor.years) : `${anchor.places[0].name} · ${formatYears(anchor.years)}`) : ch.kicker;
    const img = stepImage[i]?.media?.find((m) => m.type === 'image');
    return h(
      `div.step${i === 0 ? '.first' : ''}`,
      { 'data-step': String(i), lang: ch.textLang && ch.textLang !== lang() ? ch.textLang : undefined },
      // On phones the picture sits above the text instead of under it.
      img ? h('figure.step-fig', {}, progressive(app, img.file, { want: 960, sizes: '92vw', alt: img.caption ?? stepImage[i]!.title, near: true }).img, h('figcaption.credit', {}, img.caption ? img.caption + ' · ' : '', img.credit, ' · ', img.license)) : null,
      h('div.where', {}, where),
      h('p', {}, richText(app, s)),
    );
  });
  const scrolly = h('div.scrolly', {}, graphic, h('div.steps', {}, steps));

  // The interlude never repeats a hook the strip right below will show again.
  const fallback = cards.slice(LEAD_CARDS).find((c) => c.wow.length < 140) ?? cards.find((c, i) => i > 0 && c.wow.length < 140) ?? cards[0];
  const interlude = signature(app, ch.id, cards, fallback);

  const LEAD = LEAD_CARDS;
  // The card the signature already set large goes to the end of the strip.
  const sigId = SIGNATURE_CARD[ch.id];
  const stripCards = [...cards.filter((c) => c.id !== sigId), ...cards.filter((c) => c.id === sigId)];
  const rest = stripCards.slice(LEAD);
  const more = rest.length
    ? h(
        'button.btn.more',
        {
          'aria-expanded': 'false',
          onclick: (e: Event) => {
            const b = e.currentTarget as HTMLButtonElement;
            const row = b.previousElementSibling as HTMLElement;
            rest.forEach((c) => row.append(teaser(app, c, true)));
            b.remove();
          },
        },
        pick({ en: 'Show the others', ru: 'Показать остальные' }),
      )
    : null;
  // A quiet editorial beat, not a catalogue: a few more pages from the chapter.
  const strip = cards.length
    ? h(
        'section.strip',
        {},
        h('h3', {}, pick({ en: 'More from this chapter', ru: 'Ещё из этой главы' })),
        h('div.strip-row', {}, stripCards.slice(0, LEAD).map((c) => teaser(app, c))),
        more,
      )
    : null;

  const el = h(
    'article.chapter',
    { id: `ch-${ch.id}`, 'data-chapter': ch.id, 'aria-labelledby': `title-${ch.id}`, style: `--era:${color}`, class: `rhythm-${app.chapters.indexOf(ch) % 3}` },
    hero,
    scrolly,
    interlude,
    strip,
    h('div.kente', { 'aria-hidden': 'true' }),
  );
  runScrolly(app, ch, el, graphic, mapHost, imgHost, steps, stepImage);
  return el;
}

export function teaser(app: App, c: Card, seen = false): HTMLElement {
  const img = c.media?.find((m) => m.type === 'image');
  return h(
    `a.teaser${seen ? '.seen' : ''}.reveal${img ? '' : '.textonly'}`,
    { href: `#focus=${c.id}`, 'data-card': c.id, style: `--era:${eraColor(c.era)}` },
    img ? h('div.ph', {}, h('img', { ...mediaSrc(app, img.file, [480]), sizes: '(max-width: 720px) 92vw, 300px', alt: '', loading: 'lazy', decoding: 'async' })) : null,
    h(
      'div.tx',
      {},
      h('div.k', {}, h('span', {}, KIND_LABEL[c.kind] ?? c.kind), h('span', {}, formatYears(c.years)), h('span.bk', {}, bookMarks(c.books))),
      h('b', {}, c.title),
      h('span.w', {}, c.wow),
      img ? null : h('span.pl', {}, c.places[0].name),
    ),
  );
}

function runScrolly(app: App, ch: Chapter, el: HTMLElement, graphic: HTMLElement, mapHost: HTMLElement, imgHost: HTMLElement, steps: HTMLElement[], stepImage: (Card | undefined)[]): void {
  let map: GeoMap | null = null;
  let current = -1;
  const figures = new Map<string, HTMLElement>();
  // The map names the chapter's own places, so the copy held never moves a label.
  const chapterCards = [...new Set(ch.cards.map((id) => app.set.get(id)).filter(Boolean) as Card[])];
  const phone = () => window.innerWidth < 720;

  const ready = new Map<string, Promise<void>>();
  const figure = (c: Card): HTMLElement | null => {
    const m = c.media?.find((x) => x.type === 'image');
    if (!m) return null;
    if (!figures.has(c.id)) {
      const p = progressive(app, m.file, { want: 960, sizes: '58vw', alt: m.caption ?? c.title });
      const f = h('figure', {}, p.img, h('figcaption.credit', {}, h('b', {}, m.caption ?? c.title), m.credit, ' · ', m.license));
      ready.set(c.id, p.ready);
      figures.set(c.id, f);
      imgHost.append(f);
    }
    return figures.get(c.id)!;
  };
  // Pictures of this chapter start loading two screens ahead.
  new IntersectionObserver(
    (es, io) => {
      if (!es.some((e) => e.isIntersecting) || phone()) return;
      io.disconnect();
      stepImage.forEach((c) => c && figure(c));
    },
    { rootMargin: '200% 0px' },
  ).observe(el);

  const ensureMap = () => {
    if (map) return map;
    map = new GeoMap(mapHost, {
      // Never under the text column; on phones at most three names.
      // On phones the step box covers the lower part of the map.
      avoid: () => (phone() ? [[0, mapHost.clientHeight * 0.52, mapHost.clientWidth, mapHost.clientHeight]] : [[0, 0, Math.min(mapHost.clientWidth * 0.42, 620), mapHost.clientHeight]]),
      maxLabels: () => (phone() ? 2 : 5),
    });
    return map;
  };

  const activate = (i: number) => {
    if (i === current) return;
    current = i;
    steps.forEach((s, j) => s.classList.toggle('on', j === i));
    const sc = stepCards(app, ch.steps[i] ?? '');
    const withImage = stepImage[i];
    if (withImage && !phone()) {
      // Cross-fade only once the picture is decoded: never a black void.
      const f = figure(withImage)!;
      const show = () => {
        if (current !== i) return;
        figures.forEach((x) => x.classList.toggle('on', x === f));
        graphic.classList.add('show-img');
      };
      void ready.get(withImage.id)!.then(show);
    } else {
      graphic.classList.remove('show-img');
    }
    // Get the next picture ready while the reader is still on this step.
    const next = stepImage.slice(i + 1).find(Boolean);
    if (next && !phone()) figure(next);
    const m = ensureMap();
    m.ready.then(() => {
      const lit = new Set(sc.map((c) => c.id));
      m.setPoints(
        chapterCards.filter((c) => !isNonPlace(c)).map((c) => ({
          id: c.id,
          lon: c.places[0].lon,
          lat: c.places[0].lat,
          label: c.title,
          title: true,
          color: eraColor(c.era),
          lit: lit.has(c.id),
          minor: !lit.has(c.id),
          priority: lit.has(c.id) ? 10 : 1,
        })),
      );
      const routes: MapRoute[] = [];
      if (i === 0) {
        for (const mv of MOVEMENTS.filter((x) => x.era === ch.id)) {
          routes.push({ id: mv.id, legs: mv.legs, color: eraColor(mv.era), flow: true, label: { text: movementText(mv, lang()).title, sub: movementText(mv, lang()).sub, at: mv.label } });
        }
      }
      for (const c of sc) {
        if (c.places.length < 2) continue;
        const [o, ...rest] = c.places;
        routes.push({ id: c.id, legs: rest.map((p) => ({ from: [o.lon, o.lat], to: [p.lon, p.lat] })), color: eraColor(c.era), flow: true });
      }
      // One animated change per step: the first step draws its routes, later
      // steps fly the map and the routes are simply there.
      m.setRoutes(routes, i === 0);
      const coords: [number, number][] = (sc.filter((c) => !isNonPlace(c)).length ? sc.filter((c) => !isNonPlace(c)).flatMap((c) => c.places) : [...ch.places, ...chapterCards.map((c) => c.places[0])]).map((p) => [p.lon, p.lat]);
      if (i === 0) routes.forEach((r) => r.legs.forEach((l) => coords.push(l.from, l.to)));
      const zoom = sc.length ? Math.min(...sc.map((c) => c.zoom)) : 2;
      // A step about one place zooms to its region, never a dark world with one dot;
      // places far apart still fit, since this is only the closest the map may come.
      const cap = LEVEL_K[Math.max(0, Math.min(3, zoom - 2))];
      m.fit(coords, i === 0 ? cap : Math.max(LEVEL_K[2], cap), current === 0 ? 0 : 1700);
    });
  };

  // Build the map only when the chapter comes near, then follow the steps.
  const near = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        ensureMap();
        if (current < 0) activate(0);
        near.disconnect();
      }
    },
    { rootMargin: '100% 0px' },
  );
  near.observe(el);
  // Another chapter's map never shows its labels behind this one's steps.
  new IntersectionObserver((es) => graphic.classList.toggle('away', !es[0].isIntersecting), { threshold: 0.02 }).observe(graphic.parentElement!);

  // The active step is the last one whose box has come into the lower part
  // of the screen: steps are most of a screen apart, so by then the one before
  // has scrolled away and the words on screen always own the picture. Read from
  // positions, not a crossing band, so jumps and flings land right too.
  let queued = false;
  const pickStep = () => {
    queued = false;
    const line = window.innerHeight * 0.85;
    let k = 0;
    steps.forEach((s, j) => {
      if (s.getBoundingClientRect().top < line) k = j;
    });
    if (map || current >= 0) activate(k);
  };
  const onScroll = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(pickStep);
    }
  };
  new IntersectionObserver(
    (es) => {
      if (es[0].isIntersecting) {
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
      } else window.removeEventListener('scroll', onScroll);
    },
    { rootMargin: '0px' },
  ).observe(el);
}

function finale(app: App): HTMLElement {
  const host = h('div.timeline-wrap');
  const cards = readerCards(app.set, app.edition);
  const sec = h(
    'section.finale',
    { id: 'atlas-intro', 'aria-labelledby': 'finale-title' },
    h('div.kicker', {}, t('The atlas')),
    h('h2', { id: 'finale-title' }, t('Seven centuries on one map')),
    h('p', {}, t('Every card has a place and a time. Brush the years, zoom from oceans to a single page, and watch the routes the music and the people took.')),
    h('p.finale-why', {}, pick({ en: 'The timeline below is the whole museum in time, seven centuries in one sweep; the atlas lays it out in space, the descent goes through it in detail.', ru: 'Лента времени ниже — весь музей во времени, семь веков одним взглядом; атлас раскладывает его в пространстве, спуск проходит его в подробностях.' })),
    h(
      'div.actions',
      {},
      h('button.btn.primary', { onclick: () => app.openDescent() }, t('Descend through the centuries')),
      h('button.btn', { onclick: () => app.openAtlas({ zoom: 1 }, true) }, t('Open the atlas')),
      h('button.btn', { onclick: () => app.openAtlas({ from: 1900, to: 1935, zoom: 3 }, true) }, t('1900–1935, cities and genres')),
      h('button.btn', { onclick: () => app.openBook() }, t('Your book')),
    ),
    host,
  );
  // The timeline wants a laid-out host; build it once the section is near.
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const eras = ERAS.map((e) => {
        const ch = app.chapters.find((c) => c.id === e.id);
        return ch?.years.length ? { ...e, from: ch.years[0], to: ch.years[1] ?? ch.years[0] } : e;
      });
      new Timeline(host, cards, eras, {
        onSelect: (id) => app.openCard(id),
        onEra: (id) => {
          const e = eras.find((x) => x.id === id)!;
          app.openAtlas({ from: e.from, to: e.to, zoom: 2 }, true);
        },
        onHover: (id, ev) => {
          const c = id ? app.set.get(id) : undefined;
          if (!c || !ev) return hideTip();
          showTip(ev, `${c.places[0].name} · ${formatYears(c.years)}`, c.title, c.wow);
        },
      });
    },
    { rootMargin: '50% 0px' },
  );
  io.observe(sec);
  return sec;
}

function heroParallax(): void {
  if (reducedMotion()) return;
  const heroes = [...document.querySelectorAll<HTMLElement>('.hero')];
  let raf = 0;
  const tick = () => {
    raf = 0;
    const vh = window.innerHeight;
    for (const hero of heroes) {
      const r = hero.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const p = Math.max(0, Math.min(1, -r.top / r.height));
      hero.style.setProperty('--hero-p', String(1 - p));
    }
  };
  window.addEventListener('scroll', () => (raf ||= requestAnimationFrame(tick)), { passive: true });
  tick();
}

/**
 * The ending returns to the bird of the title: go back and fetch it. A last
 * picture, the proverb, and the ways on.
 */
function coda(app: App): HTMLElement {
  const art = (app.set.get('adinkra') ?? app.raw('adinkra'))?.media?.find((m) => m.type === 'image');
  return h(
    'section.coda',
    { 'aria-labelledby': 'coda-title' },
    art ? h('img.coda-img', { ...mediaSrc(app, art.file, [1600]), sizes: '100vw', alt: '', loading: 'lazy', decoding: 'async' }) : null,
    h(
      'div.coda-inner.reveal',
      {},
      h('div.kicker', {}, 'Sankofa'),
      h('h2', { id: 'coda-title' }, pick({ en: 'Go back and fetch\u00a0it.', ru: 'Вернись и\u00a0забери.' })),
      h(
        'p',
        {},
        pick({
          en: 'The Akan proverb behind the name says it is not wrong to go back for what you have forgotten. Everything in this museum is a road back: every card has a source, every source a place, every place a way further.',
          ru: 'Пословица акан, от которой пошло имя, говорит: нет ничего дурного в том, чтобы вернуться за забытым. Всё в этом музее — дорога назад: у каждой карточки есть источник, у каждого источника — место, у каждого места — путь дальше.',
        }),
      ),
      h(
        'div.actions',
        {},
        h('button.btn.primary', { onclick: () => app.openDescent() }, t('Descend through the centuries')),
        h('a.btn', { href: '#view=engine', 'data-engine': '' }, t('The engine room')),
        h('button.btn', { onclick: () => app.openBook() }, t('Your book')),
      ),
      art ? h('p.credit', {}, art.caption ? art.caption + ' · ' : '', art.credit, ' · ', art.license) : null,
    ),
  );
}
