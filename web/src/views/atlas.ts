// The atlas explorer: the map, the zoom ladder and the timeline, all driven by
// one atlas point (pkg/atlas.Point) so every view is a link.
import type { App } from '../app';
import type { Point } from '../lib/fragment';
import { terminalCommand } from '../lib/fragment';
import { copyText, h, svgIcon, toast } from '../lib/dom';
import { atlasLayers, eraColor, readerCards } from '../lib/atlasModel';
import { formatYears, span } from '../lib/cards';
import { ERAS, type Card } from '../lib/types';
import { GeoMap, LEVEL_K, LEVEL_NAMES } from './map';
import { Timeline } from './timeline';
import { showTip, hideTip } from './tip';

export class Atlas {
  readonly el: HTMLElement;
  private map?: GeoMap;
  private timeline?: Timeline;
  private stage: HTMLElement;
  private timeHost: HTMLElement;
  private when: HTMLElement;
  private levels: HTMLButtonElement[] = [];
  private pathbar: HTMLElement;
  private term: HTMLElement;
  private p: Point = {};
  private level = 1;
  private pathIndex = 0;
  onChange?: (p: Point) => void;
  onClose?: () => void;

  constructor(private app: App) {
    this.when = h('div.when', { 'aria-live': 'polite' });
    this.term = h('div.term', { style: 'position:absolute;right:var(--gutter);top:calc(var(--nav-h) + 12px);z-index:4;max-width:min(560px,90vw)' }, h('code'));
    this.term.append(h('button', { onclick: async () => toast((await copyText(terminalCommand(this.point()))) ? 'Command copied' : 'Copy failed') }, 'Copy'));
    const bar = h(
      'header.atlas-bar',
      {},
      h('h2', {}, 'Atlas'),
      this.when,
      h('div.sp'),
      h(
        'button.btn',
        {
          onclick: () => {
            this.term.querySelector('code')!.textContent = terminalCommand(this.point());
            this.term.classList.toggle('on');
          },
        },
        svgIcon('term'),
        h('span.label', {}, 'Open in terminal'),
      ),
      h('button.icon-btn', { 'aria-label': 'Close the atlas', onclick: () => this.onClose?.() }, svgIcon('close')),
    );
    const ladder = h('div.levels', { role: 'group', 'aria-label': 'Zoom level' });
    LEVEL_NAMES.forEach((name, i) => {
      const b = h('button', { 'aria-pressed': 'false', onclick: () => this.setLevel(i + 1) }, h('b', {}, String(i + 1)), h('span', {}, name)) as HTMLButtonElement;
      this.levels.push(b);
      ladder.append(b);
    });
    ladder.append(h('div.hint', {}, 'Zoom changes what is told, not only the scale. Keys: + − arrows [ ]'));
    this.pathbar = h('div.pathbar', { role: 'group', 'aria-label': 'Reader path' });
    const legend = h(
      'div.legend',
      { 'aria-hidden': 'true' },
      ERAS.map((e) => h('span', { style: `--c:${eraColor(e.id)}` }, h('i'), `${e.id} ${e.label}`)),
    );
    this.stage = h('div.atlas-stage', {}, ladder, legend, this.pathbar);
    this.timeHost = h('div.atlas-time');
    this.el = h('section.atlas', { 'aria-label': 'Atlas', role: 'region', tabindex: '-1' }, bar, this.stage, this.timeHost, this.term);
    this.el.addEventListener('keydown', (e) => this.key(e));
    document.body.append(this.el);
  }

  get isOpen(): boolean {
    return this.el.classList.contains('open');
  }

