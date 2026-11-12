// The long read: cover, opener, contents, eight chapters told in scroll steps
// over a sticky map or photograph, and the timeline at the end.
import type { App } from '../app';
import { EDITION_NAME, richText } from '../app';
import type { Card, Chapter } from '../lib/types';
import { ERAS } from '../lib/types';
import { formatYears, KIND_LABEL, links } from '../lib/cards';
import { bookMarks, h, reducedMotion, revealOnScroll } from '../lib/dom';
import { eraColor } from '../lib/atlasModel';
import { MOVEMENTS } from '../lib/movements';
import { GeoMap, LEVEL_K, type MapRoute } from './map';
import { Timeline } from './timeline';
import { hideTip, showTip } from './tip';

export function buildStory(app: App, main: HTMLElement): void {
  coverMap(main.querySelector<HTMLElement>('.cover-map'));
  const edition = main.querySelector('[data-edition]');
  if (edition) edition.textContent = EDITION_NAME[app.edition];
  main.querySelectorAll<HTMLElement>('[data-book]').forEach((b) => b.replaceWith(bookMarks([b.dataset.book!])));

  main.append(toc(app));
  for (const ch of app.chapters) main.append(chapter(app, ch));
  main.append(finale(app));
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

function heroImg(app: App, ch: Chapter, eager: boolean): HTMLElement | null {
  if (!ch.hero?.file) return null;
  return h('img', {
    src: app.media(ch.hero.file),
    alt: ch.hero.caption ?? '',
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    fetchpriority: eager ? 'high' : undefined,
  });
}

/**
 * A chapter without a photograph opens on its own night map: every place in
 * the chapter lit, its movements and routes drawing themselves.
 */
function heroMap(app: App, ch: Chapter): HTMLElement {
  const host = h('div.hero-map', { 'aria-hidden': 'true' });
  const cards = [...new Set(ch.cards.map((id) => app.set.forEdition(id, app.edition)).filter(Boolean) as Card[])];
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
      const map = new GeoMap(host, { frame });
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
    { id: 'contents', 'aria-label': 'Contents' },
    h('div.toc-head', {}, h('h2', {}, 'Eight releases'), h('p', {}, 'Each era ships as a release of the distribution, from v0 to v7. Begin anywhere; every card leads somewhere else.')),
    h(
      'div.toc-grid',
      {},
      app.chapters.map((ch) =>
        h(
          'a.toc-item.reveal',
          { href: `#ch=${ch.id}`, 'data-chapter': ch.id, style: `--era:${eraColor(ch.id)}` },
          heroImg(app, ch, false) ?? h('span.toc-glyph', { 'aria-hidden': 'true' }, ch.id),
          h('span.num', {}, ch.id.toUpperCase()),
          h('span.t', {}, h('b', {}, ch.title), h('span', {}, ch.kicker)),
        ),
      ),
    ),
  );
}

