import { describe, expect, it } from 'vitest';
import { segments } from '../src/lib/cards';

describe('segments', () => {
  it('marks explicit links even when the text equals the id', () => {
    const s = segments('the [[blues|blues]] and [[jazz]]');
    expect(s[1]).toEqual({ target: 'blues', text: 'blues', explicit: true });
    expect(s[3]).toEqual({ target: 'jazz', text: 'jazz', explicit: false });
  });
});
