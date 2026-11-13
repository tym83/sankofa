import './styles/main.css';
import type { App } from './app';
import type { CardsFile, ChaptersFile } from './lib/types';
import { ERAS } from './lib/types';
import { rememberPlace, takePlace } from './lib/place';
import { CardSet, localizeCard, localizeChapter } from './lib/cards';
import { sortChapters } from './lib/chapters';
import { formatFragment } from './lib/fragment';
import { formatRoute, parseRoute, screenOf, type Route } from './lib/route';
import * as reader from './lib/reader';
import { copyText, h, svgIcon, toast } from './lib/dom';
import { detectLang, isLang, lang, setLang, storeLang, storedLang, t, t as tr, type Lang } from './lib/i18n';
import { buildStory } from './views/story';
import { localizeStatics, RU_TITLE_FIX } from './lib/statics';
import { loadMediaManifest } from './lib/media';
import { watchTypography } from './lib/typo';
import { Drawer, renderBook, renderCard } from './views/card';
import { Atlas } from './views/atlas';
import { Descent } from './views/descent';
import { Listen } from './views/listen';
import { Engine } from './views/engine';
import { Roots } from './views/roots';
import { RootsMap } from './views/rootsMap';

async function load<T>(url: string): Promise<T> {
  // The cover paints first; the data comes at a lower priority.
  const r = await fetch(url, { priority: 'low' } as RequestInit);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<T>;
}

function readRoute(): Route {
  return parseRoute(location.hash);
}

