import { describe, expect, it } from 'vitest';
import { mediaSrc, setVariants } from '../src/lib/media';
import { firstBigNumber, qualifierOf } from '../src/views/signature';

const app = { media: (f: string) => `media/${f}` };

describe('media variants', () => {
  it('uses the original when there are no variants', () => {
    setVariants({});
    expect(mediaSrc(app, 'a.jpg')).toEqual({ src: 'media/a.jpg' });
  });
  it('picks the smallest variant that covers the width and lists all', () => {
    setVariants({ 'a.jpg': [480, 960] }, { 'a.jpg': 1800 });
    const r = mediaSrc(app, 'a.jpg', [600]);
    expect(r.src).toBe('media/w960/a.jpg');
    expect(r.srcset).toBe('media/w480/a.jpg 480w, media/w960/a.jpg 960w, media/a.jpg 1800w');
  });
});

describe('signature numbers', () => {
  it('reads the number a card already states', () => {
    expect(firstBigNumber('lists the names of almost 100,000 Africans')).toBe(100000);
    expect(firstBigNumber('no numbers here, 1781')).toBeUndefined();
    expect(qualifierOf('A free database lists nearly 100,000 Africans')).toBe('nearly');
    expect(qualifierOf('lists 100,000 names')).toBeUndefined();
  });
});

import { shortLabel } from '../src/views/map';
describe('map labels', () => {
  it('keep the name and cut at a word', () => {
    expect(shortLabel('Partus sequitur ventrem: Virginia, 1662', 40)).toBe('Partus sequitur ventrem');
    expect(shortLabel('Joseph Bologne, Chevalier de Saint-Georges', 40)).toBe('Joseph Bologne');
    expect(shortLabel('Dahomey the Aro and the African side of the trade', 22)).toBe('Dahomey the Aro and…');
  });
});
