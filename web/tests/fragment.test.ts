import { describe, expect, it } from 'vitest';
import { formatFragment, parseFragment, safeParse, slug, terminalCommand } from '../src/lib/fragment';

// Vectors produced by pkg/atlas (Go): Point.Fragment(), Slug() and Parse().
const GO_FRAGMENTS: [Parameters<typeof formatFragment>[0], string][] = [
  [{ from: 1900, to: 1935, place: 'delta', zoom: 3, focus: 'blues' }, 'focus=blues&place=delta&t=1900-1935&zoom=3'],
  [{ from: 1781 }, 't=1781'],
  [{ from: 1781, to: 1781, focus: 'zong' }, 'focus=zong&t=1781'],
  [{ place: 'Rio de Janeiro', zoom: 2 }, 'place=Rio+de+Janeiro&zoom=2'],
  [{ focus: 'genre/blues' }, 'focus=genre%2Fblues'],
  [{ path: ['equiano', 'zong', 'zong-philip'] }, 'path=equiano.zong.zong-philip'],
  [{ place: "Saint-Domingue & Haïti!*'()" }, 'place=Saint-Domingue+%26+Ha%C3%AFti%21%2A%27%28%29'],
];

const GO_SLUGS: [string, string][] = [
  ['Mississippi Delta', 'mississippi-delta'],
  ['Salvador da Bahia', 'salvador-da-bahia'],
  ['Saint-Domingue (Haiti)', 'saint-domingue-haiti'],
  ['Fort-de-France', 'fort-de-france'],
  ['Île de Gorée', 'le-de-gor-e'],
  ['  New  Orleans  ', 'new-orleans'],
];

describe('fragment', () => {
  it.each(GO_FRAGMENTS)('encodes %j like Go', (p, want) => {
    expect(formatFragment(p)).toBe(want);
  });

  it.each(GO_FRAGMENTS)('round-trips %j', (p, frag) => {
    expect(formatFragment(parseFragment('http://museum.local/#' + frag))).toBe(frag);
  });

  it('parses the example from the concept', () => {
    expect(parseFragment('#t=1900-1935&place=delta&zoom=3&focus=blues')).toEqual({ from: 1900, to: 1935, place: 'delta', zoom: 3, focus: 'blues' });
  });

  it('rejects what Go rejects', () => {
    for (const bad of ['zoom=9', 'zoom=0', 't=abc', 't=1900-x', 'a=%zz', 'x;y']) {
      expect(() => parseFragment(bad), bad).toThrow();
    }
    expect(parseFragment('t=1900-&zoom=1')).toEqual({ from: 1900, zoom: 1 });
  });

  it('takes the first value of a repeated key, like url.Values.Get', () => {
    expect(parseFragment('focus=a&focus=b').focus).toBe('a');
  });

  it('ignores keys it does not know, so ch= can live next to the atlas', () => {
    expect(parseFragment('ch=v3&focus=zong')).toEqual({ focus: 'zong' });
  });

  it('never throws from safeParse', () => {
    expect(safeParse('zoom=77')).toEqual({});
  });

  it.each(GO_SLUGS)('slugs %j like atlas.Slug', (name, want) => {
    expect(slug(name)).toBe(want);
  });

  it('builds the terminal command', () => {
    expect(terminalCommand({ from: 1781, focus: 'zong', zoom: 5 })).toBe("sankofa atlas --at 'focus=zong&t=1781&zoom=5'");
  });
});
