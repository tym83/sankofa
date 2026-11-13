// The music map: one large graph of every artist and link, growing upward
// out of the glowing traditions at the bottom. Hover or tap an artist to
// light its way down to the roots; a root, to light everything that grew
// from it.
import type { App } from '../app';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import 'd3-transition';
import { h, reducedMotion, svgIcon } from '../lib/dom';
import { count, lang, pick, t } from '../lib/i18n';
import { buildGraph, grewFrom, headline, layout, radius, reach, yearY, type GEdge, type GNode, type Graph, type MapCard } from '../lib/rootsMap';
import { nbsp } from '../lib/typo';
import { placeName, KIND_LABEL, searchArtists, type Artist, type LinkKind } from '../lib/roots';

const NS = 'http://www.w3.org/2000/svg';
const KINDS: (LinkKind | 'lineage')[] = ['influence', 'cover', 'sample', 'interpolation', 'member', 'producer', 'collaboration', 'scene', 'teacher', 'lineage'];

export class RootsMap {
  readonly el: HTMLElement;
  private svg: SVGSVGElement;
  private gAll: SVGGElement;
  private stage: HTMLElement;
  private info: HTMLElement;
  private input: HTMLInputElement;
  private results: HTMLElement;
  private g?: Graph;
  private t: ZoomTransform = zoomIdentity;
  private zoomer = d3zoom<SVGSVGElement, unknown>();
  private nodeEls = new Map<string, SVGGElement>();
  private edgeEls: { e: GEdge; el: SVGPathElement }[] = [];
  private pinned?: string;
  private built = false;
  private phone = false;
  private early = 0.28;
  onClose?: () => void;

