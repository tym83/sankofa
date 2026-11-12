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
