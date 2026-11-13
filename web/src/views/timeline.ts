// The timeline: eras v0–v7 as bands, lives as bars, events as beads. Time is
// stretched where the cards are dense, so the 1300s do not eat the page.
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import { select, type Selection } from 'd3-selection';
import { brushX, type BrushBehavior } from 'd3-brush';
import type { Card } from '../lib/types';
import { formatYears, span } from '../lib/cards';
import { eraColor } from '../lib/atlasModel';
import { t } from '../lib/i18n';

export interface EraSpan {
  id: string;
  label: string;
  from: number;
  to: number;
}

interface Options {
  compact?: boolean;
  brush?: boolean;
  onSelect?: (id: string) => void;
  onBrush?: (from?: number, to?: number) => void;
  onEra?: (id: string) => void;
  onHover?: (id: string | null, ev?: MouseEvent) => void;
}

const NOW = new Date().getFullYear();

export function yearScale(width: number, left = 24, right = 24): ScaleLinear<number, number> {
  const inner = width - left - right;
  return scaleLinear()
    .domain([1300, 1500, 1700, 1850, 1950, NOW])
    .range([0, 0.06, 0.15, 0.33, 0.72, 1].map((f) => left + f * inner))
    .clamp(true);
}

export class Timeline {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private x!: ScaleLinear<number, number>;
  private brush?: BrushBehavior<unknown>;
  private gBrush?: Selection<SVGGElement, unknown, null, undefined>;
  private silent = false;
  private range: [number, number] | null = null;
  private ro: ResizeObserver;
  private width = 0;

  constructor(
    private host: HTMLElement,
    private cards: Card[],
    private eras: EraSpan[],
    private opts: Options = {},
  ) {
    this.svg = select(host).append('svg').attr('class', 'tl') as never;
    this.svg.attr('role', 'group').attr('aria-label', t('Timeline, 1300 to today'));
    this.ro = new ResizeObserver(() => {
      const w = Math.max(this.opts.compact ? 900 : 1100, host.clientWidth);
      if (Math.abs(w - this.width) > 4) this.render();
    });
    this.ro.observe(host);
    this.render();
  }

  setCards(cards: Card[]): void {
    this.cards = cards;
    this.render();
  }

  private render(): void {
    const compact = !!this.opts.compact;
    const W = Math.max(compact ? 900 : 1100, this.host.clientWidth);
    this.width = W;
    const x = (this.x = yearScale(W));
    const svg = this.svg;
    svg.selectAll('*').remove();

    // Eras: greedy lanes for overlapping spans.
    const eraLanes: number[] = [];
    const eraRows = this.eras.map((e) => {
      let lane = eraLanes.findIndex((end) => end < x(e.from) - 2);
      if (lane < 0) lane = eraLanes.length;
      eraLanes[lane] = x(e.to);
      return { e, lane };
    });
    const eraH = compact ? 13 : 16;
    const eraTop = 6;
    const lifeTop = eraTop + eraLanes.length * (eraH + 3) + 12;
    const rowH = compact ? 15 : 20;
    const maxRows = compact ? 7 : 14;
    const barH = compact ? 11 : 14;

    // Lives are bars with their name inside, or just after the bar when it is
    // short; everything else is a bead in a strip of its own, named on hover.
    const items = [...this.cards].sort((a, b) => span(a)[0] - span(b)[0]);
    const rows: number[] = [];
    const placed: { c: Card; x0: number; x1: number; row: number; label: 'in' | 'out' | 'none'; bead: boolean }[] = [];
    const beads: { c: Card; x: number; lane: number }[] = [];
    const beadEnds: number[] = [];
    for (const c of items) {
      const [a, b] = span(c);
      const x0 = x(a);
      const life = c.kind === 'person' && b > a;
      if (!life) {
        let lane = beadEnds.findIndex((e) => e < x0 - 7);
        if (lane < 0) lane = beadEnds.length < 3 ? beadEnds.length : beadEnds.indexOf(Math.min(...beadEnds));
        beadEnds[lane] = x0;
        beads.push({ c, x: x0, lane });
        continue;
      }
      const x1 = Math.max(x(b), x0 + 4);
      const lw = textWidth(c.title, compact ? 10 : 11) + 12;
      const inside = x1 - x0 >= lw;
      const end = (inside ? x1 : x1 + lw) + 6;
      let row = rows.findIndex((e) => e < x0);
      if (row < 0 && rows.length < maxRows) row = rows.length;
      if (row < 0) {
        // No room: the life joins the beads rather than overlap another.
        let lane = beadEnds.findIndex((e) => e < x0 - 7);
        if (lane < 0) lane = beadEnds.length < 3 ? beadEnds.length : beadEnds.indexOf(Math.min(...beadEnds));
        beadEnds[lane] = x0;
        beads.push({ c, x: x0, lane });
        continue;
      }
      const fits = true;
      // A label never runs past the right edge of the plot.
      const label = !fits ? 'none' : inside ? 'in' : x1 + lw < x(NOW) ? 'out' : 'none';
      rows[row] = Math.max(rows[row] ?? 0, label === 'out' ? end : x1 + 4);
      placed.push({ c, x0, x1, row, label, bead: false });
    }
    const beadTop = lifeTop + Math.max(1, rows.length) * rowH + 6;
    const lanesH = Math.max(1, beadEnds.length) * 9;
    const axisY = beadTop + lanesH + 8;
    const H = axisY + 26;
    svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);

