import { describe, expect, it } from 'vitest';
import { buildGraph, grewFrom, headline, layout, reach } from '../src/lib/rootsMap';
import type { Artist } from '../src/lib/roots';

const art = (id: string, year: number, links: [string, string?][]): Artist => ({
  id,
  name: id,
  years: [year],
  place: { name: 'x', lat: 0, lon: 0 },
  genre: 'g',
  links: links.map(([to, kind]) => ({ to, kind: kind as never, claim: 'c', sources: [] })),
  paths: [],
});
const cards = new Map([
  ['rock-n-roll', { id: 'rock-n-roll', title: 'Rock and roll', years: [1951], roots: ['blues'] }],
  ['blues', { id: 'blues', title: 'The blues', years: [1900], roots: ['work-songs'] }],
  ['work-songs', { id: 'work-songs', title: 'Work songs', years: [1790] }],
  ['gospel', { id: 'gospel', title: 'Gospel', years: [1930] }],
]);
const artists = [
  art('oasis', 1991, [['root:beatles', 'influence']]),
  art('beatles', 1960, [['card:rock-n-roll', 'cover']]),
  art('sabbath', 1968, [['card:blues', 'member']]),
  art('choir', 1980, [['card:gospel']]),
];

describe('music map', () => {
  const g = buildGraph(artists, cards, (a) => a.name);

  it('joins artists, cards and the genre lineage into one graph', () => {
    expect(g.byId.has('card:work-songs')).toBe(true);
    expect(g.edges.find((e) => e.from === 'card:rock-n-roll')?.kind).toBe('lineage');
    expect(g.edges.find((e) => e.from === 'choir')?.kind).toBe('unknown');
  });

  it('counts who stands on what and lights paths both ways', () => {
    expect(g.byId.get('card:blues')!.support).toBe(3);
    expect(g.byId.get('beatles')!.support).toBe(1);
    expect([...reach(g, 'oasis')]).toEqual(['oasis', 'beatles', 'card:rock-n-roll', 'card:blues', 'card:work-songs']);
    expect(grewFrom(g, 'card:blues')).toEqual(new Set(['card:blues', 'card:rock-n-roll', 'sabbath', 'beatles', 'oasis']));
  });

  it('finds the headline root', () => {
    const hl = headline(g);
    expect(hl.total).toBe(4);
    expect(hl.root?.id).toBe('card:work-songs');
    expect(hl.count).toBe(3);
  });

  it('lays out time from bottom (old) to top (new), the same every time', () => {
    layout(g, 800, 1200, [1780, 2026]);
    const y = (id: string) => g.byId.get(id)!.y!;
    expect(y('card:work-songs')).toBeGreaterThan(y('card:blues'));
    expect(y('card:blues')).toBeGreaterThan(y('oasis'));
    const first = g.nodes.map((n) => Math.round(n.x!));
    const g2 = buildGraph(artists, cards, (a) => a.name);
    layout(g2, 800, 1200, [1780, 2026]);
    expect(g2.nodes.map((n) => Math.round(n.x!))).toEqual(first);
  });
});
