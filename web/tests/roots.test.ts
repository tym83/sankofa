import { describe, expect, it } from 'vitest';
import { buildTree, chainLine, deepest, endCards, extendLineage, fold, foldRun, longestRoots, searchArtists, suggestions, type Artist } from '../src/lib/roots';

const link = (to: string) => ({ to, claim: `to ${to}`, sources: [{ title: 'a', url: 'https://a' }, { title: 'b', url: 'https://b' }] });
const art = (id: string, name: string, links: string[], paths: string[][], extra: Partial<Artist> = {}): Artist => ({
  id,
  name,
  years: [1970],
  place: { name: 'X', lat: 0, lon: 0 },
  genre: 'Rock',
  links: links.map(link),
  paths,
  ...extra,
});

const all = [
  art('oasis', 'Oasis', ['root:the-beatles'], [['oasis', 'the-beatles', 'card:rock-n-roll'], ['oasis', 'the-beatles', 'card:rhythm-and-blues']], { aliases: ['оазис'] }),
  art('the-beatles', 'The Beatles', ['card:rock-n-roll', 'card:rhythm-and-blues'], [['the-beatles', 'card:rock-n-roll'], ['the-beatles', 'card:rhythm-and-blues']], { aliases: ['битлз'] }),
  art('metallica', 'Metallica', ['root:black-sabbath'], [['metallica', 'black-sabbath', 'card:blues']], { nameRu: 'Металлика' }),
  art('black-sabbath', 'Black Sabbath', ['card:blues'], [['black-sabbath', 'card:blues']], { aliases: ['Блэк Саббат'] }),
];
const byId = new Map(all.map((a) => [a.id, a]));

describe('roots search', () => {
  it('finds by name, Russian name and Cyrillic alias', () => {
    expect(searchArtists(all, 'metal')[0].id).toBe('metallica');
    expect(searchArtists(all, 'Металл')[0].id).toBe('metallica');
    expect(searchArtists(all, 'битл')[0].id).toBe('the-beatles');
    expect(searchArtists(all, 'beatles')[0].id).toBe('the-beatles');
    expect(searchArtists(all, 'блэк')[0].id).toBe('black-sabbath');
    expect(searchArtists(all, 'zzz')).toEqual([]);
    expect(searchArtists(all, '  ')).toEqual([]);
  });

  it('folds case, ё and diacritics', () => {
    expect(fold('Motörhead — Ёж')).toBe('motorhead еж');
  });
});

describe('roots tree', () => {
  it('merges paths by shared beginnings and keeps each link', () => {
    const t = buildTree(byId.get('oasis')!, byId);
    expect(t.ref).toBe('oasis');
    expect(t.weight).toBe(2);
    expect(t.children).toHaveLength(1);
    const beatles = t.children[0];
    expect(beatles.ref).toBe('the-beatles');
    expect(beatles.link?.to).toBe('root:the-beatles');
    expect(beatles.children.map((c) => c.ref)).toEqual(['card:rock-n-roll', 'card:rhythm-and-blues']);
    expect(beatles.children[1].link?.to).toBe('card:rhythm-and-blues');
    expect(endCards(t)).toEqual(['card:rock-n-roll', 'card:rhythm-and-blues']);
  });

  it('writes the chain as one line', () => {
    expect(chainLine(['metallica', 'black-sabbath', 'card:blues'], (r) => (r === 'card:blues' ? 'The blues' : byId.get(r)!.name))).toBe('Metallica → Black Sabbath → The blues');
  });

  it('suggests the artists with the longest chains', () => {
    expect(suggestions(all, 2).map((a) => a.id)).toEqual(['oasis', 'metallica']);
  });
});

describe('deep roots', () => {
  const cards = new Map([
    ['rock-n-roll', { id: 'rock-n-roll', roots: ['rhythm-and-blues', 'blues'] }],
    ['rhythm-and-blues', { id: 'rhythm-and-blues', roots: ['blues'] }],
    ['blues', { id: 'blues', roots: ['work-songs'] }],
    ['work-songs', { id: 'work-songs' }],
  ]);

  it('unwinds past the card through the genre roots, down to the oldest', () => {
    const t = extendLineage(buildTree(byId.get('metallica')!, byId), cards);
    expect(deepest(t)).toEqual(['metallica', 'black-sabbath', 'card:blues', 'card:work-songs']);
    const o = extendLineage(buildTree(byId.get('oasis')!, byId), cards);
    expect(deepest(o)).toEqual(['oasis', 'the-beatles', 'card:rock-n-roll', 'card:rhythm-and-blues', 'card:blues', 'card:work-songs']);
    const rr = o.children[0].children[0];
    expect(rr.children.every((c) => c.lineage)).toBe(true);
  });

  it('folds long runs of single steps', () => {
    expect(foldRun(3)).toEqual({ show: 3, hide: 0 });
    expect(foldRun(6)).toEqual({ show: 2, hide: 4 });
  });

  it('puts the deepest chains and named borrowings first', () => {
    const withSample = [...all];
    withSample[2] = { ...withSample[2], links: [{ ...withSample[2].links[0], kind: 'sample', what: 'the handclaps of X' }] };
    const top = longestRoots(withSample, cards, 2);
    expect(top[0].artist.id).toBe('oasis');
    expect(top[0].chain).toHaveLength(6);
  });
});

import { toDag } from '../src/lib/roots';
describe('roots as a graph', () => {
  const cards = new Map([
    ['rock-n-roll', { id: 'rock-n-roll', roots: ['rhythm-and-blues', 'blues'] }],
    ['rhythm-and-blues', { id: 'rhythm-and-blues', roots: ['blues'] }],
    ['blues', { id: 'blues', roots: ['work-songs'] }],
    ['work-songs', { id: 'work-songs' }],
  ]);
  it('merges shared nodes and orders each after all that leads to it', () => {
    const d = toDag(extendLineage(buildTree(byId.get('oasis')!, byId), cards));
    expect(d.order.filter((r) => r === 'card:blues')).toHaveLength(1);
    expect(d.order.filter((r) => r === 'card:work-songs')).toHaveLength(1);
    expect(d.order.indexOf('card:blues')).toBeGreaterThan(d.order.indexOf('card:rhythm-and-blues'));
    expect(d.order[d.order.length - 1]).toBe('card:work-songs');
    // the blues is reached two ways: from rock and roll and from rhythm and blues
    expect(d.incoming.get('card:blues')!.map((e) => e.from).sort()).toEqual(['card:rhythm-and-blues', 'card:rock-n-roll']);
  });
});

import { KIND_LABEL } from '../src/lib/roots';
describe('new kinds', () => {
  it('label interpolation and collaboration in both languages', () => {
    expect(KIND_LABEL.interpolation).toMatchObject({ en: 'interpolated', ru: 'цитата из песни' });
    expect(KIND_LABEL.collaboration).toMatchObject({ en: 'worked with', ru: 'работал вместе' });
  });
});