  private ensure(): void {
    if (this.map) return;
    this.map = new GeoMap(this.stage, {
      interactive: true,
      detail: 'high',
      onPoint: (id) => this.focus(id),
      onRegion: (r) => this.map!.flyTo(r.lon, r.lat, LEVEL_K[2], 1200),
      onLevel: (lvl) => {
        this.level = lvl;
        this.draw(false);
        this.emit();
      },
      onHover: (id, ev) => this.hover(id, ev),
    });
    this.stage.prepend(this.map.svg.node()!);
    const cards = readerCards(this.app.set, this.app.edition);
    this.timeline = new Timeline(this.timeHost, cards, this.eras(), {
      compact: true,
      brush: true,
      onSelect: (id) => this.focus(id),
      onBrush: (from, to) => {
        this.p = { ...this.p, from, to };
        this.draw(false);
        this.emit();
      },
      onEra: (id) => {
        const e = this.eras().find((x) => x.id === id)!;
        this.setTime(e.from, e.to);
      },
      onHover: (id, ev) => this.hover(id, ev),
    });
  }

  private eras() {
    return ERAS.map((e) => {
      const ch = this.app.chapters.find((c) => c.id === e.id);
      return ch?.years.length ? { ...e, from: ch.years[0], to: ch.years[1] ?? ch.years[0] } : e;
    });
  }

  open(p: Point): void {
    this.ensure();
    const first = !this.isOpen;
    this.el.classList.add('open');
    document.body.classList.add('locked', 'atlas-open');
    if (first) this.el.focus({ preventScroll: true });
    this.apply(p, first);
  }

  close(): void {
    this.el.classList.remove('open');
    document.body.classList.remove('locked', 'atlas-open');
    this.term.classList.remove('on');
    hideTip();
  }

  /** Apply a point from a link. */
  apply(p: Point, fly = true): void {
    this.p = { ...p };
    const focusCard = p.focus ? this.app.set.get(p.focus) : undefined;
    const place = p.place ? this.app.set.resolvePlace(p.place) : undefined;
    this.level = p.zoom ?? (p.path?.length ? 3 : undefined) ?? focusCard?.zoom ?? (place ? 3 : 1);
    this.timeline!.setRange(p.from, p.to);
    if (p.from) this.timeline!.reveal(p.from);
    this.timeline!.setFocus(p.focus);
    if (p.path?.length) {
      const i = p.focus ? p.path.indexOf(p.focus) : 0;
      this.pathIndex = Math.max(0, i);
    }
    this.draw(true);
    const k = LEVEL_K[this.level - 1];
    this.map!.ready.then(() => {
      const dur = fly ? 1800 : 1200;
      this.map!.inset = focusCard && window.innerWidth > 900 ? 560 : 0;
      if (place && !focusCard) this.map!.flyTo(place.lon, place.lat, k, dur);
      else if (focusCard) this.map!.flyTo(focusCard.places[0].lon, focusCard.places[0].lat, k, dur);
      else if (p.path?.length) this.map!.fit(this.pathCards().map((c) => [c.places[0].lon, c.places[0].lat]), LEVEL_K[3], dur);
      else this.map!.flyTo(-28, 18, k, dur);
    });
  }

  point(): Point {
    return { ...this.p, zoom: this.level };
  }

  private emit(): void {
    this.onChange?.(this.point());
  }

  private pathCards(): Card[] {
    return (this.p.path ?? []).map((id) => this.app.set.get(id)).filter(Boolean) as Card[];
  }

  focus(id: string): void {
    const c = this.app.set.get(id);
    if (!c) return;
    this.p = { ...this.p, focus: id };
    if (this.p.path) {
      const i = this.p.path.indexOf(id);
      if (i >= 0) this.pathIndex = i;
    }
    this.timeline?.setFocus(id);
    this.draw(false);
    const k = Math.max(LEVEL_K[this.level - 1], LEVEL_K[Math.min(c.zoom, 4) - 1]);
    if (this.map) this.map.inset = window.innerWidth > 900 ? Math.min(560, window.innerWidth) : 0;
    this.map?.flyTo(c.places[0].lon, c.places[0].lat, k, 1300);
    this.emit();
    this.app.openCard(id, { exact: !!this.p.path?.includes(id), push: false });
  }

  unfocus(): void {
    if (!this.p.focus) return;
    this.p = { ...this.p, focus: undefined };
    this.timeline?.setFocus(undefined);
    this.draw(false);
    this.emit();
  }

  private setLevel(lvl: number): void {
    this.level = Math.max(1, Math.min(5, lvl));
    this.map?.setLevel(this.level);
    this.draw(false);
    this.emit();
  }

