// The timeline: eras v0–v7 as bands, lives as bars, events as beads. Time is
// stretched where the cards are dense, so the 1300s do not eat the page.
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import { select, type Selection } from 'd3-selection';
import { brushX, type BrushBehavior } from 'd3-brush';
import type { Card } from '../lib/types';
import { span } from '../lib/cards';
import { eraColor } from '../lib/atlasModel';

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
    .range([0, 0.1, 0.24, 0.48, 0.78, 1].map((f) => left + f * inner))
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
    this.svg.attr('role', 'group').attr('aria-label', 'Timeline, 1300 to today');
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
    const rowH = compact ? 17 : 26;
    const maxRows = compact ? 7 : 16;
    const LONG = 150; // years: long durations are drawn as faint threads

    // Lives and events: pack rows, keeping room for the label.
    const items = [...this.cards].sort((a, b) => span(a)[0] - span(b)[0]);
    const rows: number[] = [];
    const placed = items.map((c) => {
      const [a, b] = span(c);
      const x0 = x(a);
      // Lives are bars; events, works and objects are beads at their first year.
      const life = c.kind === 'person' && b > a;
      const x1 = life ? Math.max(x(b), x0 + 4) : x0 + 6;
      const lw = c.title.length * (compact ? 5.6 : 6.4) + 10;
      const long = life && b - a > LONG;
      const need = (long ? x0 + lw : Math.max(x1, x0 + lw)) + 8;
      let row = rows.findIndex((end) => end < x0);
      if (row < 0 && rows.length < maxRows) row = rows.length;
      const labelled = row >= 0;
      if (row < 0) row = rows.indexOf(Math.min(...rows));
      rows[row] = Math.max(rows[row] ?? 0, labelled ? need : x1 + 2);
      return { c, x0, x1, row, labelled, long };
    });
    const axisY = lifeTop + Math.max(1, rows.length) * rowH + 8;
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
    for (const p of placed) {
      const y = lifeTop + p.row * rowH;
      const [a, b] = span(p.c);
      const g = gLife
        .append('g')
        .attr('class', `life${p.long ? ' long' : ''}${p.x1 - p.x0 <= 6 ? ' bead' : ''}`)
        .attr('data-id', p.c.id)
        .attr('tabindex', 0)
        .attr('role', 'button')
        .attr('aria-label', `${p.c.title}, ${a === b ? a : `${a} to ${b}`}`)
        .style('--era', eraColor(p.c.era))
        .on('click', () => this.opts.onSelect?.(p.c.id))
        .on('keydown', (ev: KeyboardEvent) => {
          if (ev.key === 'Enter') this.opts.onSelect?.(p.c.id);
        })
        .on('mouseenter', (ev: MouseEvent) => this.opts.onHover?.(p.c.id, ev))
        .on('mouseleave', () => this.opts.onHover?.(null));
      const barY = y + (compact ? 9 : 13);
      g.append('rect')
        .attr('x', p.x0)
        .attr('y', barY)
        .attr('width', p.x1 - p.x0)
        .attr('height', p.long ? 2 : compact ? 5 : 7)
        .attr('rx', p.x1 - p.x0 <= 6 ? 3 : 3);
      if (p.labelled) g.append('text').attr('x', p.x0).attr('y', barY - 3).text(p.c.title);
      g.append('rect')
        .attr('x', p.x0 - 2)
        .attr('y', y)
        .attr('width', Math.max(p.x1 - p.x0, p.labelled ? p.c.title.length * 6 : 6) + 4)
        .attr('height', rowH)
        .attr('class', 'hit');
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