function writeRoute(r: Route, push: boolean): void {
  // Every link carries the language, so a shared link opens as it was read.
  const frag = formatRoute({ ...r, point: { ...r.point, lang: lang() === 'en' ? undefined : lang() } });
  const url = frag ? `#${frag}` : location.pathname + location.search;
  if (url === (location.hash || location.pathname + location.search)) return;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

/** Switch language: remember it, put it in the link, and rebuild the museum. */
export function switchLang(to: Lang): void {
  storeLang(to);
  const r = parseRoute(location.hash);
  // Keep the reader's place in the story across the rebuild.
  const here = !r.view ? rememberPlace() : undefined;
  if (here) r.ch = here.ch;
  const frag = formatRoute({ ...r, point: { ...r.point, lang: to === 'en' ? undefined : to } });
  history.replaceState(null, '', frag ? `#${frag}` : location.pathname + location.search);
  location.reload();
}

async function start(): Promise<void> {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('lang');
  const current = detectLang(fromHash, storedLang(), navigator.languages ?? navigator.language);
  setLang(current);
  if (isLang(fromHash)) storeLang(fromHash);
  document.documentElement.lang = current;
  localizeStatics(current);
  const loading = h('div.loading', { role: 'progressbar', 'aria-label': t('Loading the museum') });
  document.body.append(loading);
  let cardsFile: CardsFile;
  let chaptersFile: ChaptersFile;
  navLegend(current);
  // The language switch needs no data, so it works while the cards load.
  document.querySelectorAll<HTMLElement>('[data-lang-switch]').forEach((b) => b.addEventListener('click', () => switchLang(lang() === 'ru' ? 'en' : 'ru')));
  // Let the static cover paint before the 1 MB of cards competes for the wire.
  await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  try {
    [cardsFile, chaptersFile] = await Promise.all([load<CardsFile>('data/cards.json'), load<ChaptersFile>('data/chapters.json'), loadMediaManifest()]);
  } catch (e) {
    loading.remove();
    document.getElementById('story')!.append(h('p.error', {}, t('The museum could not load its cards ({error}). Run scripts/build-data.sh.', { error: (e as Error).message })));
    return;
  }

  const rawCards = new Map(cardsFile.cards.map((c) => [c.id, c]));
  const set = new CardSet(cardsFile.cards.map((c) => localizeCard(c, current)));
  const chapters = sortChapters(chaptersFile.chapters.map((c) => localizeChapter(c, current))).map((c) => ({ ...c, title: RU_TITLE_FIX[c.title] ?? c.title }));
  // One name per release: every era label is the chapter's own title.
  for (const e of ERAS) e.label = chapters.find((c) => c.id === e.id)?.title ?? e.label;
  const cardDrawer = new Drawer(t('Card'));
  const bookDrawer = new Drawer(t('Your book'));
  const pathListeners: ((p: string[]) => void)[] = [];
  let route = readRoute();
  let chapterNow: string | null = null;

  const app: App = {
    set,
    raw: (id) => rawCards.get(id),
    openEngine(push = true) {
      cardDrawer.close(true);
      bookDrawer.close(true);
      closeOverlays('engine');
      route = { point: {}, view: 'engine' };
      writeRoute(route, push);
      engine.open();
    },
    chapters,
    edition: reader.edition(),
    media: (file) => `media/${file}`,
    openCard(id, opts = {}) {
      const path = route.point.path;
      const exact = opts.exact ?? !!path?.includes(id);
      const asked = set.get(id);
      const c = exact ? asked : set.forEdition(id, app.edition);
      if (!c) return;
      bookDrawer.close(true);
      const foreign = c.edition !== 'both' && c.edition !== app.edition;
      cardDrawer.show(renderCard(app, c, { asked: !exact ? asked : undefined, foreign }));
      const next = reader.recordVisit(c.id);
      pathListeners.forEach((l) => l(next));
      route = { ...route, point: { ...route.point, focus: c.id } };
      if (!atlas.isOpen && !descent.isOpen && !listen.isOpen && !engine.isOpen && !roots.isOpen && !rootsMap.isOpen && !route.ch && chapterNow) route.ch = chapterNow;
      writeRoute(route, opts.push ?? true);
    },
    closeCard() {
      cardDrawer.close();
    },
    openAtlas(p, push = true) {
      cardDrawer.close(true);
      closeOverlays('atlas');
      bookDrawer.close(true);
      // A bare atlas has no point to show; name the view so the link opens it.
      route = { point: p, view: p.from || p.place || p.zoom || p.path?.length ? undefined : 'atlas' };
      writeRoute(route, push);
      atlas.open(p);
      if (p.focus) app.openCard(p.focus, { push: false, exact: !!p.path?.includes(p.focus) });
    },
    openBook() {
      cardDrawer.close(true);
      const path = reader.readPath();
      bookDrawer.show(
        renderBook(app, path, {
          share: async () => {
            const url = location.href.split('#')[0] + '#' + formatFragment({ path, lang: lang() === 'en' ? undefined : lang() });
            toast((await copyText(url)) ? t('Link to your path copied') : t('Copy failed'));
          },
          replay: () => {
            bookDrawer.close(true);
            app.openAtlas({ path, focus: path[0] });
          },
          clear: () => {
            reader.clearPath();
            pathListeners.forEach((l) => l([]));
            app.openBook();
          },
        }),
      );
    },
    openDescent(year, push = true) {
      cardDrawer.close(true);
      bookDrawer.close(true);
      closeOverlays('descent');
      route = { point: year ? { from: year } : {}, view: 'descent' };
      writeRoute(route, push);
      descent.open(year);
    },
    chapterInView(id) {
      chapterNow = id;
      // The link follows the chapter being read, so a reload or a shared
      // link opens there; overlays keep their own links.
      if (id && !atlas.isOpen && !descent.isOpen && !listen.isOpen && !engine.isOpen && !roots.isOpen && !rootsMap.isOpen && !route.point.focus && !route.view && route.ch !== id) {
        route = { point: {}, ch: id };
        writeRoute(route, false);
      }
    },
    onPath(cb) {
      pathListeners.push(cb);
    },
  };

  const atlas = new Atlas(app);
  const descent = new Descent(app);
  descent.onYear = (year) => {
    route = { point: { from: year, zoom: descent.level, focus: route.point.focus }, view: 'descent' };
    writeRoute(route, false);
  };
  descent.onLevel = () => descent.onYear?.(Math.round(descent.year));
  const engine = new Engine(app);
  engine.onClose = () => {
    engine.close();
    route = { point: {}, ch: chapterNow ?? undefined };
    writeRoute(route, false);
  };
  const roots = new Roots(app, cardsFile.roots ?? []);
  roots.onArtist = (artist) => {
    route = { point: {}, view: 'roots', artist };
    writeRoute(route, true);
  };
  roots.onClose = () => {
    roots.close();
    route = { point: {}, ch: chapterNow ?? undefined };
    writeRoute(route, false);
  };
  const rootsMap = new RootsMap(app, cardsFile.roots ?? []);
  rootsMap.onClose = () => {
    rootsMap.close();
    route = { point: {}, view: 'roots' };
    writeRoute(route, false);
    roots.open();
  };
  const closeOverlays = (keep?: string) => {
    if (keep !== 'roots-map' && rootsMap.isOpen) rootsMap.close();
    if (keep !== 'roots' && roots.isOpen) roots.close();
    if (keep !== 'atlas' && atlas.isOpen) atlas.close();
    if (keep !== 'descent' && descent.isOpen) descent.close();
    if (keep !== 'listen' && listen.isOpen) listen.close();
    if (keep !== 'engine' && engine.isOpen) engine.close();
  };
  const listen = new Listen(app);
  listen.onClose = () => {
    listen.close();
    route = { point: {}, ch: chapterNow ?? undefined };
    writeRoute(route, false);
  };
  descent.onClose = () => {
    descent.close();
    cardDrawer.close(true);
    route = { point: {}, ch: chapterNow ?? undefined };
    writeRoute(route, false);
  };
  atlas.onChange = (p) => {
    route = { point: p };
    writeRoute(route, false);
  };
  atlas.onClose = () => {
    atlas.close();
    cardDrawer.close(true);
    route = { point: {}, ch: chapterNow ?? undefined };
    writeRoute(route, false);
  };
  cardDrawer.onClose = () => {
    route = { ...route, point: { ...route.point, focus: undefined } };
    if (atlas.isOpen) atlas.unfocus();
    else writeRoute(route, false);
  };

  setupNav(app, atlas);
  document.querySelectorAll<HTMLAnchorElement>('[data-set-lang]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const to = a.dataset.setLang;
      if (isLang(to) && to !== lang()) switchLang(to);
    }),
  );
  buildStory(app, document.getElementById('story')!);
  watchTypography(current);
  trackChapters(app);
  loading.remove();

  // Escape closes the topmost panel first, wherever the focus is.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      const open = [cardDrawer, bookDrawer].find((d) => d.isOpen);
      if (!open) return;
      e.preventDefault();
      e.stopPropagation();
      open.close();
    },
    true,
  );

  // Inline card links anywhere open the card in place.
  document.addEventListener('click', (e) => {
    const rm = (e.target as Element).closest<HTMLElement>('[data-roots-map]');
    if (rm) {
      e.preventDefault();
      closeOverlays('roots-map');
      route = { point: {}, view: 'roots-map' };
      writeRoute(route, true);
      rootsMap.open();
      return;
    }
    const ra = (e.target as Element).closest<HTMLElement>('[data-artist-roots]');
    if (ra) {
      e.preventDefault();
      closeOverlays('roots');
      route = { point: {}, view: 'roots', artist: ra.dataset.artistRoots };
      writeRoute(route, true);
      roots.open(ra.dataset.artistRoots);
      return;
    }
    const ro = (e.target as Element).closest<HTMLElement>('[data-roots]');
    if (ro) {
      e.preventDefault();
      cardDrawer.close(true);
      closeOverlays('roots');
      route = { point: {}, view: 'roots' };
      writeRoute(route, true);
      roots.open();
      return;
    }
    const en = (e.target as Element).closest<HTMLElement>('[data-engine]');
    if (en) {
      e.preventDefault();
      app.openEngine();
      return;
    }
    const l = (e.target as Element).closest<HTMLElement>('[data-listen]');
    if (l) {
      e.preventDefault();
      closeOverlays('listen');
      cardDrawer.close(true);
      route = { point: {}, view: 'listen' };
      writeRoute(route, true);
      listen.open();
      return;
    }
    const d = (e.target as Element).closest<HTMLElement>('[data-descent]');
    if (d) {
      e.preventDefault();
      app.openDescent(d.dataset.descent ? Number(d.dataset.descent) : undefined);
      return;
    }
    const a = (e.target as Element).closest<HTMLElement>('[data-card]');
    if (a) {
      e.preventDefault();
      app.openCard(a.dataset.card!);
      return;
    }
    const ch = (e.target as Element).closest<HTMLElement>('a[data-chapter]');
    if (ch) {
      e.preventDefault();
      if (descent.isOpen) descent.onClose?.();
      scrollToChapter(ch.dataset.chapter!);
    }
  });

  const apply = (initial: boolean) => {
    // A link with another language (typed, pasted or followed) switches the museum.
    const asked = new URLSearchParams(location.hash.slice(1)).get('lang');
    if (!initial && isLang(asked) && asked !== lang()) return switchLang(asked);
    route = readRoute();
    const screen = screenOf(route);
    closeOverlays(screen);
    if (screen === 'listen') listen.open();
    else if (screen === 'engine') engine.open();
    else if (screen === 'roots') roots.open(route.artist);
    else if (screen === 'roots-map') rootsMap.open();
    else if (screen === 'descent') descent.open(route.point.from, route.point.zoom);
    else if (screen === 'atlas') atlas.open(route.point);
    else if (route.ch && (initial || route.ch !== chapterNow)) {
      scrollToChapter(route.ch, initial);
      // After a language or copy switch, come back to the same depth in the chapter.
      const back = initial ? takePlace(route.ch) : undefined;
      const el = back && document.getElementById(`ch-${back.ch}`);
      if (back && el) {
        // Pictures and fonts above may still settle: aim again a few times,
        // unless the reader has started scrolling.
        let moved = false;
        const stop = () => (moved = true);
        window.addEventListener('wheel', stop, { once: true, passive: true });
        window.addEventListener('touchstart', stop, { once: true, passive: true });
        const aim = () => !moved && window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + back.frac * el.offsetHeight, behavior: 'auto' });
        requestAnimationFrame(aim);
        [300, 900, 1800].forEach((ms) => setTimeout(aim, ms));
      }
    } else if (initial && route.point.focus) {
      // A card link opens over its own chapter, not wherever the story was.
      const era = app.set.get(route.point.focus)?.era;
      if (era) scrollToChapter(era, true);
    }
    if (route.point.focus) app.openCard(route.point.focus, { push: false });
    else cardDrawer.close(true);
  };
  // Mirror the language into the link, so what is shared opens as it was read.
  if (lang() !== 'en' && !isLang(new URLSearchParams(location.hash.slice(1)).get('lang'))) writeRoute(readRoute(), false);
  window.addEventListener('popstate', () => apply(false));
  window.addEventListener('hashchange', () => apply(false));
  apply(true);
}

