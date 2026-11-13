import { describe, expect, it } from 'vitest';
import { cardYaml } from '../src/lib/cardYaml';
import type { Card } from '../src/lib/types';

describe('cardYaml', () => {
  it('folds a long wow into lines no wider than the block', () => {
    const wow = 'His bestselling life story opens with a subscriber list headed by the Prince of Wales, yet two official records give his birthplace as Carolina, not Africa.';
    const c = { id: 'x', kind: 'person', title: 'X', wow, years: [1766, 1794], places: [{ name: 'London', lat: 51.5, lon: -0.1 }], zoom: 4, books: ['voices'], sources: [], body: 'b' } as unknown as Card;
    const y = cardYaml(c);
    expect(y).toContain('  wow: >-\n    His bestselling');
    const folded = y.split('\n').filter((l) => l.startsWith('    ') && !l.startsWith('    url'));
    expect(folded.every((l) => l.length <= 72)).toBe(true);
    expect(folded.slice(0, 3).map((l) => l.trim()).join(' ')).toBe(wow);
  });
});