    const gEra = svg.append('g');
    for (const { e, lane } of eraRows) {
      const g = gEra
        .append('g')
        .attr('class', 'era')
        .attr('tabindex', 0)
        .attr('role', 'button')
        .attr('aria-label', `${e.id}, ${e.label}, ${e.from} to ${e.to}`)
        .style('--era', eraColor(e.id))
        .on('click', () => this.opts.onEra?.(e.id))
        .on('keydown', (ev: KeyboardEvent) => {
          if (ev.key === 'Enter') this.opts.onEra?.(e.id);
        });
      const y = eraTop + lane * (eraH + 3);
      g.append('rect').attr('x', x(e.from)).attr('y', y).attr('width', Math.max(6, x(e.to) - x(e.from))).attr('height', eraH).attr('rx', 3);
      g.append('text')
        .attr('x', x(e.from) + 6)
        .attr('y', y + 11.5)
        .text(`${e.id.toUpperCase()}  ${x(e.to) - x(e.from) > 120 ? e.label : ''}`);
    }

    // Century and decade ticks.
    const gAxis = svg.append('g').attr('class', 'axis');
    const ticks: number[] = [];
    for (let y = 1300; y <= NOW; y += 50) ticks.push(y);
    for (const t of ticks) {
      const major = t % 100 === 0;
      if (!major && t < 1700) continue;
      const g = gAxis.append('g').attr('class', major ? 'tick-major' : 'tick');
      g.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', lifeTop - 6).attr('y2', axisY);
      if (major || t >= 1850) g.append('text').attr('x', x(t)).attr('y', axisY + 16).attr('text-anchor', 'middle').text(t);
    }
    const now = svg.append('g').attr('class', 'now');
    now.append('line').attr('x1', x(NOW)).attr('x2', x(NOW)).attr('y1', lifeTop - 6).attr('y2', axisY);