  constructor(
    private app: App,
    private artists: Artist[],
  ) {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'rm-svg');
    this.svg.setAttribute('role', 'img');
    this.gAll = document.createElementNS(NS, 'g');
    this.svg.append(this.gAll);
    this.stage = h('div.rm-stage', {}, this.svg);
    this.info = h('aside.rm-info', { 'aria-live': 'polite' });
    this.input = h('input.rm-input', { type: 'search', placeholder: pick({ en: 'Find a band or an artist…', ru: 'Найти группу или исполнителя…' }), 'aria-label': pick({ en: 'Find on the map', ru: 'Найти на карте' }) }) as HTMLInputElement;
    this.results = h('ul.rm-results');
    this.input.addEventListener('input', () => this.search());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = this.results.querySelector<HTMLElement>('li');
        if (first) this.focusOn(first.dataset.id!);
      }
    });
    const legendList = h(
      'ul.rm-legend',
      { 'aria-label': pick({ en: 'Kinds of links', ru: 'Виды связей' }) },
      KINDS.map((k) =>
        h(
          'li',
          { style: `--kc:var(--k-${k === 'lineage' ? 'lineage' : k})` },
          h('i'),
          k === 'lineage' ? pick({ en: 'genre grew out of', ru: 'жанр вырос из' }) : pick(KIND_LABEL[k]),
        ),
      ),
    );
    // On phones the key folds away behind one line; on wide screens it stays open.
    const legend = h('details.rm-key', { open: window.innerWidth >= 760 ? '' : undefined }, h('summary', {}, pick({ en: 'Colours of the links', ru: 'Цвета связей' })), legendList);
    const bar = h('header.d-bar', {}, h('span.d-title', {}, pick({ en: 'The music map', ru: 'Карта музыки' })), h('button.icon-btn', { 'aria-label': t('Close'), onclick: () => this.onClose?.() }, svgIcon('close')));
    this.head = h(
      'div.rm-head',
      {},
      h('div.kicker', {}, t('Roots')),
      h('h2', {}),
      h('div.rm-search', {}, this.input, this.results),
      h('p.rm-hint-line', {}, pick({ en: 'Tap an artist to light its way to the roots. Later artists are further up ↑', ru: 'Коснитесь исполнителя — загорится его путь к корням. Выше — более поздние исполнители ↑' })),
    );
    this.el = h('section.rmap', { 'aria-label': pick({ en: 'The music map', ru: 'Карта музыки' }), tabindex: '-1' }, bar, this.head, this.stage, legend, this.info);
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.onClose?.();
    });
    document.body.append(this.el);
  }

  private head: HTMLElement;

  get isOpen(): boolean {
    return this.el.classList.contains('open');
  }

  open(): void {
    this.el.classList.add('open');
    document.body.classList.add('locked');
    if (!this.built) requestAnimationFrame(() => this.build());
  }

  close(): void {
    this.el.classList.remove('open');
    document.body.classList.remove('locked');
  }

  private nameOf(a: Artist): string {
    return lang() === 'ru' && a.nameRu ? a.nameRu : a.name;
  }

  private build(): void {
    this.built = true;
    const cards = new Map<string, MapCard>(this.app.set.all().map((c) => [c.id, { id: c.id, title: c.title, years: c.years, roots: c.roots }]));
    const g = (this.g = buildGraph(this.artists, cards, (a) => this.nameOf(a)));
    this.phone = window.innerWidth < 760;
    const W = this.stage.clientWidth || window.innerWidth;
    const years = [Math.min(...g.nodes.map((n) => n.year)) - 10, Math.min(new Date().getFullYear(), Math.max(...g.nodes.map((n) => n.year)) + 6)] as [number, number];
    // Phones: a map under two screens tall, the empty 1800s squeezed, so the
    // first screen holds the roots and the artists who grew straight from them.
    const H = this.phone ? Math.max(1000, (this.stage.clientHeight || window.innerHeight * 0.7) * 1.7) : Math.max(this.stage.clientHeight, 700) * 1.25;
    this.early = this.phone ? 0.14 : 0.28;
    layout(g, W, H, years, this.early);
    this.svg.setAttribute('viewBox', `0 0 ${W} ${this.phone ? H : this.stage.clientHeight || H}`);
    // On phones keep labels clear of both edges.
    if (this.phone) {
      this.svg.setAttribute('height', String(H));
      this.svg.setAttribute('width', String(W));
    }
    this.draw(W, H, years);
    // Headline: computed from the data.
    const hl = headline(g);
    const rc = hl.root ? this.app.set.get(hl.root.id.slice(5)) : undefined;
    const rootInline = rc?.inline || (hl.root ? (lang() === 'ru' ? `«${hl.root.label}»` : hl.root.label.charAt(0).toLowerCase() + hl.root.label.slice(1)) : '');
    // Set explicitly: the heading is written before the page-wide typesetter starts.
    this.head.querySelector('h2')!.textContent = nbsp(hl.root
      ? pick({
          en:
            hl.count === hl.total
              ? `All ${hl.total} artists lead back to ${rootInline}`
              : `Of ${count(hl.total, 'artist', 'en')}, ${hl.count} lead back to ${rootInline}`,
          ru:
            hl.count === hl.total
              ? `Все ${count(hl.total, 'artist', 'ru')} ${pluralLead(hl.total)} к одному корню: ${rootInline}`
              : `Из ${count(hl.total, 'artistOf', 'ru')} ${hl.count} ${pluralLead(hl.count)} к одному корню: ${rootInline}`,
        })
      : pick({ en: 'Every chain on one map', ru: 'Все цепочки на одной карте' }), lang());
    if (!this.phone) {
      this.zoomer
        .scaleExtent([0.4, 6])
        // The wheel scrolls the page; zoom needs ctrl (or a pinch, which browsers send as ctrl+wheel).
        .filter((ev: Event) => (ev.type === 'wheel' ? (ev as WheelEvent).ctrlKey : !(ev as MouseEvent).button))
        .on('zoom', (ev) => {
          this.t = ev.transform;
          this.gAll.setAttribute('transform', this.t.toString());
        })
        .on('end', () => this.placeLabels());
      select(this.svg).call(this.zoomer);
      // Fit the whole graph, labels included, into the view.
      const vw = this.stage.clientWidth;
      const vh = this.stage.clientHeight;
      const xs = g.nodes.map((n) => n.x!);
      const ys = g.nodes.map((n) => n.y!);
      const pad = 110;
      const [x0, x1] = [Math.min(...xs) - pad, Math.max(...xs) + pad];
      const [y0, y1] = [Math.min(...ys) - 70, Math.max(...ys) + 40];
      const k = Math.min(1.4, vw / (x1 - x0), vh / (y1 - y0));
      select(this.svg).call(this.zoomer.transform, zoomIdentity.translate((vw - (x1 - x0) * k) / 2 - x0 * k, (vh - (y1 - y0) * k) / 2 - y0 * k).scale(k));
    }
    this.placeLabels();
    this.showInfo();
    // Phones open on the roots at the bottom, with the artists above them; the
    // line under the search says that later artists are further up.
    if (this.phone) {
      const deepest = Math.max(...g.nodes.map((n) => n.y!));
      requestAnimationFrame(() => {
        this.stage.scrollTop = Math.max(0, deepest + 90 - this.stage.clientHeight);
        this.placeLabels();
      });
    }
  }

  private draw(W: number, H: number, years: [number, number]): void {
    const g = this.g!;
    this.gAll.innerHTML = '';
    // Time axis.
    const axis = document.createElementNS(NS, 'g');
    axis.setAttribute('class', 'rm-axis');
    for (let y = Math.ceil(years[0] / 50) * 50; y <= years[1]; y += y < 1900 ? 50 : 25) {
      const py = yearY(y, H, years, this.early);
      axis.innerHTML += `<line x1="0" x2="${W}" y1="${py}" y2="${py}"/><text x="8" y="${py - 4}">${y}</text>`;
    }
    // A glow under the roots.
    const glow = document.createElementNS(NS, 'g');
    glow.innerHTML = `<defs><radialGradient id="rm-glow"><stop offset="0" stop-color="#e3ab3d" stop-opacity="0.55"/><stop offset="1" stop-color="#e3ab3d" stop-opacity="0"/></radialGradient></defs>`;
    const gEdges = document.createElementNS(NS, 'g');
    gEdges.setAttribute('class', 'rm-edges');
    const gNodes = document.createElementNS(NS, 'g');
    gNodes.setAttribute('class', 'rm-nodes');
    this.gAll.append(axis, glow, gEdges, gNodes);
    this.edgeEls = [];
    for (const e of g.edges) {
      const a = g.byId.get(e.from)!;
      const b = g.byId.get(e.to)!;
      const p = document.createElementNS(NS, 'path');
      const my = (a.y! + b.y!) / 2;
      p.setAttribute('d', `M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`);
      p.setAttribute('class', `rm-edge k-${e.kind}`);
      gEdges.append(p);
      this.edgeEls.push({ e, el: p });
    }
    for (const n of [...g.nodes].sort((x, y) => Number(x.card) - Number(y.card))) {
      const el = document.createElementNS(NS, 'g');
      el.setAttribute('class', `rm-node${n.card ? ' card' : ''}`);
      el.setAttribute('transform', `translate(${n.x},${n.y})`);
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${n.label}, ${n.year}`);
      const r = radius(n);
      el.innerHTML = `${n.card ? `<circle class="halo" r="${r * 3.2}" fill="url(#rm-glow)"/>` : ''}<circle class="dot" r="${r}"/><text class="lbl" y="${-r - 5}" text-anchor="middle"></text>`;
      el.querySelector('text')!.textContent = n.label;
      el.addEventListener('mouseenter', () => !this.pinned && this.light(n.id));
      el.addEventListener('mouseleave', () => !this.pinned && this.light());
      el.addEventListener('focus', () => this.light(n.id));
      el.addEventListener('click', () => {
        this.pinned = this.pinned === n.id ? undefined : n.id;
        this.light(this.pinned);
      });
      gNodes.append(el);
      this.nodeEls.set(n.id, el);
    }
  }

  /** Light a node's whole way down (an artist) or everything that grew from it (a root). */
  private light(id?: string): void {
    const g = this.g!;
    this.el.classList.toggle('lit', !!id);
    if (!id) {
      this.nodeEls.forEach((el) => el.classList.remove('on'));
      this.edgeEls.forEach(({ el }) => el.classList.remove('on'));
      this.showInfo();
      return;
    }
    const n = g.byId.get(id)!;
    const set = n.card ? grewFrom(g, id) : reach(g, id);
    this.nodeEls.forEach((el, k) => el.classList.toggle('on', set.has(k)));
    this.edgeEls.forEach(({ e, el }) => el.classList.toggle('on', set.has(e.from) && set.has(e.to)));
    this.showInfo(n, set);
    this.placeLabels(set);
  }

  private showInfo(n?: GNode, set?: Set<string>): void {
    this.info.classList.toggle('idle', !n);
    if (!n) {
      this.info.replaceChildren(
        h('p.rm-hint', {}, pick({ en: 'Tap an artist to light its way to the roots; a glowing root, to see all that grew from it.', ru: 'Коснитесь исполнителя — загорится его путь к корням; светящегося корня — всё, что из него выросло.' })),
      );
      return;
    }
    if (n.card) {
      const artists = [...set!].filter((k) => !this.g!.byId.get(k)!.card).length;
      this.info.replaceChildren(
        h('small', {}, pick({ en: 'A root in the museum', ru: 'Корень в музее' })),
        h('b', {}, n.label),
        h('p', {}, pick({ en: `${count(artists, 'artist', 'en')} grew out of it.`, ru: `Из него выросло: ${count(artists, 'artist', 'ru')}.` })),
        h('a.btn', { href: `#focus=${n.id.slice(5)}`, 'data-card': n.id.slice(5) }, pick({ en: 'Open the card →', ru: 'Открыть карточку →' })),
      );
      return;
    }
    const a = this.artists.find((x) => x.id === n.id)!;
    const story = (lang() === 'ru' && a.storyRu) || a.story;
    this.info.replaceChildren(
      h('small', {}, `${a.years[0]} · ${placeName(a, lang())}`),
      h('b', {}, this.nameOf(a)),
      ...(story ? [h('p', {}, story)] : []),
      h('a.btn', { href: `#view=roots&artist=${a.id}`, 'data-artist-roots': a.id }, pick({ en: 'Follow the chain →', ru: 'Пройти по цепочке →' })),
    );
  }

  /** Labels by importance; none overlap. While something is lit, its labels come first. */
  private placeLabels(priority?: Set<string>): void {
    const g = this.g;
    if (!g) return;
    const k = this.phone ? 1 : this.t.k;
    if (!this.phone) this.gAll.style.setProperty('--lk', String(1 / Math.max(0.5, k)));
    const order = [...g.nodes].sort((a, b) => Number(priority?.has(b.id) ?? 0) - Number(priority?.has(a.id) ?? 0) || Number(b.card) - Number(a.card) || b.support - a.support);
    const budget = this.phone ? 70 : Math.round(46 * Math.max(1, k));
    // On a phone with nothing lit, name only the roots and the six best-known
    // artists on screen; tapping lights and names a whole chain.
    const view = this.stage.getBoundingClientRect();
    const onScreen = (n: GNode) => {
      const r = this.nodeEls.get(n.id)!.getBoundingClientRect();
      return r.top >= view.top && r.bottom <= view.bottom;
    };
    const famous = this.phone && !priority ? new Set(order.filter((n) => !n.card && onScreen(n)).slice(0, 6).map((n) => n.id)) : undefined;
    // Show every candidate, measure where it really lands, keep those that fit.
    const lbls = order.map((n) => ({ n, el: this.nodeEls.get(n.id)!.querySelector('text') as SVGTextElement }));
    lbls.forEach(({ el }) => el.classList.remove('hide'));
    const rects = lbls.map(({ el }) => el.getBoundingClientRect());
    const boxes: DOMRect[] = [];
    let shown = 0;
    const hits = (r: DOMRect) => boxes.some((b) => r.left < b.right + 3 && r.right > b.left - 3 && r.top < b.bottom + 1 && r.bottom > b.top - 1);
    lbls.forEach(({ n, el }, i) => {
      let r = rects[i];
      const want = priority ? priority.has(n.id) || n.card : famous ? famous.has(n.id) || n.card : true;
      // Every root keeps its name: above its dot, or below it if that is taken.
      if (n.card) {
        const rr = radius(n);
        // above, below, right, left: the first place that is free
        const spots: [number, number, string][] = [[0, -rr - 5, 'middle'], [0, rr + 16, 'middle'], [rr + 6, 4, 'start'], [-rr - 6, 4, 'end']];
        for (const [x, y, anchor] of spots) {
          el.setAttribute('x', String(x));
          el.setAttribute('y', String(y));
          el.setAttribute('text-anchor', anchor);
          r = el.getBoundingClientRect();
          if (!hits(r)) break;
        }
      }
      const free = n.card || !hits(r);
      const ok = want && free && shown < budget && r.width > 0;
      el.classList.toggle('hide', !ok);
      if (ok) {
        boxes.push(r);
        shown++;
      }
    });
  }

  private search(): void {
    const found = searchArtists(this.artists, this.input.value, 6);
    this.results.replaceChildren(...found.map((a) => h('li', { 'data-id': a.id, onmousedown: (e: Event) => (e.preventDefault(), this.focusOn(a.id)) }, this.nameOf(a))));
  }

  /** Fly to an artist and light its way down. */
  focusOn(id: string): void {
    const n = this.g?.byId.get(id);
    if (!n) return;
    this.input.value = '';
    this.results.replaceChildren();
    this.pinned = id;
    this.light(id);
    if (this.phone) {
      this.stage.scrollTo({ top: n.y! - this.stage.clientHeight / 3, behavior: reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    // Fit the whole way down to the roots, clear of the info plate.
    const set = reach(this.g!, id);
    const pts = [...set].map((k) => this.g!.byId.get(k)!);
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    const plate = this.info.getBoundingClientRect();
    const usableW = W - (W > 900 ? Math.min(plate.width + 40, W * 0.4) : 0);
    const xs = pts.map((p) => p.x!);
    const ys = pts.map((p) => p.y!);
    const pad = 90;
    const [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - 50, Math.max(...ys) + 50];
    const k = Math.max(0.5, Math.min(3, usableW / (x1 - x0), H / (y1 - y0)));
    select(this.svg)
      .transition()
      .duration(reducedMotion() ? 0 : 1200)
      .call(this.zoomer.transform as never, zoomIdentity.translate((usableW - (x1 - x0) * k) / 2 - x0 * k, (H - (y1 - y0) * k) / 2 - y0 * k).scale(k));
  }
}

function pluralLead(n: number): string {
  const a = n % 100;
  const b = n % 10;
  return a > 10 && a < 20 ? 'ведут' : b === 1 ? 'ведёт' : 'ведут';
}
