// The listening room's score, kept free of Web Audio so it can be tested:
// the 12/8 bell timeline, the node parts, how a late heartbeat bends a part,
// and how call-and-response is laid out over the cycle.

/** The West African standard bell pattern: seven strokes in twelve pulses. */
export const BELL = 'x.x.xx.x.x.x';
export const PULSES = 12;

/** Interlocking drum parts over the same twelve pulses, one per node. */
export const PARTS = ['x.....x.....', '..x..x..x..x', '.xx..xx..xx.', 'x..x.x..x.x.', '...x.....xx.', 'x.x...x.x...', '.x..x..x..x.', '..xx....xx..'];

/** Drum tunings (Hz), low to high, so neighbouring nodes do not clash. */
export const TUNINGS = [98, 131, 165, 110, 147, 196, 123, 175];

export function strokes(pattern: string): number[] {
  return [...pattern].flatMap((c, i) => (c === 'x' ? [i] : []));
}

export interface Voice {
  node: string;
  alive: boolean;
  late: number; // seconds since lease renewal as a share of the lease duration
  ready: number;
  notReady: number;
}

export interface PulseEvent {
  type: 'voices' | 'lease';
  at?: string;
  node?: string;
  voices?: Voice[];
  leaseSeconds?: number;
}

/** Parse one SSE data line; unknown or broken data is ignored. */
export function parsePulse(data: string): PulseEvent | null {
  try {
    const e = JSON.parse(data);
    if (e && (e.type === 'voices' || e.type === 'lease')) return e as PulseEvent;
  } catch {
    /* ignore */
  }
  return null;
}

export interface Playing {
  /** 0 = silent */
  gain: number;
  /** seconds of random timing error per stroke */
  jitter: number;
  /** chance that a stroke is dropped */
  drop: number;
  /** a stumbling part also slows against the bell, in pulses per cycle */
  drag: number;
}

/**
 * How a node plays given its heartbeat: fresh leases play in time; as the
 * renewal runs late the part drifts and stumbles; a dead lease is silence.
 * Kubelet renews at a quarter of the duration, so up to 0.3 is healthy.
 */
export function playing(v: Voice | undefined): Playing {
  if (!v || !v.alive) return { gain: 0, jitter: 0, drop: 1, drag: 0 };
  const over = Math.max(0, Math.min(1, (v.late - 0.3) / 0.7));
  return {
    gain: 1 - over * 0.45,
    jitter: over * 0.09,
    drop: over * 0.45,
    drag: over * 0.6,
  };
}

export interface Exchange {
  node: string;
  /** one entry per answer slot: true = a ready pod answers, false = silence */
  slots: boolean[];
}

/** Up to this many answer slots fit in the second half of a cycle. */
export const SLOTS = 6;

/**
 * Call-and-response: each cycle calls one live node in turn; its pods answer
 * in the slots that follow. With more pods than slots the shares are kept.
 */
export function exchange(voices: Voice[], cycle: number): Exchange | null {
  const live = voices.filter((v) => v.alive && v.ready + v.notReady > 0);
  if (!live.length) return null;
  const v = live[cycle % live.length];
  const total = v.ready + v.notReady;
  const n = Math.min(SLOTS, total);
  const ready = total <= SLOTS ? v.ready : Math.round((v.ready / total) * n);
  const slots = Array.from({ length: n }, (_, i) => i < ready);
  // Spread the silent slots instead of bunching them at the end.
  const mixed: boolean[] = [];
  const yes = slots.filter(Boolean).length;
  for (let i = 0; i < n; i++) mixed.push(Math.floor(((i + 1) * yes) / n) > Math.floor((i * yes) / n));
  return { node: v.node, slots: mixed };
}

/**
 * A recorded demo, used when /pulse is not reachable: three nodes over one
 * minute. One drifts late, drops out and comes back; one has pods failing
 * readiness for a while.
 */
export function demoVoices(t: number): Voice[] {
  const s = ((t % 60) + 60) % 60;
  const b = s < 18 ? { alive: true, late: 0.1 + s * 0.035 } : s < 30 ? { alive: false, late: 1.4 } : { alive: true, late: 0.12 };
  return [
    { node: 'control-plane', alive: true, late: 0.08, ready: 4, notReady: 0 },
    { node: 'worker-1', alive: b.alive, late: b.late, ready: b.alive ? 3 : 0, notReady: b.alive ? 0 : 3 },
    { node: 'worker-2', alive: true, late: 0.15, ready: s > 35 && s < 50 ? 2 : 5, notReady: s > 35 && s < 50 ? 3 : 0 },
  ];
}

