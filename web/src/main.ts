import './styles/main.css';
import type { App } from './app';
import type { CardsFile, ChaptersFile } from './lib/types';
import { CardSet } from './lib/cards';
import { sortChapters } from './lib/chapters';
import { formatFragment, safeParse, type Point } from './lib/fragment';
import * as reader from './lib/reader';
import { copyText, h, svgIcon, toast } from './lib/dom';
import { buildStory } from './views/story';
import { Drawer, renderBook, renderCard } from './views/card';
import { Atlas } from './views/atlas';

async function load<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<T>;
}

interface Route {
  point: Point;
  ch?: string;
}

function readRoute(): Route {
  const hash = location.hash.slice(1);
  const ch = new URLSearchParams(hash).get('ch') ?? undefined;
  return { point: safeParse(hash), ch };
}

function writeRoute(r: Route, push: boolean): void {
  const frag = [formatFragment(r.point), r.ch ? `ch=${encodeURIComponent(r.ch)}` : ''].filter(Boolean).join('&');
  const url = frag ? `#${frag}` : location.pathname + location.search;
  if (url === (location.hash || location.pathname + location.search)) return;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

const isAtlas = (r: Route) => !r.ch && !!(r.point.path?.length || r.point.from || r.point.place || r.point.zoom);

async function start(): Promise<void> {
  const loading = h('div.loading', { role: 'progressbar', 'aria-label': 'Loading the museum' });
  document.body.append(loading);
  let cardsFile: CardsFile;
  let chaptersFile: ChaptersFile;
  try {
    [cardsFile, chaptersFile] = await Promise.all([load<CardsFile>('data/cards.json'), load<ChaptersFile>('data/chapters.json')]);
  } catch (e) {
    loading.remove();
    document.getElementById('story')!.append(h('p.error', {}, `The museum could not load its cards (${(e as Error).message}). Run scripts/build-data.sh.`));
    return;
  }

  const set = new CardSet(cardsFile.cards);
  const chapters = sortChapters(chaptersFile.chapters);
  const cardDrawer = new Drawer('Card');
  const bookDrawer = new Drawer('Your book');
  const pathListeners: ((p: string[]) => void)[] = [];
  let route = readRoute();
  let chapterNow: string | null = null;

  const app: App = {
    set,
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
      if (!atlas.isOpen && !route.ch && chapterNow) route.ch = chapterNow;
      writeRoute(route, opts.push ?? true);
    },
    closeCard() {
      cardDrawer.close();
    },
    openAtlas(p, push = true) {
      cardDrawer.close(true);
      bookDrawer.close(true);
      route = { point: p };
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
            const url = location.href.split('#')[0] + '#' + formatFragment({ path });
            toast((await copyText(url)) ? 'Link to your path copied' : 'Copy failed');
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
    chapterInView(id) {
      chapterNow = id;
    },
    onPath(cb) {
      pathListeners.push(cb);
    },
  };

  const atlas = new Atlas(app);
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
  buildStory(app, document.getElementById('story')!);
  trackChapters(app);
  loading.remove();

  // Inline card links anywhere open the card in place.
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLElement>('[data-card]');
    if (a) {
      e.preventDefault();
      app.openCard(a.dataset.card!);
      return;
    }
    const ch = (e.target as Element).closest<HTMLElement>('a[data-chapter]');
    if (ch) {
      e.preventDefault();
      scrollToChapter(ch.dataset.chapter!);
    }
  });

  const apply = (initial: boolean) => {
    route = readRoute();
    if (isAtlas(route)) {
      atlas.open(route.point);
      if (route.point.focus) app.openCard(route.point.focus, { push: false });
      else cardDrawer.close(true);
      return;
    }
    if (atlas.isOpen) atlas.close();
    if (route.ch && (initial || route.ch !== chapterNow)) scrollToChapter(route.ch, initial);
    if (route.point.focus) app.openCard(route.point.focus, { push: false });
    else cardDrawer.close(true);
  };
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
  atlasBtn.prepend(svgIcon('map'));
  atlasBtn.addEventListener('click', () => app.openAtlas({ zoom: 1 }));
  const bookBtn = nav.querySelector<HTMLElement>('[data-open-book]')!;
  bookBtn.prepend(svgIcon('book'));
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
    themeBtn.setAttribute('aria-label', t === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
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
