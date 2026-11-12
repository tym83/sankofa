// "Through the centuries": a single descent from 1300 to today, in the spirit
// of a depth page. A year meter ticks on the side, the sky changes with the
// era, cards surface at their year, lives run alongside as bars and genres
// branch from their roots.
import type { App } from '../app';
import type { Card } from '../lib/types';
import { ERAS } from '../lib/types';
import { formatYears, span } from '../lib/cards';
import { bookMarks, h, reducedMotion, svgIcon } from '../lib/dom';
import { eraColor, readerCards } from '../lib/atlasModel';
import { MOVEMENTS } from '../lib/movements';
import { buildScale, chapterAt, chapterCentres, lanes, NOW, place, quietStretches, START, type Item, type Placed, type Scale } from '../lib/descentModel';
import { interpolateRgb } from 'd3-interpolate';
import { scaleLinear } from 'd3-scale';

const SKY = scaleLinear<string>()
  .domain([1300, 1450, 1500, 1600, 1750, 1830, 1880, 1925, 1955, 1975, 2000, NOW])
  .range(['#3d2814', '#2e1e10', '#16213a', '#0b1528', '#070d1c', '#121429', '#1d1631', '#2b1a2d', '#1d1126', '#110b27', '#07061b', '#020208'])
  .interpolate(interpolateRgb)
  .clamp(true);
const SUN = scaleLinear().domain([1300, 1480, 1600, 1880, 1930, 1960, 1990]).range([0.6, 0.38, 0.06, 0.08, 0.16, 0.06, 0]).clamp(true);
const STARS = scaleLinear().domain([1945, 1975, 2005]).range([0, 0.55, 1]).clamp(true);

const QUIET = [
  'The archive is quiet here. The people were not.',
  'Few records survive from these years. Absence of evidence, not of lives.',
  'A long stretch with no card yet. Somebody was singing.',
  'Silence in the sources. Keep going.',
];

export class Descent {
  readonly el: HTMLElement;
  private track: HTMLElement;
  private meterYear: HTMLElement;
  private meterAgo: HTMLElement;
  private meterEra: HTMLElement;
  private railDot: HTMLElement;
  private sun: HTMLElement;
  private stars: HTMLElement;
  private scale?: Scale;
  private built = false;
  private raf = 0;
  private idle = 0;
  private lastYear = -1;
  private centres?: Map<string, number>;
  onYear?: (year: number) => void;
  onClose?: () => void;

