// The Atlantic, drawn with d3-geo from Natural Earth (public domain) via the
// world-atlas TopoJSON package. Land is projected once and scaled by d3-zoom;
// points, arcs and labels are recomputed in screen space so they stay crisp.
import { geoGraticule10, geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import { select, type Selection } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { easeCubicInOut } from 'd3-ease';
import { timer } from 'd3-timer';
import 'd3-transition';
import { feature, mesh } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import land110Url from 'world-atlas/land-110m.json?url';
import land50Url from 'world-atlas/land-50m.json?url';
import countries110Url from 'world-atlas/countries-110m.json?url';
import countries50Url from 'world-atlas/countries-50m.json?url';
import { reducedMotion } from '../lib/dom';
import type { Leg } from '../lib/movements';
import { count, t } from '../lib/i18n';

export const LEVEL_K = [1, 2.2, 4.6, 9, 18];
export const LEVEL_NAMES = ['Centuries', 'Regions', 'Cities and genres', 'People', 'One document'];

export function levelOf(k: number): number {
  let lvl = 1;
  LEVEL_K.forEach((t, i) => {
    if (k >= t * 0.9) lvl = i + 1;
  });
  return lvl;
}

export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  label: string;
  title?: boolean;
  color: string;
  minor?: boolean;
  lit?: boolean;
  out?: boolean;
  focus?: boolean;
  priority: number;
  aria?: string;
}

export interface MapRoute {
  id: string;
  legs: Leg[];
  color: string;
  faint?: boolean;
  flow?: boolean;
  label?: { text: string; sub?: string; at: [number, number] };
  progress?: number;
}

export interface MapRegion {
  id: string;
  name: string;
  lon: number;
  lat: number;
  count: number;
  color: string;
}

export interface MapNumber {
  n: number;
  lon: number;
  lat: number;
}

interface Options {
  interactive?: boolean;
  detail?: 'low' | 'high';
  frame?: [[number, number], [number, number]]; // lon/lat corners of the home view
  onPoint?: (id: string) => void;
  onRegion?: (r: MapRegion) => void;
  onHover?: (id: string | null, ev?: MouseEvent) => void;
  onLevel?: (level: number) => void;
  onMoveEnd?: () => void;
  /** Screen rectangles labels must stay out of (the text column, say). */
  avoid?: () => [number, number, number, number][];
  /** At most this many labels at once. */
  maxLabels?: () => number;
}

const topoCache = new Map<string, Promise<Topology>>();
function loadTopo(url: string): Promise<Topology> {
  if (!topoCache.has(url)) topoCache.set(url, fetch(url).then((r) => r.json()));
  return topoCache.get(url)!;
}

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

export class GeoMap {
  readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  readonly ready: Promise<void>;
  private projection: GeoProjection;
  private zoomer: ZoomBehavior<SVGSVGElement, unknown>;
  private t: ZoomTransform = zoomIdentity;
  private w = 0;
  private h = 0;
  private gZoom: Selection<SVGGElement, unknown, null, undefined>;
  private gRoutes: Selection<SVGGElement, unknown, null, undefined>;
  private gRegions: Selection<SVGGElement, unknown, null, undefined>;
  private gPoints: Selection<SVGGElement, unknown, null, undefined>;
  private gNums: Selection<SVGGElement, unknown, null, undefined>;
  private points: MapPoint[] = [];
  private routes: MapRoute[] = [];
  private landGeo: unknown = null;
  private bordersGeo: unknown = null;
  private lastLevel = 0;
  private ro: ResizeObserver;
  private idPrefix = `m${++uid}`;
  /** Pixels on the right covered by a panel; flights centre in what is left. */
  inset = 0;
  private labelWidths = new Map<string, number>();
  private flight: [number, number, number, number] | null = null;

