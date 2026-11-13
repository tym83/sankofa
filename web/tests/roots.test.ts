import { describe, expect, it } from 'vitest';
import { buildTree, chainLine, endCards, fold, searchArtists, suggestions, type Artist } from '../src/lib/roots';

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
