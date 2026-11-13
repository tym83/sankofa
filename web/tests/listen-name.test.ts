import { describe, expect, it } from 'vitest';
import { shortName } from '../src/views/listen';

describe('shortName', () => {
  it('keeps the part that tells nodes apart', () => {
    const all = ['kubernetes-museum-md0-htprj-z9txf', 'kubernetes-museum-md0-htprj-98qkw'];
    expect(shortName(all[0], all)).toBe('z9txf');
  });
  it('keeps demo names', () => {
    expect(shortName('worker-1', ['worker-1', 'worker-2', 'control-plane'])).toBe('worker-1');
  });
});
