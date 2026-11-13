import { describe, expect, it } from 'vitest';
import { CardSet, bookSymbols, formatYears, links, overlaps, plain, segments } from '../src/lib/cards';
import type { Card } from '../src/lib/types';

const card = (c: Partial<Card> & { id: string }): Card => ({
  kind: 'person',
  title: c.id,
  wow: 'wow',
  years: [1800],
  places: [{ name: 'Vienna', lat: 48.2, lon: 16.37 }],
  zoom: 4,
  books: ['heirs'],
  sources: [{ title: 's' }],
  body: '',
  edition: 'both',
  ...c,
});

const set = new CardSet([
  card({ id: 'douglass', edition: 'm', pair: 'freedom', body: 'See [[jacobs]].', books: ['voices'] }),
  card({ id: 'jacobs', edition: 'f', pair: 'freedom', books: ['voices'] }),
  card({ id: 'zong', kind: 'event', books: ['archives', 'voices'], body: 'Told by [[equiano|Olaudah Equiano]] and [[douglass]].', places: [{ name: 'Mississippi Delta', lat: 34, lon: -90 }] }),
  card({ id: 'equiano', body: 'The [[zong]] case.' }),
  card({ id: 'delta', kind: 'place', places: [{ name: 'The Delta', lat: 33.5, lon: -90.5 }] }),
]);

describe('links', () => {
  it('splits text into runs and links like pkg/card', () => {
    expect(segments('Told by [[equiano|Olaudah Equiano]] and [[zong]].')).toEqual([
      { text: 'Told by ' },
      { target: 'equiano', text: 'Olaudah Equiano', explicit: true },
      { text: ' and ' },
      { target: 'zong', text: 'zong', explicit: false },
      { text: '.' },
    ]);
    expect(links('[[a]] [[b-2|B]] [[Not-valid]]')).toEqual(['a', 'b-2']);
    expect(plain('By [[equiano|Equiano]] on the [[zong]]')).toBe('By Equiano on the zong');
  });

  it('marks links with the book symbols of their target', () => {
    expect(bookSymbols(set.get('zong')!.books)).toBe('▤❝');
  });

  it('computes backlinks when the export has none', () => {
    expect(set.backlinks('zong')).toEqual(['equiano']);
    expect(set.backlinks('douglass')).toEqual(['zong']);
  });
});

describe('editions', () => {
  it('resolves paired cards to the reader edition like ForEdition', () => {
    expect(set.forEdition('douglass', 'f')!.id).toBe('jacobs');
    expect(set.forEdition('douglass', 'm')!.id).toBe('douglass');
    expect(set.forEdition('jacobs', 'm')!.id).toBe('douglass');
    expect(set.forEdition('zong', 'f')!.id).toBe('zong');
    expect(set.forEdition('douglass', '')!.id).toBe('douglass');
    expect(set.forEdition('nope', 'f')).toBeUndefined();
  });

  it('finds the other copy', () => {
    expect(set.partner('jacobs')!.id).toBe('douglass');
    expect(set.partner('zong')).toBeUndefined();
  });

  it('defaults a missing edition to both', () => {
    expect(new CardSet([{ ...card({ id: 'x' }), edition: undefined }]).get('x')!.edition).toBe('both');
  });
});

describe('places and time', () => {
  it('resolves a place key by card id, slug, or a word of the slug', () => {
    expect(set.resolvePlace('delta')!.name).toBe('The Delta');
    expect(set.resolvePlace('mississippi-delta')!.name).toBe('Mississippi Delta');
    expect(set.resolvePlace('vienna')!.name).toBe('Vienna');
    expect(set.resolvePlace('atlantis')).toBeUndefined();
  });

  it('filters by overlapping years', () => {
    const c = { years: [1900, 1935] };
    expect(overlaps(c, 1930, 1940)).toBe(true);
    expect(overlaps(c, 1936, 1950)).toBe(false);
    expect(overlaps({ years: [1781] }, 1781)).toBe(true);
    expect(overlaps(c)).toBe(true);
  });

  it('formats years', () => {
    expect(formatYears([1778, 1860])).toBe('1778–1860');
    expect(formatYears([1781])).toBe('1781');
    expect(formatYears([1781, 1781])).toBe('1781');
  });
});