  constructor(
    private host: HTMLElement,
    private opts: Options = {},
  ) {
    this.svg = select(host).append('svg').attr('class', 'geo' + (opts.interactive ? ' interactive' : '')) as never;
    this.svg.attr('role', opts.interactive ? 'application' : 'img').attr('aria-label', t('Map of the Atlantic world'));
    if (!opts.interactive) this.svg.style('touch-action', 'auto');
    const defs = this.svg.append('defs');
    const halo = defs.append('radialGradient').attr('id', `${this.idPrefix}-halo`);
    halo.append('stop').attr('offset', '0%').style('stop-color', 'var(--gold)').style('stop-opacity', 0.55);
    halo.append('stop').attr('offset', '45%').style('stop-color', 'var(--gold)').style('stop-opacity', 0.16);
    halo.append('stop').attr('offset', '100%').style('stop-color', 'var(--gold)').style('stop-opacity', 0);
    const glow = defs.append('radialGradient').attr('id', `${this.idPrefix}-ocean`).attr('cx', '45%').attr('cy', '45%').attr('r', '70%');
    glow.append('stop').attr('offset', '0%').style('stop-color', 'var(--indigo)').style('stop-opacity', 0.14);
    glow.append('stop').attr('offset', '100%').style('stop-color', 'var(--indigo)').style('stop-opacity', 0);

    this.svg.append('rect').attr('class', 'ocean-glow').attr('width', '100%').attr('height', '100%').attr('fill', `url(#${this.idPrefix}-ocean)`);
    this.gZoom = this.svg.append('g');
    this.gRoutes = this.svg.append('g').attr('class', 'routes');
    this.gRegions = this.svg.append('g').attr('class', 'regions');
    this.gPoints = this.svg.append('g').attr('class', 'points');
    this.gNums = this.svg.append('g').attr('class', 'nums');

    this.projection = geoNaturalEarth1().rotate([30, 0]);
    this.zoomer = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.7, 60])
      .filter((ev: Event) => !!opts.interactive && (!('button' in ev) || (ev as MouseEvent).button === 0))
      .on('zoom', (ev) => {
        this.t = ev.transform;
        this.gZoom.attr('transform', this.t.toString());
        this.renderOverlay();
        const lvl = levelOf(this.t.k);
        if (lvl !== this.lastLevel) {
          this.lastLevel = lvl;
          opts.onLevel?.(lvl);
        }
      })
      .on('end', () => {
        this.placeLabels();
        opts.onMoveEnd?.();
      });
    if (opts.interactive) this.svg.call(this.zoomer).on('dblclick.zoom', null);

    this.measure();
    this.ro = new ResizeObserver(() => {
      const [w, h] = [this.host.clientWidth, this.host.clientHeight];
      if (w && h && (Math.abs(w - this.w) > 2 || Math.abs(h - this.h) > 2)) {
        const center = this.center();
        const k = this.t.k;
        this.measure();
        this.drawBase();
        if (this.flight) this.flyTo(...this.flight);
        else this.jump(center[0], center[1], k);
      }
    });
    this.ro.observe(host);

    this.ready = this.loadBase(opts.detail ?? 'low');
  }

  private async loadBase(detail: 'low' | 'high'): Promise<void> {
    const [land, countries] = await Promise.all([loadTopo(land110Url), loadTopo(countries110Url)]);
    this.landGeo = feature(land, land.objects.land as never);
    this.bordersGeo = mesh(countries, countries.objects.countries as never, (a, b) => a !== b);
    this.drawBase();
    if (detail === 'high') {
      // Sharper coasts for the explorer, loaded after the first paint.
      Promise.all([loadTopo(land50Url), loadTopo(countries50Url)]).then(([l, c]) => {
        this.landGeo = feature(l, l.objects.land as never);
        this.bordersGeo = mesh(c, c.objects.countries as never, (a, b) => a !== b);
        this.drawBase();
      });
    }
  }

  private measure(): void {
    this.w = this.host.clientWidth || window.innerWidth;
    this.h = this.host.clientHeight || window.innerHeight;
    this.svg.attr('viewBox', `0 0 ${this.w} ${this.h}`);
    const [[w0, s0], [e0, n0]] = this.opts.frame ?? [
      [-112, -36],
      [58, 62],
    ];
    const pad = Math.min(this.w, this.h) * 0.04;
    this.projection.fitExtent(
      [
        [pad, pad],
        [this.w - pad, this.h - pad],
      ],
      {
        type: 'MultiPoint',
        coordinates: [
          [w0, s0],
          [e0, n0],
          [w0, n0],
          [e0, s0],
          [(w0 + e0) / 2, n0],
          [(w0 + e0) / 2, s0],
        ],
      } as never,
    );
  }

  private drawBase(): void {
    if (!this.landGeo) return;
    const path = geoPath(this.projection);
    this.gZoom.selectAll('*').remove();
    this.gZoom.append('path').attr('class', 'graticule').attr('d', path(geoGraticule10()));
    this.gZoom.append('path').attr('class', 'land').attr('d', path(this.landGeo as never));
    this.gZoom.append('path').attr('class', 'borders').attr('d', path(this.bordersGeo as never));
    this.renderOverlay();
    this.placeLabels();
  }

  /** Screen position of a lon/lat. */
  xy(lon: number, lat: number): [number, number] {
    const p = this.projection([lon, lat]) ?? [0, 0];
    return this.t.apply(p);
  }

  center(): [number, number] {
    const inv = this.t.invert([this.w / 2, this.h / 2]);
    return (this.projection.invert?.(inv) as [number, number]) ?? [-20, 15];
  }

  level(): number {
    return levelOf(this.t.k);
  }

  private target(lon: number, lat: number, k: number): ZoomTransform {
    const [x, y] = this.projection([lon, lat]) ?? [this.w / 2, this.h / 2];
    // Keep the point a little right of centre on wide screens: text lives on the left.
    const cx = this.opts.interactive || this.w < 720 ? (this.w - this.inset) / 2 : this.w * 0.62;
    const cy = !this.opts.interactive && this.w < 720 ? this.h * 0.34 : this.h / 2;
    return zoomIdentity.translate(cx, cy).scale(k).translate(-x, -y);
  }

  jump(lon: number, lat: number, k: number): void {
    this.svg.interrupt();
    this.flight = null;
    this.svg.call(this.zoomer.transform, this.target(lon, lat, k));
  }

  flyTo(lon: number, lat: number, k: number, duration = 1600): void {
    if (reducedMotion() || duration === 0) return this.jump(lon, lat, k);
    this.svg.interrupt();
    this.flight = [lon, lat, k, duration];
    this.svg
      .transition()
      .duration(duration)
      .ease(easeCubicInOut)
      .call(this.zoomer.transform as never, this.target(lon, lat, k))
      .on('end interrupt', () => (this.flight = null));
  }

  /** Fit a set of lon/lat points, never zooming past maxK. */
  fit(coords: [number, number][], maxK = 9, duration = 1600): void {
    if (!coords.length) return this.flyTo(-25, 15, 1, duration);
    if (coords.length === 1) return this.flyTo(coords[0][0], coords[0][1], maxK, duration);
    const pts = coords.map((c) => this.projection(c) ?? [0, 0]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const wide = !this.opts.interactive && this.w >= 720;
    const availW = wide ? this.w * 0.5 : this.w * 0.8;
    // On a phone the step box covers the lower half: fit into the upper part.
    const phone = !this.opts.interactive && this.w < 720;
    const availH = phone ? this.h * 0.4 : this.h * 0.62;
    const k = Math.max(0.8, Math.min(maxK, (phone ? this.w * 0.78 : availW) / Math.max(1, x1 - x0), availH / Math.max(1, y1 - y0)));
    const c = this.projection.invert?.([(x0 + x1) / 2, (y0 + y1) / 2]) ?? [-20, 10];
    this.flyTo(c[0], c[1], k, duration);
  }

  setLevel(level: number, duration = 900): void {
    const [lon, lat] = this.center();
    this.flyTo(lon, lat, LEVEL_K[Math.max(0, Math.min(4, level - 1))], duration);
  }

  pan(dx: number, dy: number): void {
    this.svg.transition().duration(reducedMotion() ? 0 : 250).call(this.zoomer.translateBy as never, dx / this.t.k, dy / this.t.k);
  }

  home(duration = 1200): void {
    if (reducedMotion()) duration = 0;
    this.svg.interrupt();
    this.svg.transition().duration(duration).call(this.zoomer.transform as never, zoomIdentity);
  }

  setPoints(points: MapPoint[]): void {
    this.points = [...points].sort((a, b) => a.priority - b.priority);
    const sel = this.gPoints
      .selectAll<SVGGElement, MapPoint>('g.pt')
      .data(this.points, (d) => d.id)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'pt');
        g.append('circle').attr('class', 'halo').attr('r', 30).attr('fill', `url(#${this.idPrefix}-halo)`);
        g.append('circle').attr('class', 'dot');
        g.append('line').attr('class', 'leader');
        g.append('text').attr('class', 'lbl').attr('x', 9).attr('y', 4);
        if (this.opts.interactive) {
          g.attr('tabindex', 0).attr('role', 'button');
          g.on('click', (_, d) => this.opts.onPoint?.(d.id));
          g.on('keydown', (ev: KeyboardEvent, d) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              this.opts.onPoint?.(d.id);
            }
          });
          g.on('mouseenter', (ev: MouseEvent, d) => this.opts.onHover?.(d.id, ev));
          g.on('mouseleave', () => this.opts.onHover?.(null));
        }
        return g;
      });
    sel
      .attr('class', (d) => `pt${d.minor ? ' minor' : ''}${d.lit ? ' lit' : ''}${d.out ? ' out' : ''}${d.focus ? ' focus' : ''}`)
      .attr('aria-label', (d) => d.aria ?? d.label)
      .style('--pc', (d) => d.color);
    sel.select('circle.dot').attr('r', (d) => (d.focus ? 8 : d.minor ? 2.6 : d.lit ? 6.5 : 5));
    sel
      .select('text.lbl')
      .attr('class', (d) => `lbl${d.title ? ' title' : ''}`)
      .text((d) => (d.minor ? '' : d.label));
    sel.raise();
    this.renderOverlay();
    this.placeLabels();
  }

  setRoutes(routes: MapRoute[], animate = true): void {
    const prev = new Map(this.routes.map((r) => [r.id, r.progress ?? 1]));
    this.routes = routes.map((r) => ({ ...r, progress: animate && !reducedMotion() ? (prev.get(r.id) ?? 0) : 1 }));
    const pending = this.routes.filter((r) => (r.progress ?? 1) < 1);
    if (pending.length) {
      const start = new Map(pending.map((r) => [r.id, r.progress ?? 0]));
      const dur = 1800;
      const tm = timer((el) => {
        const p = Math.min(1, el / dur);
        for (const r of pending) {
          const s = start.get(r.id)!;
          r.progress = s + (1 - s) * easeCubicInOut(p);
        }
        this.renderRoutes();
        if (p >= 1) tm.stop();
      });
    }
    this.renderRoutes();
  }

  setRegions(regions: MapRegion[]): void {
    const sel = this.gRegions
      .selectAll<SVGGElement, MapRegion>('g.region')
      .data(regions, (d) => d.id)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'region');
        g.append('circle');
        g.append('text').attr('class', 'nm').attr('text-anchor', 'middle');
        g.append('text').attr('class', 'n').attr('text-anchor', 'middle');
        if (this.opts.interactive) {
          g.attr('tabindex', 0).attr('role', 'button');
          g.on('click', (_, d) => this.opts.onRegion?.(d));
          g.on('keydown', (ev: KeyboardEvent, d) => {
            if (ev.key === 'Enter') this.opts.onRegion?.(d);
          });
        }
        return g;
      });
    sel.style('--rc', (d) => d.color).attr('aria-label', (d) => `${d.name}: ${count(d.count, 'card')}`);
    sel.select('circle').attr('r', (d) => 16 + Math.sqrt(d.count) * 11);
    sel.select('text.nm').text((d) => d.name);
    sel.select('text.n').text((d) => count(d.count, 'card'));
    this.renderOverlay();
  }

  setNumbers(nums: MapNumber[]): void {
    const sel = this.gNums
      .selectAll<SVGGElement, MapNumber>('g.path-num')
      .data(nums)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'path-num');
        g.append('circle').attr('r', 10);
        g.append('text');
        return g;
      });
    sel.select('text').text((d) => d.n);
    this.renderOverlay();
  }

  private curve(leg: Leg, progress: number): string {
    const a = this.xy(leg.from[0], leg.from[1]);
    const b = this.xy(leg.to[0], leg.to[1]);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    let nx = -dy / (len || 1);
    let ny = dx / (len || 1);
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const bend = Math.min(0.24 * len, 220);
    const c: [number, number] = [(a[0] + b[0]) / 2 + nx * bend, (a[1] + b[1]) / 2 + ny * bend];
    const t = Math.max(0, Math.min(1, progress));
    // De Casteljau: the part of the quadratic curve from 0 to t.
    const q0: [number, number] = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
    const q1: [number, number] = [c[0] + (b[0] - c[0]) * t, c[1] + (b[1] - c[1]) * t];
    const end: [number, number] = [q0[0] + (q1[0] - q0[0]) * t, q0[1] + (q1[1] - q0[1]) * t];
    return `M${a[0].toFixed(1)},${a[1].toFixed(1)}Q${q0[0].toFixed(1)},${q0[1].toFixed(1)} ${end[0].toFixed(1)},${end[1].toFixed(1)}`;
  }

  private renderRoutes(): void {
    const legs = this.routes.flatMap((r) => r.legs.map((l, i) => ({ r, l, key: `${r.id}:${i}` })));
    this.gRoutes
      .selectAll<SVGPathElement, (typeof legs)[number]>('path.route')
      .data(legs, (d) => d.key)
      .join('path')
      .attr('class', (d) => `route${d.r.faint ? ' faint' : ''}`)
      .style('--rc', (d) => d.r.color)
      .style('stroke-width', (d) => (d.l.weight ? `${(1.2 + d.l.weight * 9).toFixed(1)}px` : null))
      .attr('d', (d) => this.curve(d.l, d.r.progress ?? 1));
    const flows = legs.filter((d) => d.r.flow && (d.r.progress ?? 1) >= 1 && !d.r.faint);
    this.gRoutes
      .selectAll<SVGPathElement, (typeof legs)[number]>('path.flow')
      .data(flows, (d) => d.key)
      .join('path')
      .attr('class', 'flow')
      .style('--rc', (d) => d.r.color)
      .style('stroke-width', (d) => (d.l.weight ? `${(2 + d.l.weight * 6).toFixed(1)}px` : null))
      .style('stroke-dasharray', (d) => (d.l.weight ? `1 ${Math.round(14 - d.l.weight * 9)}` : null))
      .attr('d', (d) => this.curve(d.l, 1));
    const labelled = this.routes.filter((r) => r.label && !r.faint);
    const lab = this.gRoutes
      .selectAll<SVGTextElement, MapRoute>('text.route-label')
      .data(labelled, (d) => d.id)
      .join((enter) => {
        const t = enter.append('text').attr('class', 'route-label');
        t.append('tspan').attr('class', 'main');
        t.append('tspan').attr('class', 'sub').attr('dy', '1.35em');
        return t;
      });
    lab
      .attr('transform', (d) => {
        const [x, y] = this.xy(d.label!.at[0], d.label!.at[1]);
        // Keep the label on screen: clamp by its measured width.
        const w = (this.labelWidths.get(d.id) ?? d.label!.text.length * 8) + 8;
        // Not under the text column either.
        const left = Math.max(8, ...(this.opts.avoid?.() ?? []).filter((a) => y > a[1] - 30 && y < a[3]).map((a) => a[2] + 12));
        const cx = Math.max(left, Math.min(this.w - w, x));
        return `translate(${cx.toFixed(1)},${y})`;
      })
      .style('opacity', (d) => Math.min(1, ((d.progress ?? 1) - 0.4) * 2));
    // Titles above every arc, never crossed by one.
    lab.raise();
    lab.select('tspan.main').attr('x', 0).text((d) => d.label!.text);
    lab.select('tspan.sub').attr('x', 0).text((d) => d.label!.sub ?? '');
    lab.each((d, i, n) => {
      if (this.labelWidths.has(d.id)) return;
      const bb = (n[i] as SVGTextElement).getBBox?.();
      if (bb && bb.width) this.labelWidths.set(d.id, bb.width);
    });
  }

  private renderOverlay(): void {
    this.gPoints.selectAll<SVGGElement, MapPoint>('g.pt').attr('transform', (d) => {
      const [x, y] = this.xy(d.lon, d.lat);
      return `translate(${x.toFixed(1)},${y.toFixed(1)})`;
    });
    this.gRegions.selectAll<SVGGElement, MapRegion>('g.region').each((d, i, nodes) => {
      const [x, y] = this.xy(d.lon, d.lat);
      const g = select(nodes[i]);
      g.attr('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      const r = 16 + Math.sqrt(d.count) * 11;
      g.select('text.nm').attr('y', r + 16);
      g.select('text.n').attr('y', 5);
    });
    this.gNums.selectAll<SVGGElement, MapNumber>('g.path-num').attr('transform', (d) => {
      const [x, y] = this.xy(d.lon, d.lat);
      return `translate(${x.toFixed(1)},${(y - 18).toFixed(1)})`;
    });
    this.renderRoutes();
  }

  /** Greedy label placement: important labels first, drop the ones that collide. */
  /**
   * Label placement: important labels first; each tries right, left, above and
   * below its dot, then (if it must be shown) a spot further out with a leader
   * line. Labels never overlap, never leave the frame and never sit under the
   * text column.
   */
  private placeLabels(): void {
    const boxes: [number, number, number, number][] = [...(this.opts.avoid?.() ?? [])];
    // Movement titles are placed already; point labels keep clear of them.
    const own = this.svg.node()!.getBoundingClientRect();
    this.gRoutes.selectAll<SVGTextElement, unknown>('text.route-label').each(function () {
      const r = this.getBoundingClientRect();
      if (r.width) boxes.push([r.left - own.left - 4, r.top - own.top - 2, r.right - own.left + 4, r.bottom - own.top + 2]);
    });
    const budget = this.opts.maxLabels?.() ?? Infinity;
    let shown = 0;
    const order = [...this.points].sort((a, b) => Number(!!b.focus) - Number(!!a.focus) || Number(!!b.lit) - Number(!!a.lit) || b.priority - a.priority);
    const nodes = new Map<string, SVGGElement>();
    this.gPoints.selectAll<SVGGElement, MapPoint>('g.pt').each(function (d) {
      nodes.set(d.id, this);
    });
    const free = (b: [number, number, number, number]) =>
      b[0] >= 4 && b[2] <= this.w - 4 && b[1] >= 4 && b[3] <= this.h - 4 && !boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    for (const p of order) {
      const g = nodes.get(p.id);
      if (!g) continue;
      const node = g.querySelector('text.lbl') as SVGTextElement;
      const leader = g.querySelector('line.leader') as SVGLineElement;
      leader.setAttribute('x2', '0');
      leader.setAttribute('y2', '0');
      leader.classList.add('hide');
      if (p.minor || p.out || shown >= budget || !p.label) {
        node.classList.add('hide');
        continue;
      }
      const [x, y] = this.xy(p.lon, p.lat);
      // Long names are shortened on narrow maps rather than run off the edge.
      const text = shortLabel(p.label, this.w < 520 ? 22 : 40);
      if (node.textContent !== text) node.textContent = text;
      node.classList.remove('hide');
      const measured = (node as SVGTextContentElement).getComputedTextLength?.() || 0;
      const w = (measured || text.length * (p.title ? 7.4 : 6.6)) + 8;
      const hgt = 16;
      // [dx, dy, anchor] for the text, relative to the dot.
      const spots: [number, number, 'start' | 'end' | 'middle'][] = [
        [9, 4, 'start'],
        [-9, 4, 'end'],
        [0, -12, 'middle'],
        [0, 20, 'middle'],
      ];
      if (p.lit || p.focus) spots.push([34, -26, 'start'], [-34, -26, 'end'], [34, 30, 'start'], [-34, 30, 'end'], [0, -40, 'middle'], [0, 46, 'middle']);
      let placed = false;
      for (const [dx, dy, anchor] of spots) {
        const x0 = anchor === 'start' ? x + dx : anchor === 'end' ? x + dx - w : x + dx - w / 2;
        const box: [number, number, number, number] = [x0, y + dy - 12, x0 + w, y + dy - 12 + hgt];
        if (!free(box)) continue;
        boxes.push(box);
        node.setAttribute('x', String(dx));
        node.setAttribute('y', String(dy));
        node.setAttribute('text-anchor', anchor);
        node.classList.remove('hide');
        if (Math.abs(dx) > 20 || Math.abs(dy) > 24) {
          leader.setAttribute('x2', String(dx * 0.82));
          leader.setAttribute('y2', String(dy - 4));
          leader.classList.remove('hide');
        }
        shown++;
        placed = true;
        break;
      }
      if (!placed) node.classList.add('hide');
      else boxes.push([x - 6, y - 6, x + 6, y + 6]);
    }
  }

  destroy(): void {
    this.ro.disconnect();
    this.svg.remove();
  }
}

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag);
}

/**
 * A map label: the name before any colon, comma or bracket ("Partus sequitur
 * ventrem: Virginia, 1662" → "Partus sequitur ventrem"), cut at a word.
 */
export function shortLabel(label: string, max: number): string {
  let s = label.split(/\s*[:(,—]\s*/)[0] || label;
  if (s.length <= max) return s;
  s = s.slice(0, max);
  const cut = s.lastIndexOf(' ');
  return (cut > max * 0.5 ? s.slice(0, cut) : s).replace(/[\s,.;]+$/, '') + '…';
}
