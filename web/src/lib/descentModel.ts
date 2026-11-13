// Layout of "Through the centuries": one long vertical descent from 1300 to
// today. Scroll distance is time, stretched where the cards are dense so the
// quiet centuries stay quiet and the crowded ones get room.
import type { Card, Chapter } from './types';
import { span } from './cards';

export const NOW = new Date().getFullYear();
export const START = 1300;

const BOUNDS = [1300, 1400, 1500, 1600, 1700, 1750, 1800, 1850, 1900, 1925, 1950, 1975, 2000, NOW];
// Minimum pixels per year: recent centuries always get more room.
const BASE = [3, 3.5, 4.5, 6, 11, 13, 15, 19, 26, 26, 26, 22, 20];

export interface Scale {
  y(year: number): number;
  year(y: number): number;
  height: number;
}

/** Piecewise linear scale; `need` is the extra height (px) each item wants. */
export function buildScale(items: { year: number; need: number }[], top: number, bottom: number, factor = 1): Scale {
  const ys = [top];
  for (let i = 0; i < BOUNDS.length - 1; i++) {
    const [a, b] = [BOUNDS[i], BOUNDS[i + 1]];
    const years = Math.max(1, b - a);
    const need = items.filter((it) => it.year >= a && (it.year < b || (i === BOUNDS.length - 2 && it.year <= b))).reduce((s, it) => s + it.need, 0);
    const px = Math.max(BASE[i] * factor * years, need * 1.3);
    ys.push(ys[i] + px);
  }
  const height = ys[ys.length - 1] + bottom;
  const y = (year: number) => {
    const t = Math.max(START, Math.min(NOW, year));
    let i = BOUNDS.findIndex((b, k) => k < BOUNDS.length - 1 && t >= b && t <= BOUNDS[k + 1]);
    if (i < 0) i = BOUNDS.length - 2;
    const f = (t - BOUNDS[i]) / Math.max(1, BOUNDS[i + 1] - BOUNDS[i]);
    return ys[i] + f * (ys[i + 1] - ys[i]);
  };
  const year = (py: number) => {
    if (py <= ys[0]) return START;
    for (let i = 0; i < ys.length - 1; i++) {
      if (py <= ys[i + 1]) return BOUNDS[i] + ((py - ys[i]) / Math.max(1, ys[i + 1] - ys[i])) * (BOUNDS[i + 1] - BOUNDS[i]);
    }
    return NOW;
  };
  return { y, year, height };
}

export type Item =
  | { kind: 'card'; id: string; year: number; h: number }
  | { kind: 'chapter'; id: string; year: number; h: number }
  | { kind: 'movement'; id: string; year: number; h: number }
  | { kind: 'quiet'; id: string; year: number; h: number; from: number; to: number };

export interface Placed {
  item: Item;
  col: number; // -1 spans all columns
  top: number;
  anchor: number; // y of the item's year
}

/**
 * Place items down the columns: each card goes into the column that is free
 * first, as close to its year as it can; chapter and movement headers span
 * all columns.
 */
export function place(items: Item[], scale: Scale, cols: number, gap = 22): Placed[] {
  const bottoms = new Array(cols).fill(0);
  const out: Placed[] = [];
  const sorted = [...items].sort((a, b) => a.year - b.year || rank(a) - rank(b));
  for (const it of sorted) {
    const anchor = scale.y(it.year);
    if (it.kind === 'card') {
      let col = 0;
      for (let c = 1; c < cols; c++) if (bottoms[c] < bottoms[col]) col = c;
      const top = Math.max(anchor - 18, bottoms[col] + gap);
      bottoms[col] = top + it.h;
      out.push({ item: it, col, top, anchor });
    } else {
      const top = Math.max(anchor - 10, Math.max(...bottoms) + gap);
      bottoms.fill(top + it.h);
      out.push({ item: it, col: -1, top, anchor });
    }
  }
  return out;
}

function rank(it: Item): number {
  return { movement: 0, chapter: 1, quiet: 2, card: 3 }[it.kind];
}