  private setTime(from?: number, to?: number): void {
    this.p = { ...this.p, from, to };
    this.timeline?.setRange(from, to);
    this.draw(false);
    this.emit();
  }

  private draw(animate: boolean): void {
    if (!this.map) return;
    const path = this.pathCards();
    const layers = atlasLayers(
      this.app.set,
      { level: this.level, from: this.p.from, to: this.p.to, focus: this.p.focus, edition: this.app.edition, lit: path.map((c) => c.id) },
      path,
    );
    if (path.length > 1) {
      layers.routes.push({
        id: 'path',
        color: 'var(--ink)',
        flow: true,
        legs: path.slice(1).map((c, i) => ({
          from: [path[i].places[0].lon, path[i].places[0].lat],
          to: [c.places[0].lon, c.places[0].lat],
        })),
      });
    }
    this.map.setPoints(layers.points);
    this.map.setRoutes(layers.routes, animate || this.level <= 2);
    this.map.setRegions(layers.regions);
    this.map.setNumbers(path.map((c, i) => ({ n: i + 1, lon: c.places[0].lon, lat: c.places[0].lat })));
    this.levels.forEach((b, i) => {
      b.classList.toggle('on', i + 1 === this.level);
      b.setAttribute('aria-pressed', String(i + 1 === this.level));
    });
    const t = this.p.from ? formatYears(this.p.to ? [this.p.from, this.p.to] : [this.p.from]) : '1300 – today';
    this.when.textContent = `${t} · ${LEVEL_NAMES[this.level - 1]} · ${layers.visible.length} cards`;
    this.renderPathbar(path);
  }

  private renderPathbar(path: Card[]): void {
    this.pathbar.classList.toggle('on', path.length > 0);
    if (!path.length) return;
    const i = this.pathIndex;
    const go = (j: number) => {
      const c = path[Math.max(0, Math.min(path.length - 1, j))];
      this.focus(c.id);
    };
    this.pathbar.replaceChildren(
      h('span', {}, 'A reader’s path · ', h('b', {}, `${i + 1} / ${path.length}`)),
      h('button.icon-btn', { 'aria-label': 'Previous card in the path', onclick: () => go(this.pathIndex - 1), disabled: i === 0 }, svgIcon('prev')),
      h('button.icon-btn', { 'aria-label': 'Next card in the path', onclick: () => go(this.pathIndex + (this.p.focus ? 1 : 0)), disabled: i >= path.length - 1 && !!this.p.focus }, svgIcon('next')),
    );
  }

  private hover(id: string | null, ev?: MouseEvent): void {
    if (!id || !ev) return hideTip();
    const c = this.app.set.get(id);
    if (!c) return hideTip();
    const [a, b] = span(c);
    showTip(ev, `${c.places[0].name} · ${a === b ? a : `${a}–${b}`}`, c.title, c.wow);
  }

  private key(e: KeyboardEvent): void {
    if (!this.map || (e.target as HTMLElement).closest('.drawer')) return;
    const step = 90;
    const width = this.p.from ? Math.max(10, (this.p.to ?? this.p.from) - this.p.from) : 25;
    switch (e.key) {
      case 'ArrowLeft':
        this.map.pan(step, 0);
        break;
      case 'ArrowRight':
        this.map.pan(-step, 0);
        break;
      case 'ArrowUp':
        this.map.pan(0, step);
        break;
      case 'ArrowDown':
        this.map.pan(0, -step);
        break;
      case '+':
      case '=':
        this.setLevel(this.level + 1);
        break;
      case '-':
      case '_':
        this.setLevel(this.level - 1);
        break;
      case '[':
        this.setTime((this.p.from ?? 1850) - width, (this.p.to ?? this.p.from ?? 1850) - width);
        break;
      case ']':
        this.setTime((this.p.from ?? 1850) + width, (this.p.to ?? this.p.from ?? 1850) + width);
        break;
      case 'Escape':
        this.onClose?.();
        break;
      default:
        return;
    }
    e.preventDefault();
  }
}
