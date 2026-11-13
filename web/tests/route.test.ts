import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute, screenOf } from '../src/lib/route';

describe('route', () => {
  it('opens the descent at a year', () => {
    const r = parseRoute('#t=1803&view=descent');
    expect(r).toEqual({ point: { from: 1803 }, view: 'descent', ch: undefined });
    expect(screenOf(r)).toBe('descent');
    expect(formatRoute(r)).toBe('t=1803&view=descent');
  });

  it('keeps a focused card inside the descent', () => {
    expect(formatRoute({ point: { from: 1781, focus: 'zong' }, view: 'descent' })).toBe('focus=zong&t=1781&view=descent');
  });

  it('routes terminal links to the atlas and chapters to the story', () => {
    expect(screenOf(parseRoute('focus=blues&place=delta&t=1900-1935&zoom=3'))).toBe('atlas');
    expect(screenOf(parseRoute('ch=v3&focus=douglass'))).toBe('story');
    expect(screenOf(parseRoute('focus=zong'))).toBe('story');
    expect(screenOf(parseRoute(''))).toBe('story');
  });

  it('opens the listening room', () => {
    expect(screenOf(parseRoute('view=listen'))).toBe('listen');
    expect(formatRoute({ point: {}, view: 'listen' })).toBe('view=listen');
  });

  it('opens the atlas and the engine room by view', () => {
    expect(screenOf(parseRoute('view=atlas'))).toBe('atlas');
    expect(screenOf(parseRoute('view=engine'))).toBe('engine');
  });

  it('roots the roots view on an artist', () => {
    const r = parseRoute('#view=roots&artist=metallica&lang=ru');
    expect(screenOf(r)).toBe('roots');
    expect(r.artist).toBe('metallica');
    expect(formatRoute({ point: {}, view: 'roots', artist: 'metallica' })).toBe('view=roots&artist=metallica');
  });

  it('ignores unknown views', () => {
    expect(parseRoute('view=nope').view).toBeUndefined();
  });
});
