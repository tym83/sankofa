import { describe, expect, it } from 'vitest';
import { BELL, GRACE, MOVE_AFTER, REBALANCE_EVERY, mend, roomState, PARTS, demoLeases, demoVoices, drumName, exchange, parsePulse, playing, podsOf, simulate, strokes } from '../src/lib/rhythm';

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

  it('the demo is a steady healthy cluster; changes come from the reader', () => {
    for (const t of [5, 20, 40]) expect(demoVoices(t).every((v) => v.alive && v.notReady === 0)).toBe(true);
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

  it('after the node is declared down its pods move to the surviving nodes, keeping who they are', () => {
    const t0 = 1_000_000;
    const before = podsOf(simulate(base, {}, t0));
    const moved = simulate(base, { brokenAt: t0 }, t0 + (GRACE + MOVE_AFTER + 1) * 1000);
    expect(moved[1].evicted).toBe(true);
    expect(moved[0].adopted! + moved[2].adopted!).toBe(base[1].ready + base[1].notReady);
    const after = podsOf(moved);
    expect(after).toHaveLength(before.length);
    expect(new Set(after.map((p) => p.id))).toEqual(new Set(before.map((p) => p.id)));
    expect(after.filter((p) => p.id.startsWith(`${base[1].node}#`)).every((p) => p.at !== 1 && p.ok)).toBe(true);
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

describe('one room state', () => {
  const base = demoVoices(40);
  const t0 = 1_000_000;
  it('counts a late node as not playing and says it is late', () => {
    const st = roomState(base, { brokenAt: t0 }, t0 + 3000);
    expect(st.playing).toBe(base.length - 1);
    expect(st.late).toEqual([base[1].node]);
  });
  it('after a mend the pods stay put and come back one at a time', () => {
    const moved = t0 + (GRACE + MOVE_AFTER + 1) * 1000;
    const sim = mend({ brokenAt: t0 }, moved);
    expect(sim.mendedAt).toBe(moved);
    const total = base[1].ready + base[1].notReady;
    const now = roomState(base, sim, moved);
    expect(now.voices[1].ready).toBe(0);
    expect(now.voices[1].rebalancing).toBe(true);
    const later = roomState(base, sim, moved + REBALANCE_EVERY * 1000 * 2 + 10);
    expect(later.voices[1].ready).toBe(2);
    const done = roomState(base, sim, moved + REBALANCE_EVERY * 1000 * (total + 1));
    expect(done.voices[1].ready).toBe(total);
    expect(done.voices[1].rebalancing).toBe(false);
  });
  it('a mend before the move simply resumes the node', () => {
    expect(mend({ brokenAt: t0 }, t0 + 2000).mendedAt).toBeUndefined();
  });
});

describe('one clock for a stopped node', () => {
  it('counts whole seconds so late + left is always the grace, and down comes exactly at the end', () => {
    const base = demoVoices(0);
    for (const ms of [0, 999, 1000, 5500, 11000, 11999]) {
      const v = simulate(base, { brokenAt: 0 }, ms).find((x) => x.broken)!;
      expect(v.alive).toBe(true);
      expect((v.lateSeconds ?? 0) + (v.downIn ?? 0)).toBe(GRACE);
    }
    const down = simulate(base, { brokenAt: 0 }, GRACE * 1000).find((x) => x.broken)!;
    expect(down.alive).toBe(false);
    expect(down.downIn).toBe(0);
  });
});