/** Long silences between cards get a quiet note instead of nothing. */
export function quietStretches(cards: Card[], min = 45): { from: number; to: number }[] {
  const years = [START, ...cards.map((c) => Math.max(START, span(c)[0])).sort((a, b) => a - b)];
  const out: { from: number; to: number }[] = [];
  for (let i = 1; i < years.length; i++) {
    if (years[i] - years[i - 1] >= min) out.push({ from: years[i - 1], to: years[i] });
  }
  return out;
}

/** Greedy lanes for lives so bars never overlap. */
export function lanes<T>(items: T[], range: (t: T) => [number, number], max: number): Map<T, number> {
  const ends: number[] = [];
  const out = new Map<T, number>();
  for (const it of [...items].sort((a, b) => range(a)[0] - range(b)[0])) {
    const [a, b] = range(it);
    let lane = ends.findIndex((e) => e < a);
    if (lane < 0) {
      if (ends.length >= max) continue;
      lane = ends.length;
    }
    ends[lane] = b;
    out.set(it, lane);
  }
  return out;
}

/**
 * The chapter a year belongs to. Chapters overlap, so among those whose span
 * holds the year pick the one whose cards cluster nearest to it (`centre` is
 * the median card year per chapter); without centres, the latest to begin.
 */
export function chapterAt(chapters: Chapter[], year: number, centre?: Map<string, number>): Chapter | undefined {
  const withYears = chapters.filter((c) => c.years.length);
  const open = withYears.filter((c) => c.years[0] <= year && (c.years[1] ?? NOW) >= year);
  const pool = open.length ? open : withYears;
  const dist = (c: Chapter) => Math.abs((centre?.get(c.id) ?? c.years[0]) - year);
  if (centre) return [...pool].sort((a, b) => dist(a) - dist(b))[0];
  if (open.length) return [...open].sort((a, b) => b.years[0] - a.years[0])[0];
  return [...withYears].sort((a, b) => dist(a) - dist(b))[0];
}

/** Median first year of each chapter's cards. */
export function chapterCentres(chapters: Chapter[], year: (id: string) => number | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const ch of chapters) {
    const ys = ch.cards.map(year).filter((y): y is number => y !== undefined).sort((a, b) => a - b);
    if (ys.length) out.set(ch.id, ys[Math.floor(ys.length / 2)]);
  }
  return out;
}

/** Landmarks kept per century at the general levels, so no century goes blank. */
// Kept at every higher level too, so raising the level never hides a card.
const LANDMARKS = [1, 3, 3, 3, 3];

/**
 * The cards a level of generalisation shows, like the atlas zoom: 1 centuries
 * (the few landmark cards of each century), 2 regions, 3 cities and genres,
 * 4 people, 5 every single document.
 */
export function levelCards<T extends { id: string; zoom: number; years: number[]; media?: unknown[] }>(cards: T[], level: number): T[] {
  const lvl = Math.max(1, Math.min(5, Math.round(level)));
  if (lvl >= 5) return cards;
  const keep = new Set(cards.filter((c) => c.zoom <= lvl).map((c) => c.id));
  const n = LANDMARKS[lvl - 1];
  if (n) {
    const byCentury = new Map<number, T[]>();
    for (const c of cards) {
      const k = Math.floor(Math.max(START, c.years[0]) / 100);
      byCentury.set(k, [...(byCentury.get(k) ?? []), c]);
    }
    for (const group of byCentury.values()) {
      const ranked = [...group].sort((a, b) => a.zoom - b.zoom || Number(!!b.media?.length) - Number(!!a.media?.length) || a.years[0] - b.years[0]);
      let added = group.filter((c) => keep.has(c.id)).length;
      for (const c of ranked) {
        if (added >= n) break;
        if (!keep.has(c.id)) {
          keep.add(c.id);
          added++;
        }
      }
    }
  }
  return cards.filter((c) => keep.has(c.id));
}

/** Every chapter whose span holds the year. */
export function chaptersAt(chapters: Chapter[], year: number): Chapter[] {
  return chapters.filter((c) => c.years.length && c.years[0] <= year && (c.years[1] ?? NOW) >= year);
}