    const gLife = svg.append('g');
    const hook = (g: Selection<SVGGElement, unknown, null, undefined>, c: Card) =>
      g
        .attr('data-id', c.id)
        .attr('tabindex', 0)
        .attr('role', 'button')
        .attr('aria-label', `${c.title}, ${formatYears(c.years)}`)
        .style('--era', eraColor(c.era))
        .on('click', () => this.opts.onSelect?.(c.id))
        .on('keydown', (ev: KeyboardEvent) => {
          if (ev.key === 'Enter') this.opts.onSelect?.(c.id);
        })
        .on('mouseenter', (ev: MouseEvent) => this.opts.onHover?.(c.id, ev))
        .on('mouseleave', () => this.opts.onHover?.(null));
    for (const p of placed) {
      const y = lifeTop + p.row * rowH;
      const g = hook(gLife.append('g').attr('class', 'life'), p.c);
      g.append('rect').attr('x', p.x0).attr('y', y).attr('width', p.x1 - p.x0).attr('height', barH).attr('rx', barH / 2);
      if (p.label !== 'none')
        g.append('text')
          .attr('class', p.label === 'in' ? 'in' : 'out')
          .attr('x', p.label === 'in' ? p.x0 + 6 : p.x1 + 5)
          .attr('y', y + barH / 2 + 3.5)
          .text(p.c.title);
    }
    for (const b of beads) {
      const g = hook(gLife.append('g').attr('class', 'life bead'), b.c);
      g.append('circle').attr('cx', b.x).attr('cy', beadTop + b.lane * 9 + 4).attr('r', 3.2);
    }
    if (this.opts.brush) {
      this.brush = brushX()
        .extent([
          [x(1300), 0],
          [x(NOW), axisY],
        ])
        .filter((ev: Event) => !(ev.target as Element).closest?.('.life, .era') || (ev as MouseEvent).shiftKey)
        .on('end', (ev) => {
          if (this.silent) return;
          if (!ev.selection) {
            this.range = null;
            this.opts.onBrush?.();
            return;
          }
          const [s0, s1] = ev.selection as [number, number];
          const r: [number, number] = [Math.round(x.invert(s0)), Math.round(x.invert(s1))];
          this.range = r;
          this.opts.onBrush?.(r[0], r[1]);
        });
      this.gBrush = svg.insert('g', ':first-child').attr('class', 'brush').call(this.brush as never);
      this.gBrush.select('.overlay').attr('aria-hidden', 'true');
      if (this.range) this.setRange(this.range[0], this.range[1]);
    }
  }

  setRange(from?: number, to?: number): void {
    this.range = from ? [from, to ?? from] : null;
    if (!this.brush || !this.gBrush) return;
    this.silent = true;
    if (this.range) {
      const a = this.x(this.range[0]);
      const b = Math.max(this.x(this.range[1]), a + 3);
      this.gBrush.call(this.brush.move as never, [a, b]);
    } else this.gBrush.call(this.brush.move as never, null);
    this.silent = false;
    this.svg.selectAll<SVGGElement, unknown>('g.life').classed('dim', (_, i, n) => {
      if (!this.range) return false;
      const c = this.cards.find((k) => k.id === (n[i] as SVGGElement).dataset.id);
      if (!c) return false;
      const [a, b] = span(c);
      return b < this.range[0] || a > this.range[1];
    });
  }

  setFocus(id?: string): void {
    this.svg.selectAll<SVGGElement, unknown>('g.life').classed('on', (_, i, n) => (n[i] as SVGGElement).dataset.id === id);
  }

  /** Scroll the container so a year is in view (mobile). */
  reveal(year: number): void {
    const px = this.x(year) - this.host.clientWidth / 2;
    this.host.scrollTo?.({ left: Math.max(0, px), behavior: 'smooth' });
  }

  destroy(): void {
    this.ro.disconnect();
    this.svg.remove();
  }
}

let ctx2d: CanvasRenderingContext2D | null | undefined;
/** Measure a label as it will be drawn, so labels never run into each other. */
export function textWidth(text: string, size: number): number {
  if (ctx2d === undefined) ctx2d = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!ctx2d) return text.length * size * 0.58;
  ctx2d.font = `${size}px Inter, system-ui, sans-serif`;
  return ctx2d.measureText(text).width;
}