/** Lease renewals in the demo: every ten seconds per live node, staggered. */
export function demoLeases(from: number, to: number): { node: string; at: number }[] {
  const out: { node: string; at: number }[] = [];
  for (let t = Math.ceil(from); t < to; t++) {
    demoVoices(t).forEach((v, i) => {
      if (v.alive && (t + i * 3) % 10 === 0) out.push({ node: v.node, at: t });
    });
  }
  return out;
}

/** Drum names of an Ewe ensemble, given to nodes in order; the bell is the gankogui. */
export const DRUMS = ['Atsimevu', 'Sogo', 'Kidi', 'Kagan', 'Totodzi', 'Kroboto'];

export function drumName(i: number): string {
  const base = DRUMS[i % DRUMS.length];
  return i < DRUMS.length ? base : `${base} ${Math.floor(i / DRUMS.length) + 1}`;
}

/** Seconds a stopped node takes to be declared down in the simulation. */
export const GRACE = 12;

export interface Sim {
  /** ms timestamp when the reader broke a node */
  brokenAt?: number;
  /** ms timestamp when the reader failed two pods */
  failingAt?: number;
}

export interface SimVoice extends Voice {
  /** seconds since the last heartbeat, while a broken node is still counted */
  lateSeconds?: number;
  /** seconds left until the broken node is declared down */
  downIn?: number;
  broken?: boolean;
  failing?: number;
  /** pods this node took over from a node declared down */
  adopted?: number;
  /** a node declared down whose pods have moved away */
  evicted?: boolean;
}

/** Seconds after "declared down" when the pods are moved to surviving nodes. */
export const MOVE_AFTER = 3;

/** Which node the reader's actions touch: never the first (the control plane). */
export function simTargets(n: number): { broken: number; failing: number } {
  return { broken: n > 1 ? 1 : 0, failing: n > 2 ? 2 : n - 1 };
}

/**
 * The reader's interventions on top of the live or recorded voices: a broken
 * node stops renewing at once, its heartbeat grows late second by second and
 * after GRACE seconds it is declared down; its pods stop answering at once.
 * Failing pods stop answering at once.
 */
export function simulate(base: Voice[], sim: Sim, now: number): SimVoice[] {
  const out: SimVoice[] = base.map((v) => ({ ...v }));
  const tg = simTargets(out.length);
  if (sim.brokenAt !== undefined && out[tg.broken]) {
    const v = out[tg.broken];
    const s = Math.max(0, (now - sim.brokenAt) / 1000);
    const total = v.ready + v.notReady;
    Object.assign(v, { broken: true, lateSeconds: Math.floor(s), downIn: Math.max(0, Math.ceil(GRACE - s)), late: 0.3 + s / GRACE, alive: s < GRACE, ready: 0, notReady: total });
    // Shortly after the node is declared down its pods start again on the
    // surviving nodes (in a real cluster: after the eviction timeout).
    if (s >= GRACE + MOVE_AFTER) {
      const survivors = out.filter((x, i) => i !== tg.broken && x.alive);
      survivors.forEach((x, i) => {
        const n = Math.floor(total / survivors.length) + (i < total % survivors.length ? 1 : 0);
        x.ready += n;
        x.adopted = n;
      });
      if (survivors.length) Object.assign(v, { notReady: 0, evicted: true });
    }
  }
  if (sim.failingAt !== undefined && out[tg.failing] && !out[tg.failing].broken) {
    const v = out[tg.failing];
    const n = Math.min(2, v.ready);
    v.ready -= n;
    v.notReady += n;
    v.failing = n;
  }
  return out;
}

export interface Pod {
  /** stable across moves: "<home node>#<n>" */
  id: string;
  /** index of the node it is on now */
  at: number;
  ok: boolean;
}

/**
 * Every pod as a dot, so a move can be drawn: pods keep their identity when
 * they leave a node declared down for the surviving ones.
 */
export function podsOf(voices: SimVoice[]): Pod[] {
  const out: Pod[] = [];
  const movers: Pod[] = [];
  voices.forEach((v, k) => {
    const own = v.ready - (v.adopted ?? 0) + v.notReady;
    const ownTotal = v.evicted ? 0 : own;
    if (v.evicted) {
      // its pods are listed with the nodes that adopted them
      return;
    }
    for (let i = 0; i < ownTotal; i++) out.push({ id: `${v.node}#${i}`, at: k, ok: i < v.ready - (v.adopted ?? 0) });
  });
  const gone = voices.findIndex((v) => v.evicted);
  if (gone >= 0) {
    let n = 0;
    voices.forEach((v, k) => {
      for (let i = 0; i < (v.adopted ?? 0); i++) movers.push({ id: `${voices[gone].node}#${n++}`, at: k, ok: true });
    });
  }
  return [...out, ...movers];
}
