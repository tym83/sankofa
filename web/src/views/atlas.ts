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
import { copyCount, pick, t } from '../lib/i18n';

export class Atlas {
  readonly el: HTMLElement;
  private map?: GeoMap;
  private timeline?: Timeline;
  private stage: HTMLElement;
  private timeHost: HTMLElement;
  private when: HTMLElement;
  private levels: HTMLButtonElement[] = [];
  private pathbar: HTMLElement;
  private list: HTMLElement;
  private term: HTMLElement;
  private p: Point = {};
  private level = 1;
  private pathIndex = 0;
  onChange?: (p: Point) => void;
  onClose?: () => void;

  constructor(private app: App) {
    this.when = h('div.when', { 'aria-live': 'polite' });
    this.term = h('div.term', { style: 'position:absolute;right:var(--gutter);top:calc(var(--nav-h) + 12px);z-index:4;max-width:min(560px,90vw)' }, h('code'));
    this.term.append(h('button', { onclick: async () => toast((await copyText(terminalCommand(this.point()))) ? t('Command copied') : t('Copy failed')) }, t('Copy')));
    const bar = h(
      'header.atlas-bar',
      {},
      h('h2', {}, t('Atlas')),
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
        h('span.label', {}, t('Open in terminal')),
      ),
      h('button.icon-btn', { 'aria-label': t('Close the atlas'), onclick: () => this.onClose?.() }, svgIcon('close')),
    );
    const ladder = h('div.levels', { role: 'group', 'aria-label': t('Zoom level') });
    LEVEL_NAMES.forEach((name, i) => {
      const b = h('button', { 'aria-pressed': 'false', onclick: () => this.setLevel(i + 1) }, h('b', {}, String(i + 1)), h('span', {}, name)) as HTMLButtonElement;
      this.levels.push(b);
      ladder.append(b);
    });
    ladder.append(h('div.hint', {}, t('Zoom changes what is told, not only the scale. Keys: + − arrows [ ]')));
    this.pathbar = h('div.pathbar', { role: 'group', 'aria-label': t('Reader path') });
    const legend = h(
      'div.legend',
      { 'aria-hidden': 'true' },
      ERAS.map((e) => h('span', { style: `--c:${eraColor(e.id)}` }, h('i'), `${e.id} ${e.label}`)),
      h(
        'span.legend-note',
        {},
        pick({
          en: 'Middle Passage: line width is the share of people embarked from each African region (SlaveVoyages estimates).',
          ru: 'Средний путь: толщина линии — доля людей, вывезенных из каждого региона Африки (оценки SlaveVoyages).',
        }),
      ),
    );
    this.stage = h('div.atlas-stage', {}, ladder, legend, this.pathbar);
    this.timeHost = h('div.atlas-time');
    this.list = h('div.atlas-list', { role: 'list' });
    this.el = h('section.atlas', { 'aria-label': t('Atlas'), role: 'region', tabindex: '-1' }, bar, this.stage, this.timeHost, this.list, this.term);
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
      maxLabels: () => (window.innerWidth < 720 ? 5 : 18),
      avoid: () => [[0, 0, window.innerWidth < 720 ? 210 : 250, window.innerWidth < 720 ? 52 : 330]],
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
      else if (this.level >= 2) {
        // Open where there is something to see, not on the open sea.
        const c = this.nearestContent() ?? [-28, 18];
        this.map!.flyTo(c[0], c[1], k, dur);
      } else this.map!.flyTo(-28, 18, k, dur);
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
    const target = this.level >= 2 ? this.nearestContent() : undefined;
    if (target) this.map?.flyTo(target[0], target[1], LEVEL_K[this.level - 1], 1100);
    else this.map?.setLevel(this.level);
    this.draw(false);
    this.emit();
  }

  /** At cities, people and documents, go to the nearest thing to look at, never an empty sea. */
  private nearestContent(): [number, number] | undefined {
    if (!this.map) return undefined;
    const [lon, lat] = this.map.center();
    const layers = atlasLayers(this.app.set, { level: this.level, from: this.p.from, to: this.p.to, edition: this.app.edition });
    const here = layers.visible.filter((c) => c.zoom >= Math.min(this.level, 4));
    const pool = here.length ? here : layers.visible;
    let best: [number, number] | undefined;
    let bestD = Infinity;
    for (const c of pool) {
      const p = c.places[0];
      const d = Math.hypot((p.lon - lon) * Math.cos((lat * Math.PI) / 180), p.lat - lat);
      if (d < bestD) {
        bestD = d;
        best = [p.lon, p.lat];
      }
    }
    return best;
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
    const when = this.p.from ? formatYears(this.p.to ? [this.p.from, this.p.to] : [this.p.from]) : t('1300 – today');
    this.when.textContent = `${when} · ${LEVEL_NAMES[this.level - 1]} · ${pick({ en: `${layers.points.filter((p) => !p.out).length} on the map`, ru: `на карте: ${layers.points.filter((p) => !p.out).length}` })} · ${copyCount(readerCards(this.app.set, this.app.edition).length, this.app.set.all().length)}`;
    this.renderPathbar(path);
    this.renderList(layers.points.filter((p) => !p.out).map((p) => this.app.set.get(p.id)).filter((c): c is Card => !!c));
  }

  /** On phones the timeline becomes a list under a small map: eras to filter, cards to open. */
  private renderList(visible: Card[]): void {
    if (window.innerWidth >= 720) return this.list.replaceChildren();
    const eras = this.eras();
    const chips = h(
      'div.atlas-eras',
      {},
      h('button.chip', { 'aria-pressed': String(!this.p.from), onclick: () => this.setTime() }, '1300 –'),
      eras.map((e) => h('button.chip', { 'aria-pressed': String(this.p.from === e.from && this.p.to === e.to), onclick: () => this.setTime(e.from, e.to) }, e.id)),
    );
    const items = [...visible].sort((a, b) => span(a)[0] - span(b)[0]).map((c) =>
      h('button.atlas-item', { role: 'listitem', onclick: () => this.focus(c.id), style: `--era:${eraColor(c.era)}` }, h('span.y', {}, formatYears(c.years)), h('b', {}, c.title), h('span.pl', {}, c.places[0].name)),
    );
    this.list.replaceChildren(chips, ...items);
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
      h('span', {}, t('A reader’s path ·') + ' ', h('b', {}, `${i + 1} / ${path.length}`)),
      h('button.icon-btn', { 'aria-label': t('Previous card in the path'), onclick: () => go(this.pathIndex - 1), disabled: i === 0 }, svgIcon('prev')),
      h('button.icon-btn', { 'aria-label': t('Next card in the path'), onclick: () => go(this.pathIndex + (this.p.focus ? 1 : 0)), disabled: i >= path.length - 1 && !!this.p.focus }, svgIcon('next')),
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