function scrollToChapter(id: string, instant = false): void {
  const el = document.getElementById(`ch-${id}`);
  el?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
}

function setupNav(app: App, atlas: Atlas): void {
  const nav = document.querySelector<HTMLElement>('.nav')!;
  const progress = nav.querySelector<HTMLElement>('.progress')!;
  for (const ch of app.chapters) {
    progress.append(h('a', { href: `#ch=${ch.id}`, 'data-chapter': ch.id, 'aria-label': `${ch.id}: ${ch.title}` }, h('span', {}, ch.id)));
  }
  nav.querySelector('[data-home]')!.addEventListener('click', (e) => {
    e.preventDefault();
    if (atlas.isOpen) atlas.onClose?.();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  const atlasBtn = nav.querySelector<HTMLElement>('[data-open-atlas]')!;
  atlasBtn.addEventListener('click', () => app.openAtlas({ zoom: 1 }));
  const bookBtn = nav.querySelector<HTMLElement>('[data-open-book]')!;
  bookBtn.addEventListener('click', () => app.openBook());
  const count = nav.querySelector<HTMLElement>('[data-path-count]')!;
  const setCount = (p: string[]) => {
    count.textContent = String(new Set(p).size);
  };
  setCount(reader.readPath());
  app.onPath(setCount);

  const themeBtn = nav.querySelector<HTMLButtonElement>('[data-theme-toggle]')!;
  const paintTheme = () => {
    const t = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    themeBtn.replaceChildren(svgIcon(t === 'light' ? 'moon' : 'sun'));
    themeBtn.setAttribute('aria-label', tr(t === 'light' ? 'Switch to dark theme' : 'Switch to light theme'));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f5efe3' : '#0c0d18');
  };
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    reader.setTheme(next);
    paintTheme();
  });
  paintTheme();

  const onScroll = () => nav.classList.toggle('solid', window.scrollY > window.innerHeight * 0.6);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function trackChapters(app: App): void {
  const links = [...document.querySelectorAll<HTMLElement>('.progress a')];
  const articles = [...document.querySelectorAll<HTMLElement>('article.chapter')];
  let raf = 0;
  let last: string | null | undefined;
  const tick = () => {
    raf = 0;
    const mid = window.innerHeight / 2;
    const at = articles.find((a) => {
      const r = a.getBoundingClientRect();
      return r.top <= mid && r.bottom > mid;
    });
    const id = at?.dataset.chapter ?? null;
    if (id === last) return;
    last = id;
    app.chapterInView(id);
    const idx = id ? app.chapters.findIndex((c) => c.id === id) : -1;
    const past = !id && articles.length > 0 && articles[articles.length - 1].getBoundingClientRect().bottom < mid;
    links.forEach((l, i) => {
      l.classList.toggle('on', i === idx);
      l.classList.toggle('done', past || (idx >= 0 && i < idx));
    });
  };
  window.addEventListener('scroll', () => (raf ||= requestAnimationFrame(tick)), { passive: true });
  tick();
}

start();

/**
 * On a phone the top bar is icons only. On the first visit a strip under it
 * names each icon once; it goes away when closed or when an icon is used.
 */
function navLegend(l: string): void {
  if (window.innerWidth >= 720) return;
  const KEY = 'sankofa.navlegend';
  try {
    if (localStorage.getItem(KEY)) return;
  } catch {
    return;
  }
  const items = [...document.querySelectorAll<HTMLElement>('.nav-actions .btn:not(.lang-switch)')]
    .map((b) => {
      const svg = b.querySelector('svg')?.cloneNode(true);
      const name = b.querySelector(`.label [data-l="${l}"]`)?.textContent ?? '';
      return svg && name ? h('span', {}, svg as SVGElement as unknown as HTMLElement, name) : null;
    })
    .filter((x): x is HTMLElement => !!x);
  if (!items.length) return;
  const strip = h('div.nav-legend', { role: 'note' }, ...items, h('button.icon-btn', { 'aria-label': l === 'ru' ? 'Скрыть подсказку' : 'Hide this hint', onclick: () => done() }, '×'));
  const done = () => {
    strip.remove();
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* private mode */
    }
  };
  document.querySelectorAll('.nav-actions .btn').forEach((b) => b.addEventListener('click', done, { once: true }));
  // Only on the story, and only until the reader starts reading: the first
  // scroll folds it away for good, and it never sits over an open view.
  if (/(^|[#&])(view|focus)=/.test(location.hash) || document.body.classList.contains('locked')) return;
  window.addEventListener('scroll', done, { once: true, passive: true });
  new MutationObserver(() => document.body.classList.contains('locked') && done()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.body.append(strip);
}
