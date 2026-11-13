import { beforeEach, describe, expect, it } from 'vitest';
import { appendPath, clearPath, edition, readPath, recordVisit } from '../src/lib/reader';
import { atlasLayers, readerCards } from '../src/lib/atlasModel';
import { CardSet } from '../src/lib/cards';
import type { Card } from '../src/lib/types';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
});

describe('reader', () => {
  it('deals an edition once and keeps it', () => {
    expect(edition(() => 0.9)).toBe('f');
    expect(edition(() => 0.1)).toBe('f');
  });

  it('records a path without repeating the same step', () => {
    expect(appendPath(['a'], 'a')).toEqual(['a']);
    recordVisit('equiano');
    recordVisit('zong');
    recordVisit('zong');
    recordVisit('equiano');
    expect(readPath()).toEqual(['equiano', 'zong', 'equiano']);
    clearPath();
    expect(readPath()).toEqual([]);
  });
});

const mk = (id: string, zoom: number, extra: Partial<Card> = {}): Card => ({
  id,
  kind: 'person',
  title: id,
  wow: 'w',
  years: [1900, 1930],
  places: [
    { name: 'Clarksdale', lat: 34.2, lon: -90.57 },
    { name: 'Chicago', lat: 41.88, lon: -87.63 },
  ],
  zoom,
  era: 'v5',
  books: ['heirs'],
  sources: [{ title: 's' }],
  body: '',
  edition: 'both',
  ...extra,
});

describe('atlas levels', () => {
  const set = new CardSet([
    mk('great-migration', 1, { kind: 'event', years: [1910, 1970] }),
    mk('blues', 3, { kind: 'genre' }),
    mk('tharpe', 4, { years: [1915, 1973] }),
    mk('record', 5, { years: [1938] }),
    mk('douglass', 4, { edition: 'm', pair: 'p', years: [1818, 1895] }),
    mk('jacobs', 4, { edition: 'f', pair: 'p', years: [1813, 1897] }),
  ]);

  it('keeps only the reader copy of paired cards', () => {
    expect(readerCards(set, 'f').map((c) => c.id)).not.toContain('douglass');
    expect(readerCards(set, 'f').map((c) => c.id)).toContain('jacobs');
  });

  it('generalises: zoom 1 shows movements, not people', () => {
    const l = atlasLayers(set, { level: 1, edition: 'm' });
    expect(l.routes.some((r) => r.id === 'mv:great-migration')).toBe(true);
    expect(l.points.find((p) => p.id === 'tharpe')!.minor).toBe(true);
    expect(l.points.find((p) => p.id === 'great-migration')!.minor).toBe(false);
  });

  it('zoom 2 aggregates regions, zoom 3 draws genres spreading', () => {
    expect(atlasLayers(set, { level: 2, edition: 'm' }).regions.length).toBeGreaterThan(0);
    const l3 = atlasLayers(set, { level: 3, edition: 'm' });
    expect(l3.routes.some((r) => r.id === 'card:blues')).toBe(true);
    expect(l3.regions).toEqual([]);
    expect(l3.points.find((p) => p.id === 'tharpe')!.minor).toBe(true);
  });

  it('zoom 3 draws a genre growing from its roots', () => {
    const g = new CardSet([
      mk('spirituals', 3, { kind: 'genre', places: [{ name: 'Georgia', lat: 32.6, lon: -83.4 }] }),
      mk('gospel', 3, { kind: 'genre', roots: ['spirituals'], places: [{ name: 'Chicago', lat: 41.88, lon: -87.63 }] }),
    ]);
    const r = atlasLayers(g, { level: 3, edition: 'm' }).routes.find((x) => x.id === 'roots:gospel');
    expect(r?.legs[0].from).toEqual([-83.4, 32.6]);
  });

  it('zoom 4 shows people, zoom 5 single documents', () => {
    expect(atlasLayers(set, { level: 4, edition: 'm' }).points.find((p) => p.id === 'tharpe')!.minor).toBe(false);
    expect(atlasLayers(set, { level: 4, edition: 'm' }).points.find((p) => p.id === 'record')!.minor).toBe(true);
    expect(atlasLayers(set, { level: 5, edition: 'm' }).points.find((p) => p.id === 'record')!.minor).toBe(false);
  });

  it('time brushing filters cards and movements', () => {
    const l = atlasLayers(set, { level: 1, from: 1800, to: 1850, edition: 'm' });
    expect(l.points.find((p) => p.id === 'tharpe')!.out).toBe(true);
    expect(l.routes.some((r) => r.id === 'mv:great-migration')).toBe(false);
    expect(l.routes.some((r) => r.id === 'mv:middle-passage')).toBe(true);
  });

  it('a focused card is always shown with its route', () => {
    const l = atlasLayers(set, { level: 1, focus: 'tharpe', edition: 'm' });
    const p = l.points.find((x) => x.id === 'tharpe')!;
    expect(p.focus && !p.minor).toBe(true);
    expect(l.routes.some((r) => r.id === 'card:tharpe' && r.flow)).toBe(true);
  });

  it('a shared path brings in the other copy', () => {
    const l = atlasLayers(set, { level: 4, edition: 'f', lit: ['douglass'] }, [set.get('douglass')!]);
    expect(l.points.some((p) => p.id === 'douglass')).toBe(true);
  });
});