function stepCards(app: App, text: string): Card[] {
  const out: Card[] = [];
  for (const id of links(text)) {
    const c = app.set.forEdition(id, app.edition);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

function chapter(app: App, ch: Chapter): HTMLElement {
  const color = eraColor(ch.id);
  const cards = [...new Set(ch.cards.map((id) => app.set.forEdition(id, app.edition)).filter(Boolean) as Card[])];
  const isFirst = app.chapters[0] === ch;

  const mapHero = !ch.hero?.file;
  const hero = h(
    `header.hero${mapHero ? '.map-hero' : ''}`,
    { style: `--era:${color}` },
    mapHero ? heroMap(app, ch) : heroImg(app, ch, isFirst),
    h(
      'div.hero-text',
      {},
      h('div.release', {}, h('span.v', {}, ch.id), h('span.kicker', {}, ch.kicker)),
      h('h2', { id: `title-${ch.id}` }, ch.title),
    ),
    mapHero ? h('p.credit', {}, 'The places of this chapter · map data: Natural Earth, public domain') : null,
    ch.hero ? h('p.credit', {}, ch.hero.caption ? ch.hero.caption + ' · ' : '', ch.hero.credit, ' · ', ch.hero.url ? h('a', { href: ch.hero.url, rel: 'noopener', target: '_blank' }, ch.hero.license) : ch.hero.license) : null,
  );

  const mapHost = h('div.map', { 'aria-hidden': 'true' });
  const imgHost = h('div.img', { 'aria-hidden': 'true' });
  const graphic = h('div.graphic', {}, mapHost, imgHost);
  const steps = ch.steps.map((s, i) => {
    const sc = stepCards(app, s);
    const where = sc[0] ? `${sc[0].places[0].name} · ${formatYears(sc[0].years)}` : ch.kicker;
    return h(`div.step${i === 0 ? '.first' : ''}`, { 'data-step': String(i) }, h('div.where', {}, where), h('p', {}, richText(app, s)));
  });
  const scrolly = h('div.scrolly', {}, graphic, h('div.steps', {}, steps));

  const pick = cards.find((c, i) => i > 0 && c.wow.length < 140) ?? cards[0];
  const interlude = pick
    ? h(
        'section.interlude',
        { style: `--era:${color}` },
        h('blockquote.reveal', {}, pick.wow),
        h('a.btn.attr.reveal', { href: `#focus=${pick.id}`, 'data-card': pick.id }, bookMarks(pick.books), `${pick.title}, ${formatYears(pick.years)} →`),
      )
    : null;

  const strip = cards.length
    ? h(
        'section.strip',
        {},
        h('h3', {}, `In ${ch.id}: ${cards.length} cards`),
        h(
          'div.strip-row',
          {},
          cards.map((c) => teaser(app, c)),
        ),
      )
    : null;

  const el = h(
    'article.chapter',
    { id: `ch-${ch.id}`, 'data-chapter': ch.id, 'aria-labelledby': `title-${ch.id}`, style: `--era:${color}` },
    hero,
    scrolly,
    interlude,
    strip,
    h('div.kente', { 'aria-hidden': 'true' }),
  );
  runScrolly(app, ch, el, graphic, mapHost, imgHost, steps);
  return el;
}

export function teaser(app: App, c: Card): HTMLElement {
  const img = c.media?.find((m) => m.type === 'image');
  return h(
    'a.teaser.reveal',
    { href: `#focus=${c.id}`, 'data-card': c.id, style: `--era:${eraColor(c.era)}` },
    h('div.ph', {}, img ? h('img', { src: app.media(img.file), alt: '', loading: 'lazy', decoding: 'async' }) : h('span.glyph', { 'aria-hidden': 'true' }, c.title.slice(0, 1))),
    h(
      'div.tx',
      {},
      h('div.k', {}, h('span', {}, KIND_LABEL[c.kind] ?? c.kind), h('span', {}, formatYears(c.years)), h('span.bk', {}, bookMarks(c.books))),
      h('b', {}, c.title),
      h('span.w', {}, c.wow),
    ),
  );
}

function runScrolly(app: App, ch: Chapter, el: HTMLElement, graphic: HTMLElement, mapHost: HTMLElement, imgHost: HTMLElement, steps: HTMLElement[]): void {
  let map: GeoMap | null = null;
  let current = -1;
  const figures = new Map<string, HTMLElement>();
  const chapterCards = [...new Set(ch.cards.map((id) => app.set.forEdition(id, app.edition)).filter(Boolean) as Card[])];
  const shownImages = new Set<string>();

  const figure = (c: Card): HTMLElement | null => {
    const m = c.media?.find((x) => x.type === 'image');
    if (!m) return null;
    if (!figures.has(c.id)) {
      const src = app.media(m.file);
      const f = h(
        'figure',
        {},
        h('div.bg', { style: `background-image:url("${src}")` }),
        h('img', { src, alt: m.caption ?? c.title, decoding: 'async' }),
        h('figcaption.credit', {}, h('b', {}, m.caption ?? c.title), m.credit, ' · ', m.license),
      );
      figures.set(c.id, f);
      imgHost.append(f);
    }
    return figures.get(c.id)!;
  };

  const ensureMap = () => {
    if (map) return map;
    map = new GeoMap(mapHost, {});
    return map;
  };

  const activate = (i: number) => {
    if (i === current) return;
    current = i;
    steps.forEach((s, j) => s.classList.toggle('on', j === i));
    const sc = stepCards(app, ch.steps[i] ?? '');
    const withImage = sc.find((c) => c.media?.some((m) => m.type === 'image'));
    // The first step orients the reader on the map; later steps show a face or
    // a document when the card has one, unless it was already shown.
    const showImage = i > 0 && withImage && !shownImages.has(withImage.id);
    if (showImage && withImage) {
      shownImages.add(withImage.id);
      const f = figure(withImage);
      figures.forEach((x) => x.classList.toggle('on', x === f));
      graphic.classList.add('show-img');
    } else {
      graphic.classList.remove('show-img');
    }
    const m = ensureMap();
    m.ready.then(() => {
      const lit = new Set(sc.map((c) => c.id));
      m.setPoints(
        chapterCards.map((c) => ({
          id: c.id,
          lon: c.places[0].lon,
          lat: c.places[0].lat,
          label: c.title,
          title: true,
          color: eraColor(c.era),
          lit: lit.has(c.id),
          minor: !lit.has(c.id) && i > 0,
          priority: lit.has(c.id) ? 10 : 1,
        })),
      );
      const routes: MapRoute[] = [];
      if (i === 0) {
        for (const mv of MOVEMENTS.filter((x) => x.era === ch.id)) {
          routes.push({ id: mv.id, legs: mv.legs, color: eraColor(mv.era), flow: true, label: { text: mv.title, sub: mv.sub, at: mv.label } });
        }
      }
      for (const c of sc) {
        if (c.places.length < 2) continue;
        const [o, ...rest] = c.places;
        routes.push({ id: c.id, legs: rest.map((p) => ({ from: [o.lon, o.lat], to: [p.lon, p.lat] })), color: eraColor(c.era), flow: true });
      }
      m.setRoutes(routes);
      const coords: [number, number][] = (sc.length ? sc.flatMap((c) => c.places) : [...ch.places, ...chapterCards.map((c) => c.places[0])]).map((p) => [p.lon, p.lat]);
      if (i === 0) routes.forEach((r) => r.legs.forEach((l) => coords.push(l.from, l.to)));
      const zoom = sc.length ? Math.min(...sc.map((c) => c.zoom)) : 2;
      m.fit(coords, LEVEL_K[Math.max(0, Math.min(3, zoom - 2))], current === 0 ? 0 : 1700);
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

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) activate(Number((e.target as HTMLElement).dataset.step));
      }
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  steps.forEach((s) => io.observe(s));
}

function finale(app: App): HTMLElement {
  const host = h('div.timeline-wrap');
  const cards = app.set.all().filter((c) => c.edition === 'both' || c.edition === app.edition);
  const sec = h(
    'section.finale',
    { id: 'atlas-intro', 'aria-labelledby': 'finale-title' },
    h('div.kicker', {}, 'The atlas'),
    h('h2', { id: 'finale-title' }, 'Seven centuries on one map'),
    h('p', {}, 'Every card has a place and a time. Brush the years, zoom from oceans to a single page, and watch the routes the music and the people took.'),
    h(
      'div.actions',
      {},
      h('button.btn.primary', { onclick: () => app.openDescent() }, 'Descend through the centuries'),
      h('button.btn', { onclick: () => app.openAtlas({ zoom: 1 }, true) }, 'Open the atlas'),
      h('button.btn', { onclick: () => app.openAtlas({ from: 1900, to: 1935, zoom: 3 }, true) }, '1900–1935, cities and genres'),
      h('button.btn', { onclick: () => app.openBook() }, 'Your book'),
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