  constructor(private app: App) {
    this.meterYear = h('div.dm-year', { 'aria-hidden': 'true' }, String(START));
    this.meterAgo = h('div.dm-ago', { 'aria-hidden': 'true' });
    this.meterEra = h('div.dm-era', { 'aria-live': 'polite' });
    this.railDot = h('i.dm-dot');
    const rail = h('div.dm-rail', { 'aria-hidden': 'true' }, this.railDot);
    const meter = h('div.dmeter', {}, this.meterYear, this.meterAgo, this.meterEra, rail);
    this.sun = h('div.d-sun', { 'aria-hidden': 'true' });
    this.stars = h('div.d-stars', { 'aria-hidden': 'true' });
    this.track = h('div.d-track');
    const bar = h(
      'header.d-bar',
      {},
      h('span.d-title', {}, 'Through the centuries'),
      h('button.icon-btn', { 'aria-label': 'Leave the descent', onclick: () => this.onClose?.() }, svgIcon('close')),
    );
    this.el = h('section.descent', { 'aria-label': 'Through the centuries: a descent from 1300 to today', tabindex: '-1' }, this.sun, this.stars, bar, meter, this.track);
    this.el.addEventListener('scroll', () => this.onScroll(), { passive: true });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.onClose?.();
    });
    rail.append(...this.railEras());
    this.stars.style.boxShadow = starfield(260);
    document.body.append(this.el);
    window.addEventListener('resize', () => {
      if (this.isOpen) this.layout(this.yearNow());
      else this.built = false;
    });
  }

  get isOpen(): boolean {
    return this.el.classList.contains('open');
  }

  open(year?: number): void {
    const first = !this.isOpen;
    this.el.classList.add('open');
    document.body.classList.add('locked');
    if (!this.built) this.layout();
    if (first) this.el.focus({ preventScroll: true });
    if (year) this.goTo(year, !first);
    else if (first) this.el.scrollTop = 0;
    this.onScroll();
  }

  close(): void {
    this.el.classList.remove('open');
    document.body.classList.remove('locked');
  }

  goTo(year: number, smooth = false): void {
    if (!this.scale) return;
    const top = this.scale.y(year) - this.el.clientHeight * 0.45;
    this.el.scrollTo({ top: Math.max(0, top), behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  }

  private yearNow(): number {
    if (!this.scale) return START;
    return this.scale.year(this.el.scrollTop + this.el.clientHeight * 0.45);
  }

  private railEras(): HTMLElement[] {
    return ERAS.map((e) => {
      const ch = this.app.chapters.find((c) => c.id === e.id);
      const [a, b] = ch?.years.length ? [ch.years[0], ch.years[1] ?? NOW] : [e.from, e.to];
      const f = (y: number) => ((y - START) / (NOW - START)) * 100;
      return h('b', {
        style: `top:${f(a)}%;height:${Math.max(1, f(b) - f(a))}%;--era:${eraColor(e.id)};left:${ERAS.indexOf(e) % 2 ? 5 : 0}px`,
        title: `${e.id} ${e.label}`,
      });
    });
  }

  private onScroll(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const y = this.yearNow();
      const year = Math.round(y);
      this.el.style.backgroundColor = SKY(y);
      this.sun.style.opacity = String(SUN(y));
      this.stars.style.opacity = String(STARS(y));
      this.railDot.style.top = `${((y - START) / (NOW - START)) * 100}%`;
      if (year !== this.lastYear) {
        this.lastYear = year;
        this.meterYear.textContent = String(year);
        const ago = NOW - year;
        this.meterAgo.textContent = ago === 0 ? 'this year' : `${ago} years ago`;
        this.centres ??= chapterCentres(this.app.chapters, (id) => this.app.set.get(id)?.years[0]);
        const ch = chapterAt(this.app.chapters, year, this.centres);
        const label = ch ? `${ch.id} · ${ch.title}` : '';
        if (this.meterEra.textContent !== label) {
          this.meterEra.textContent = label;
          this.meterEra.style.setProperty('--era', eraColor(ch?.id));
        }
      }
      clearTimeout(this.idle);
      this.idle = window.setTimeout(() => this.isOpen && this.onYear?.(Math.round(this.yearNow())), 250);
    });
  }

  /** Build the whole descent: measure the cards, stretch time to fit, place. */
  private layout(keepYear?: number): void {
    const app = this.app;
    const W = this.el.clientWidth || window.innerWidth;
    const mobile = W < 760;
    const cards = readerCards(app.set, app.edition).filter((c) => c.years.length);
    const cardIndex = new Map(cards.map((c) => [c.id, c]));

    // Geometry of the columns.
    const axisX = mobile ? 14 : Math.max(330, W * 0.24);
    const livesX = axisX + (mobile ? 8 : 18);
    const laneW = mobile ? 6 : 15;
    const maxLanes = mobile ? 5 : 9;
    const livesW = laneW * maxLanes;
    const treeX = livesX + livesW + (mobile ? 0 : 20);
    const treeW = mobile ? 0 : Math.min(170, W * 0.11);
    const cardsX = treeX + treeW + (mobile ? 8 : 24);
    const cols = mobile ? 1 : W > 1180 ? 2 : 1;
    const colGap = 26;
    const right = mobile ? 12 : 48;
    const colW = Math.min(440, (W - cardsX - right - colGap * (cols - 1)) / cols);

    this.track.replaceChildren();
    const layer = (cls: string) => {
      const l = h(`div.${cls}`);
      this.track.append(l);
      return l;
    };
    const bands = layer('d-bands');
    const axis = layer('d-axis');
    const svgHost = layer('d-svg');
    const lifeLayer = layer('d-lives');
    const items = layer('d-items');

    // Elements first, so they can be measured.
    const els = new Map<string, HTMLElement>();
    const list: Item[] = [];
    for (const c of cards) {
      const el = this.cardEl(c, colW);
      els.set('card:' + c.id, el);
      list.push({ kind: 'card', id: c.id, year: Math.max(START, span(c)[0]), h: 0 });
    }
    for (const ch of app.chapters) {
      if (!ch.years.length) continue;
      const el = h(
        'div.d-chapter',
        { style: `--era:${eraColor(ch.id)}` },
        h('span.v', {}, ch.id),
        h('b', {}, ch.title),
        h('span.k', {}, ch.kicker),
        h('a.d-read', { href: `#ch=${ch.id}`, 'data-chapter': ch.id }, 'Read the chapter →'),
      );
      els.set('chapter:' + ch.id, el);
      list.push({ kind: 'chapter', id: ch.id, year: ch.years[0], h: 0 });
    }
    for (const m of MOVEMENTS) {
      const el = h('div.d-move', { style: `--era:${eraColor(m.era)}` }, h('small', {}, 'Movement'), h('b', {}, m.title), h('span', {}, m.sub));
      els.set('movement:' + m.id, el);
      list.push({ kind: 'movement', id: m.id, year: m.years[0], h: 0 });
    }
    quietStretches(cards).forEach((q, i) => {
      const el = h('div.d-quiet', {}, h('span', {}, `${q.from} — ${q.to}`), QUIET[i % QUIET.length]);
      els.set('quiet:' + i, el);
      list.push({ kind: 'quiet', id: String(i), year: Math.round((q.from + q.to) / 2), h: 0, from: q.from, to: q.to });
    });

    // Measure off-screen.
    const probe = h('div.d-probe', { style: `width:${cols > 1 ? colW * cols + colGap : colW}px` });
    this.track.append(probe);
    for (const it of list) {
      const el = els.get(`${it.kind}:${it.id}`)!;
      el.style.width = `${it.kind === 'card' ? colW : cols * colW + (cols - 1) * colGap}px`;
      probe.append(el);
    }
    for (const it of list) it.h = els.get(`${it.kind}:${it.id}`)!.offsetHeight;
    probe.remove();

    const top = this.el.clientHeight * 1.05;
    const bottom = this.el.clientHeight * 0.9;
    const scale = (this.scale = buildScale(
      list.map((it) => ({ year: it.year, need: (it.h + 22) / (it.kind === 'card' ? cols : 1) })),
      top,
      bottom,
      mobile ? 0.9 : 1,
    ));
    const placed = place(list, scale, cols);
    const end = Math.max(scale.height, ...placed.map((p) => p.top + p.item.h + bottom));
    this.track.style.height = `${end}px`;

    // Intro and outro.
    const intro = h(
      'div.d-intro',
      { style: `height:${top}px` },
      h('div.kicker', {}, `${START} – ${NOW}`),
      h('h2', {}, 'Through the centuries'),
      h('p', {}, `Seven hundred years of Black culture, one year at a time. Scroll down: every screen is time, and the deeper you go, the closer you come to today.`),
      h('div.d-down', { 'aria-hidden': 'true' }, h('i')),
    );
    const outro = h(
      'div.d-outro',
      { style: `top:${end - bottom}px;height:${bottom}px` },
      h('div.kicker', {}, String(NOW)),
      h('h2', {}, 'Today.'),
      h('p', {}, `You have come down ${NOW - START} years. Every card on the way has a place, a time and its sources.`),
      h(
        'div.actions',
        {},
        h('button.btn.primary', { onclick: () => app.openAtlas({ zoom: 1 }) }, 'Open the atlas'),
        h('button.btn', { onclick: () => app.openBook() }, 'Your book'),
        h('button.btn', { onclick: () => this.goTo(START, true) }, 'Back to 1300'),
      ),
    );
    this.track.append(intro, outro);

    // Movements as wide bands behind everything.
    MOVEMENTS.forEach((m, i) => {
      const y0 = scale.y(m.years[0]);
      const y1 = scale.y(m.years[1]);
      bands.append(
        h('div.d-band', {
          style: `top:${y0}px;height:${Math.max(40, y1 - y0)}px;left:${axisX}px;right:${8 + (i % 3) * 7}px;--era:${eraColor(m.era)}`,
          title: `${m.title}, ${m.years[0]}–${m.years[1]}`,
        }),
      );
    });

    // The axis: centuries large, decades small.
    for (let y = START; y <= NOW; y += 10) {
      const century = y % 100 === 0;
      const fifty = y % 50 === 0;
      if (!century && !fifty && scale.y(y + 10) - scale.y(y) < 26) continue;
      axis.append(
        h(`div.d-tick${century ? '.c' : fifty ? '.f' : ''}`, { style: `top:${scale.y(y)}px;left:${axisX}px` }, century || fifty || !mobile ? h('span', {}, String(y)) : null),
      );
    }
    axis.append(h('div.d-line', { style: `left:${axisX}px;top:${top}px;height:${scale.y(NOW) - top}px` }));

    // Lives: bars beside the axis.
    const people = cards.filter((c) => c.kind === 'person' && c.years.length > 1);
    const laneOf = lanes(people, (c) => [scale.y(span(c)[0]), scale.y(span(c)[1]) + (mobile ? 6 : 90)], maxLanes);
    for (const [c, lane] of laneOf) {
      const [a, b] = span(c);
      const y0 = scale.y(a);
      const y1 = scale.y(b);
      lifeLayer.append(
        h(
          'a.d-life',
          {
            href: `#focus=${c.id}`,
            'data-card': c.id,
            style: `top:${y0}px;height:${Math.max(8, y1 - y0)}px;left:${livesX + lane * laneW}px;--era:${eraColor(c.era)}`,
            'aria-label': `${c.title}, ${a}–${b}`,
          },
          mobile ? null : h('span', {}, c.title),
        ),
      );
    }

    // Genres: a branching tree from their roots.
    if (treeW) svgHost.append(this.genreTree(cards, cardIndex, scale, treeX, treeW, end));

    // Place items, with a thread from the year on the axis to each card.
    const threads: string[] = [];
    for (const p of placed) {
      const el = els.get(`${p.item.kind}:${p.item.id}`)!;
      const x = p.col < 0 ? cardsX : cardsX + p.col * (colW + colGap);
      el.style.top = `${p.top}px`;
      el.style.left = `${x}px`;
      items.append(el);
      if (p.item.kind === 'card') threads.push(this.thread(p, axisX, x, mobile));
    }
    svgHost.insertAdjacentHTML(
      'afterbegin',
      `<svg class="d-threads" width="${W}" height="${end}" viewBox="0 0 ${W} ${end}" aria-hidden="true">${threads.join('')}</svg>`,
    );

    this.reveal();
    this.built = true;
    if (keepYear) this.goTo(keepYear);
  }

  private thread(p: Placed, axisX: number, x: number, mobile: boolean): string {
    const c = this.app.set.get(p.item.id);
    const y0 = p.anchor;
    const y1 = p.top + 28;
    const color = eraColor(c?.era);
    const mid = mobile ? x - 4 : x - 40;
    return `<path d="M${axisX},${y0.toFixed(1)} C${mid},${y0.toFixed(1)} ${mid},${y1.toFixed(1)} ${x},${y1.toFixed(1)}" style="stroke:${color}"/><circle cx="${axisX}" cy="${y0.toFixed(1)}" r="3" style="fill:${color}"/>`;
  }

  private genreTree(cards: Card[], index: Map<string, Card>, scale: Scale, x0: number, w: number, height: number): Element {
    const genres = cards.filter((c) => c.kind === 'genre');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'd-tree');
    svg.setAttribute('width', String(x0 + w + 10));
    svg.setAttribute('height', String(height));
    svg.setAttribute('aria-hidden', 'true');
    const pos = new Map<string, [number, number]>();
    const slots = 4;
    genres
      .sort((a, b) => span(a)[0] - span(b)[0])
      .forEach((g, i) => pos.set(g.id, [x0 + 10 + ((i * 7) % slots) * ((w - 20) / (slots - 1)), scale.y(span(g)[0])]));
    let paths = '';
    for (const g of genres) {
      const [gx, gy] = pos.get(g.id)!;
      for (const r of g.roots ?? []) {
        const from = pos.get(r) ?? (index.get(r) ? [x0 + 10, scale.y(span(index.get(r)!)[0])] : null);
        if (!from) continue;
        const [rx, ry] = from;
        const my = (ry + gy) / 2;
        paths += `<path class="branch" d="M${rx},${ry} C${rx},${my} ${gx},${my} ${gx},${gy}" style="stroke:${eraColor(g.era)}"/>`;
      }
    }
    let nodes = '';
    for (const g of genres) {
      const [gx, gy] = pos.get(g.id)!;
      const label = g.title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const left = gx > x0 + w * 0.5;
      nodes += `<g class="gnode" transform="translate(${gx},${gy})"><circle r="5" style="fill:${eraColor(g.era)}"/><text x="${left ? -9 : 9}" y="4"${left ? ' text-anchor="end"' : ''}>${label}</text></g>`;
    }
    svg.innerHTML = paths + nodes;
    return svg;
  }

  private cardEl(c: Card, w: number): HTMLElement {
    const img = c.media?.find((m) => m.type === 'image');
    const [a] = span(c);
    return h(
      `a.dc${img ? '' : '.noimg'}${c.zoom <= 2 ? '.big' : ''}`,
      { href: `#focus=${c.id}`, 'data-card': c.id, style: `width:${w}px;--era:${eraColor(c.era)}` },
      img ? h('div.ph', {}, h('img', { src: this.app.media(img.file), alt: '', loading: 'lazy', decoding: 'async' })) : null,
      h(
        'div.tx',
        {},
        h('small', {}, h('b', {}, String(a)), h('i.pl', {}, c.places[0].name), bookMarks(c.books)),
        h('strong', {}, c.title),
        h('span.w', {}, c.wow),
        c.years.length > 1 && c.years[1] !== a ? h('em', {}, formatYears(c.years)) : null,
      ),
    );
  }

  private reveal(): void {
    const els = this.track.querySelectorAll('.dc, .d-chapter, .d-move, .d-quiet');
    if (reducedMotion() || !('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('seen'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('seen');
            io.unobserve(e.target);
          }
        }
      },
      { root: this.el, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((e) => io.observe(e));
  }

  /** For tests and screenshots: the year at the reading line. */
  get year(): number {
    return Math.round(this.yearNow());
  }
}

/** A fixed starfield as box-shadows: cheap, crisp, no canvas. */
function starfield(n: number): string {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = (rnd() * 100).toFixed(2);
    const y = (rnd() * 100).toFixed(2);
    const a = (0.25 + rnd() * 0.75).toFixed(2);
    const big = rnd() > 0.92 ? ' 0 1px' : '';
    out.push(`${x}vw ${y}vh${big} rgba(242,233,216,${a})`);
  }
  return out.join(',');
}
