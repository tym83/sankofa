import { describe, expect, it } from 'vitest';
import { buildScale, chapterAt, chapterCentres, lanes, NOW, place, quietStretches, type Item } from '../src/lib/descentModel';
import type { Card, Chapter } from '../src/lib/types';

describe('descent scale', () => {
  const s = buildScale([], 100, 100);

  it('is monotonic and invertible', () => {
    let prev = -1;
    for (let y = 1300; y <= NOW; y += 7) {
      expect(s.y(y)).toBeGreaterThan(prev);
      prev = s.y(y);
      expect(s.year(s.y(y))).toBeCloseTo(y, 5);
    }
    expect(s.y(1200)).toBe(s.y(1300));
  });

  it('gives recent centuries more room than old ones', () => {
    expect(s.y(1950) - s.y(1900)).toBeGreaterThan((s.y(1400) - s.y(1300)) * 2);
  });

  it('stretches crowded decades to fit their cards', () => {
    const crowded = buildScale(Array.from({ length: 40 }, () => ({ year: 1925, need: 200 })), 0, 0);
    expect(crowded.y(1950) - crowded.y(1925)).toBeGreaterThan(40 * 200);
  });
});

describe('placement', () => {
  it('keeps cards in a column from overlapping and near their year', () => {
    const items: Item[] = Array.from({ length: 30 }, (_, i) => ({ kind: 'card' as const, id: String(i), year: 1900 + i, h: 150 }));
    items.push({ kind: 'chapter', id: 'v5', year: 1910, h: 200 });
    const scale = buildScale(items.map((it) => ({ year: it.year, need: (it.h + 22) / 2 })), 0, 0);
    const placed = place(items, scale, 2);
    for (const col of [0, 1]) {
      const inCol = placed.filter((p) => p.col === col || p.col === -1).sort((a, b) => a.top - b.top);
      for (let i = 1; i < inCol.length; i++) expect(inCol[i].top).toBeGreaterThanOrEqual(inCol[i - 1].top + inCol[i - 1].item.h);
    }
    const drift = Math.max(...placed.map((p) => p.top - p.anchor));
    expect(drift).toBeLessThan(600);
  });
});

describe('quiet stretches, lanes and eras', () => {
  const card = (id: string, y: number): Card => ({ id, kind: 'event', title: id, wow: '', years: [y], places: [], zoom: 3, books: ['heirs'], sources: [], body: '' });

  it('finds long silences, clamped to 1300', () => {
    expect(quietStretches([card('a', 1200), card('b', 1312), card('c', 1500)])).toEqual([{ from: 1312, to: 1500 }]);
  });

  it('packs lives into lanes without overlap', () => {
    const l = lanes(['a', 'b', 'c'], (x) => ({ a: [0, 10], b: [5, 15], c: [11, 20] })[x] as [number, number], 5);
    expect(l.get('a')).toBe(0);
    expect(l.get('b')).toBe(1);
    expect(l.get('c')).toBe(0);
  });

  it('picks the chapter whose cards cluster nearest the year', () => {
    const ch = (id: string, years: number[], cards: string[]): Chapter => ({ id, title: id, kicker: '', years, places: [], cards, steps: [] });
    const chapters = [ch('v3', [1773, 1938], ['x']), ch('v5', [1518, 1937], ['y'])];
    const years: Record<string, number> = { x: 1840, y: 1925 };
    const centres = chapterCentres(chapters, (id) => years[id]);
    expect(chapterAt(chapters, 1925, centres)!.id).toBe('v5');
    expect(chapterAt(chapters, 1830, centres)!.id).toBe('v3');
    expect(chapterAt(chapters, 1925)!.id).toBe('v3');
  });
});

import { heroFrame } from '../src/views/story';
describe('hero map frame', () => {
  it('pads the places and never frames less than an ocean', () => {
    const [[w, s], [e, n]] = heroFrame([[-75, 40], [-74, 41]]);
    expect(e - w).toBeGreaterThanOrEqual(70);
    expect(w).toBeLessThan(-75);
    expect(n).toBeGreaterThan(41);
    expect(s).toBeLessThan(40);
    const [[nw], [ne]] = heroFrame([[-75, 40], [-74, 41]], true);
    expect(ne - nw).toBeLessThan(e - w);
  });
});

import { levelCards } from '../src/lib/descentModel';
describe('descent levels', () => {
  const mk = (id: string, zoom: number, year: number, media = false) => ({ id, zoom, years: [year], media: media ? [{}] : undefined });
  const cards = [mk('a', 1, 1500), mk('b', 3, 1510, true), mk('c', 4, 1520), mk('d', 5, 1530), mk('e', 4, 1910), mk('f', 3, 1920), mk('g', 5, 1930)];
  it('reveals more cards as the level rises', () => {
    const n = [1, 2, 3, 4, 5].map((l) => levelCards(cards, l).length);
    for (let i = 1; i < n.length; i++) expect(n[i]).toBeGreaterThanOrEqual(n[i - 1]);
    expect(n[4]).toBe(cards.length);
    expect(n[0]).toBeLessThan(n[4]);
  });
  it('keeps landmarks in every century at level 1', () => {
    const ids = levelCards(cards, 1).map((c) => c.id);
    // one landmark per century: the zoom-1 card stands for the 1500s
    expect(ids).toContain('a');
    expect(ids).not.toContain('b');
    expect(ids.some((id) => ['e', 'f', 'g'].includes(id))).toBe(true);
  });
});
