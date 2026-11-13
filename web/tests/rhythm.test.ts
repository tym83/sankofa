import { describe, expect, it } from 'vitest';
import { BELL, PARTS, demoLeases, demoVoices, drumName, exchange, parsePulse, playing, simulate, strokes } from '../src/lib/rhythm';

describe('rhythm', () => {
  it('the bell plays seven strokes in twelve pulses', () => {
    expect(BELL).toHaveLength(12);
    expect(strokes(BELL)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    for (const p of PARTS) expect(p).toHaveLength(12);
  });

  it('a fresh lease plays in time, a late one stumbles, a dead one is silent', () => {
    const fresh = playing({ node: 'a', alive: true, late: 0.1, ready: 1, notReady: 0 });
    expect(fresh).toEqual({ gain: 1, jitter: 0, drop: 0, drag: 0 });
    const late = playing({ node: 'a', alive: true, late: 0.8, ready: 1, notReady: 0 });
    expect(late.jitter).toBeGreaterThan(0);
    expect(late.drop).toBeGreaterThan(0);
    expect(late.gain).toBeLessThan(1);
    expect(playing({ node: 'a', alive: false, late: 2, ready: 0, notReady: 0 }).gain).toBe(0);
    expect(playing(undefined).gain).toBe(0);
  });

  it('calls live nodes in turn and leaves empty slots for pods that are not ready', () => {
    const voices = [
      { node: 'a', alive: true, late: 0, ready: 3, notReady: 2 },
      { node: 'dead', alive: false, late: 2, ready: 0, notReady: 4 },
      { node: 'b', alive: true, late: 0, ready: 1, notReady: 0 },
    ];
    const e0 = exchange(voices, 0)!;
    expect(e0.node).toBe('a');
    expect(e0.slots.filter(Boolean)).toHaveLength(3);
    expect(e0.slots.filter((x) => !x)).toHaveLength(2);
    expect(exchange(voices, 1)!.node).toBe('b');
    expect(exchange([{ node: 'x', alive: true, late: 0, ready: 40, notReady: 20 }], 0)!.slots).toHaveLength(6);
    expect(exchange([], 0)).toBeNull();
  });

  it('parses pulse events and ignores noise', () => {
    expect(parsePulse('{"type":"lease","node":"n1","at":"2026-11-12T10:00:00Z","leaseSeconds":40}')).toMatchObject({ type: 'lease', node: 'n1' });
    expect(parsePulse('{"type":"other"}')).toBeNull();
    expect(parsePulse('not json')).toBeNull();
  });

  it('the demo drops a node out and brings it back', () => {
    expect(demoVoices(5)[1].alive).toBe(true);
    expect(demoVoices(20)[1].alive).toBe(false);
    expect(demoVoices(40)[1].alive).toBe(true);
    expect(demoVoices(40)[2].notReady).toBeGreaterThan(0);
    expect(demoLeases(0, 30).length).toBeGreaterThan(3);
  });
});

describe('interventions and names', () => {
  const base = demoVoices(40);
  it('a broken node goes late second by second, then is declared down; its pods fall silent at once', () => {
    const t0 = 1_000_000;
    const now = simulate(base, { brokenAt: t0 }, t0 + 3000);
    expect(now[1].lateSeconds).toBe(3);
    expect(now[1].downIn).toBe(9);
    expect(now[1].alive).toBe(true);
    expect(now[1].ready).toBe(0);
    expect(playing(now[1]).jitter).toBeGreaterThan(0);
    const later = simulate(base, { brokenAt: t0 }, t0 + 13000);
    expect(later[1].alive).toBe(false);
    expect(later[1].downIn).toBe(0);
    expect(simulate(base, {}, t0)[1]).toEqual(base[1]);
  });

  it('fails two pods on another node', () => {
    const v = simulate(base, { failingAt: 0 }, 1);
    expect(v[2].notReady).toBe(base[2].notReady + 2);
  });

  it('names nodes after drums', () => {
    expect(drumName(0)).toBe('Atsimevu');
    expect(drumName(6)).toBe('Atsimevu 2');
  });
});
