// The listening room: the live cluster played with Web Audio. The control
// plane keeps the 12/8 bell timeline, each node is a drum with its own part
// driven by its Lease, and ready pods answer the cluster's call.
import type { App } from '../app';
import { richText } from '../app';
import { h, reducedMotion, svgIcon } from '../lib/dom';
import { count, pick, t } from '../lib/i18n';
import { BELL, PARTS, PULSES, SLOTS, TUNINGS, demoLeases, demoWith, drumName, exchange, type DemoTweaks, parsePulse, playing, strokes, type Exchange, type Voice } from '../lib/rhythm';

const PULSE = 0.2; // seconds per pulse: one 12/8 cycle is 2.4 s
const AHEAD = 0.15;
const CALL = [392, 440, 523.25];
const ANSWER = [329.63, 293.66, 329.63, 261.63, 293.66, 329.63];
const NS = 'http://www.w3.org/2000/svg';

type Mode = 'connecting' | 'live' | 'demo' | 'stale';

interface Cue {
  at: number;
  kind: 'bell' | 'node' | 'call' | 'answer' | 'gap';
  node?: string;
  pulse?: number;
  slot?: number;
  accent?: boolean;
}

/** Where the voices come from: Griot's /pulse, or the recorded demo. */
class Source {
  mode: Mode = 'connecting';
  voices: Voice[] = [];
  private es?: EventSource;
  private started = 0;
  private lastData = 0;
  private demoTimer = 0;
  private lastDemo = 0;
  onChange?: () => void;
  onLease?: (node: string) => void;
  tweaks: DemoTweaks = {};
  retick?: () => void;

  start(): void {
    this.started = performance.now();
    if (!('EventSource' in window)) return this.demo();
    try {
      this.es = new EventSource('pulse');
    } catch {
      return this.demo();
    }
    this.es.onmessage = (m) => {
      const e = parsePulse(m.data);
      if (!e) return;
      this.lastData = performance.now();
      if (this.mode !== 'live') {
        this.mode = 'live';
        this.onChange?.();
      }
      if (e.type === 'voices' && e.voices) {
        this.voices = e.voices;
        this.onChange?.();
      } else if (e.type === 'lease' && e.node) this.onLease?.(e.node);
    };
    this.es.onerror = () => {
      if (this.mode === 'connecting' || (this.mode !== 'live' && performance.now() - this.started > 2500)) this.demo();
    };
    window.setTimeout(() => this.mode === 'connecting' && this.demo(), 4000);
    // A live stream that goes quiet is played as silence, not as old news.
    window.setInterval(() => {
      if (this.mode === 'live' && performance.now() - this.lastData > 15000) {
        this.mode = 'stale';
        this.voices = this.voices.map((v) => ({ ...v, alive: false }));
        this.onChange?.();
      }
    }, 3000);
  }

  private demo(): void {
    this.es?.close();
    if (this.mode === 'demo') return;
    this.mode = 'demo';
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      this.voices = demoWith(t, this.tweaks);
      for (const l of demoLeases(this.lastDemo, t)) this.onLease?.(l.node);
      this.lastDemo = t;
      this.onChange?.();
    };
    tick();
    this.retick = tick;
    this.demoTimer = window.setInterval(tick, 1000);
    this.onChange?.();
  }

  stop(): void {
    this.es?.close();
    clearInterval(this.demoTimer);
    this.mode = 'connecting';
  }
}

/** Synthesised instruments: no samples, nothing to download. */
class Ensemble {
  readonly ctx: AudioContext;
  private out: GainNode;
  private noise: AudioBuffer;

  constructor() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(comp).connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  private env(t: number, peak: number, decay: number, attack = 0.002): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(this.out);
    return g;
  }

  /** The iron bell: inharmonic partials, a hard strike, a short ring. */
  bell(t: number, accent: boolean): void {
    const g = this.env(t, accent ? 0.32 : 0.22, 0.42);
    for (const [ratio, amp] of [
      [1, 1],
      [2.4, 0.45],
      [3.9, 0.22],
    ]) {
      const o = this.ctx.createOscillator();
      const a = this.ctx.createGain();
      o.frequency.value = 1180 * ratio;
      a.gain.value = amp;
      o.connect(a).connect(g);
      o.start(t);
      o.stop(t + 0.45);
    }
  }

  /** A membrane drum: falling pitch plus a slap of noise. */
  drum(t: number, f: number, gain: number, accent: boolean): void {
    const g = this.env(t, (accent ? 0.95 : 0.6) * gain, accent ? 0.5 : 0.34);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * (accent ? 2.1 : 1.7), t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.55);
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 6;
    bp.Q.value = 1.2;
    const ng = this.env(t, 0.18 * gain * (accent ? 1.6 : 1), 0.04);
    n.connect(bp).connect(ng);
    n.start(t);
    n.stop(t + 0.06);
  }

  /** A hummed voice for the call and the answers. */
  voice(t: number, f: number, gain: number): void {
    const g = this.env(t, gain, 0.34, 0.025);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    lp.connect(g);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const vib = this.ctx.createOscillator();
    const vg = this.ctx.createGain();
    vib.frequency.value = 5.5;
    vg.gain.value = f * 0.012;
    vib.connect(vg).connect(o.frequency);
    o.connect(lp);
    o.start(t);
    vib.start(t);
    o.stop(t + 0.38);
    vib.stop(t + 0.38);
  }
}

export class Listen {
  readonly el: HTMLElement;
  private source = new Source();
  private ens?: Ensemble;
  private timer = 0;
  private raf = 0;
  private nextAt = 0;
  private pulse = 0;
  private cycle = 0;
  private current: Exchange | null = null;
  private accents = new Set<string>();
  private cues: Cue[] = [];
  private playingNow = false;
  private status: HTMLElement;
  private badge: HTMLElement;
  private button: HTMLButtonElement;
  private svg: SVGSVGElement;
  private gNodes: SVGGElement;
  private hand: SVGLineElement;
  private bellDots: SVGCircleElement[] = [];
  private callRow: HTMLElement;
  private demoRow: HTMLElement;
  onClose?: () => void;

  constructor(app: App) {
    this.badge = h('span.l-badge');
    this.status = h('p.l-status', { 'aria-live': 'polite' });
    this.button = h('button.btn.primary.l-start', { onclick: () => this.toggle() }, t('Start listening')) as HTMLButtonElement;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('viewBox', '0 0 600 600');
    this.svg.setAttribute('class', 'l-ring');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', t('The bell timeline in the centre and one drum per node around it'));
    this.hand = document.createElementNS(NS, 'line');
    this.gNodes = document.createElementNS(NS, 'g');
    this.drawRing();
    this.callRow = h('div.l-call', { 'aria-hidden': 'true' });
    const tweak = (key: 'broken' | 'failing', on: [string, string], off: [string, string]) => {
      const b = h('button.btn', {
        'aria-pressed': 'false',
        onclick: () => {
          this.source.tweaks[key] = !this.source.tweaks[key];
          b.setAttribute('aria-pressed', String(!!this.source.tweaks[key]));
          b.textContent = pick(this.source.tweaks[key] ? { en: off[0], ru: off[1] } : { en: on[0], ru: on[1] });
          this.source.retick?.();
        },
      }, pick({ en: on[0], ru: on[1] }));
      return b;
    };
    this.demoRow = h(
      'div.l-demo',
      {},
      tweak('broken', ['Break a node', 'Сломать узел'], ['Mend the node', 'Починить узел']),
      tweak('failing', ['Fail two pods', 'Уронить два пода'], ['Heal the pods', 'Поднять поды']),
    );
    const talk = app.set.get('talking-drums') ? `[[talking-drums|${t('talking drums')}]]` : t('talking drums');
    const spirit = app.set.get('spirituals') ? `[[spirituals|${t('the spirituals')}]]` : t('the spirituals');
    const text = h(
      'div.l-text',
      {},
      h('div.kicker', {}, t('The cluster, played live')),
      h('h2', {}, t('The listening room')),
      h(
        'p.l-plain',
        {},
        pick({
          en: 'Every machine in the museum’s cluster plays a drum, and a bell keeps time for all of them. While a machine is healthy, its drum keeps up with the bell; when its heartbeat comes late, the drum stumbles; when it stops, you hear the gap it leaves. Every other bar the cluster calls, and the programs running on a machine answer. A program that cannot answer leaves a silence, and you can hear it.',
          ru: 'Каждая машина в кластере музея играет на барабане, а колокол держит для всех общий ритм. Пока машина здорова, её барабан идёт вровень с колоколом; когда её сердцебиение запаздывает, барабан сбивается; когда машина останавливается, в ансамбле слышна дыра. Через такт кластер зовёт, и программы, работающие на машине, откликаются. Программа, которая не может ответить, оставляет тишину — и её слышно.',
        }),
      ),
      h('div.l-controls', {}, this.button, this.badge),
      this.demoRow,
      this.status,
      h(
        'p.l-lede',
        {},
        h('b', {}, pick({ en: 'Technically. ', ru: 'Технически. ' })),
        richText(
          app,
          t('The bell is the control plane, keeping the West African 12/8 timeline of seven strokes in twelve pulses that every drum in the ensemble locks to, the way {talk} carry speech in rhythm. Each node is a drum with its own interlocking part: it plays while its Lease is fresh, stumbles as heartbeats come late, and falls silent when the node stops. Then the cluster calls and every ready pod answers, as in {spirit}; a pod that is not ready leaves its answer empty, and you hear the gap.', { talk, spirit }),
        ),
      ),
      h(
        'ul.l-legend',
        {},
        h('li', {}, h('i.k-bell'), pick({ en: 'Bell: the machine that runs the cluster (control plane)', ru: 'Колокол: машина, которая управляет кластером (control plane)' })),
        h('li', {}, h('i.k-node'), pick({ en: 'Drum: a machine of the cluster, while it signals it is alive', ru: 'Барабан: машина кластера, пока она подаёт сигнал жизни' })),
        h('li', {}, h('i.k-late'), pick({ en: 'Wavering: its heartbeat is late', ru: 'Дрожь: её сердцебиение запаздывает' })),
        h('li', {}, h('i.k-silent'), pick({ en: 'Hollow: the machine has stopped', ru: 'Пустой круг: машина остановилась' })),
        h('li', {}, h('i.k-ans'), pick({ en: 'Filled: a program answered', ru: 'Заполненный: программа откликнулась' })),
        h('li', {}, h('i.k-gap'), pick({ en: 'Empty: a program was called and stayed silent', ru: 'Пунктир: программу позвали, а она промолчала' })),
      ),
    );
    const stage = h('div.l-stage', {}, this.svg, this.callRow);
    const bar = h('header.d-bar', {}, h('span.d-title', {}, t('The listening room')), h('button.icon-btn', { 'aria-label': t('Leave the listening room'), onclick: () => this.onClose?.() }, svgIcon('close')));
    this.el = h('section.listen', { 'aria-label': t('The listening room'), tabindex: '-1' }, bar, h('div.l-wrap', {}, text, stage));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.onClose?.();
    });
    document.body.append(this.el);
    this.source.onChange = () => this.render();
    this.source.onLease = (node) => {
      this.accents.add(node);
      this.flash(node);
    };
    this.render();
  }

  get isOpen(): boolean {
    return this.el.classList.contains('open');
  }

  open(): void {
    this.el.classList.add('open');
    document.body.classList.add('locked');
    this.el.focus({ preventScroll: true });
    if (this.source.mode === 'connecting') this.source.start();
    this.render();
  }

  close(): void {
    this.el.classList.remove('open');
    document.body.classList.remove('locked');
    this.stop();
    this.source.stop();
  }

  private toggle(): void {
    if (this.playingNow) this.stop();
    else this.play();
  }

  private play(): void {
    this.ens ??= new Ensemble();
    void this.ens.ctx.resume();
    this.playingNow = true;
    this.nextAt = this.ens.ctx.currentTime + 0.1;
    this.pulse = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
    const loop = () => {
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.render();
  }

  private stop(): void {
    this.playingNow = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    void this.ens?.ctx.suspend();
    this.cues = [];
    this.render();
  }

  /** The look-ahead scheduler: queue every stroke a little before it sounds. */
  private schedule(): void {
    const ens = this.ens!;
    while (this.nextAt < ens.ctx.currentTime + AHEAD) {
      this.playPulse(this.pulse, this.nextAt);
      this.nextAt += PULSE;
      this.pulse = (this.pulse + 1) % PULSES;
      if (this.pulse === 0) this.cycle++;
    }
  }

  private playPulse(i: number, t: number): void {
    const ens = this.ens!;
    if (BELL[i] === 'x') {
      ens.bell(t, i === 0);
      this.cues.push({ at: t, kind: 'bell', pulse: i });
    }
    const voices = this.source.voices;
    voices.forEach((v, k) => {
      const part = PARTS[k % PARTS.length];
      if (part[i] !== 'x') return;
      const p = playing(v);
      if (p.gain === 0 || Math.random() < p.drop) return;
      const accent = this.accents.delete(v.node);
      const at = t + (Math.random() * 2 - 1) * p.jitter + p.drag * 0.06;
      ens.drum(Math.max(t, at), TUNINGS[k % TUNINGS.length], p.gain, accent);
      this.cues.push({ at, kind: 'node', node: v.node, accent });
    });
    // Call-and-response every other cycle, so the drums can breathe.
    if (i === 0) this.current = this.cycle % 2 === 0 ? exchange(voices, this.cycle / 2) : null;
    const ex = this.current;
    if (!ex) return;
    const callAt = [0, 1, 3].indexOf(i);
    if (callAt >= 0) {
      ens.voice(t, CALL[callAt], 0.2);
      this.cues.push({ at: t, kind: 'call', node: ex.node, pulse: callAt });
    }
    const slot = i - (PULSES - SLOTS);
    if (slot >= 0 && slot < ex.slots.length) {
      if (ex.slots[slot]) ens.voice(t, ANSWER[slot], 0.16);
      this.cues.push({ at: t, kind: ex.slots[slot] ? 'answer' : 'gap', node: ex.node, slot });
    }
  }

  private drawRing(): void {
    const svg = this.svg;
    const c = 300;
    const r = 118;
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx', String(c));
    ring.setAttribute('cy', String(c));
    ring.setAttribute('r', String(r));
    ring.setAttribute('class', 'l-track');
    svg.append(ring);
    const bellAt = new Set(strokes(BELL));
    for (let i = 0; i < PULSES; i++) {
      const a = (i / PULSES) * Math.PI * 2 - Math.PI / 2;
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', (c + Math.cos(a) * r).toFixed(1));
      dot.setAttribute('cy', (c + Math.sin(a) * r).toFixed(1));
      dot.setAttribute('r', bellAt.has(i) ? '9' : '3');
      dot.setAttribute('class', bellAt.has(i) ? 'l-bell' : 'l-rest');
      svg.append(dot);
      this.bellDots[i] = dot;
    }
    this.hand.setAttribute('x1', String(c));
    this.hand.setAttribute('y1', String(c));
    this.hand.setAttribute('class', 'l-hand');
    svg.append(this.hand);
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(c));
    label.setAttribute('y', String(c + 6));
    label.setAttribute('class', 'l-centre');
    label.textContent = '12/8';
    svg.append(label);
    this.gNodes.setAttribute('class', 'l-nodes');
    svg.append(this.gNodes);
    this.setHand(0);
  }

  private setHand(frac: number): void {
    const a = frac * Math.PI * 2 - Math.PI / 2;
    this.hand.setAttribute('x1', (300 + Math.cos(a) * 40).toFixed(1));
    this.hand.setAttribute('y1', (300 + Math.sin(a) * 40).toFixed(1));
    this.hand.setAttribute('x2', (300 + Math.cos(a) * 100).toFixed(1));
    this.hand.setAttribute('y2', (300 + Math.sin(a) * 100).toFixed(1));
  }

  private nodeEls = new Map<string, SVGGElement>();

  private renderNodes(): void {
    const voices = this.source.voices;
    const seen = new Set<string>();
    const n = Math.max(1, voices.length);
    voices.forEach((v, k) => {
      seen.add(v.node);
      let g = this.nodeEls.get(v.node);
      if (!g) {
        g = document.createElementNS(NS, 'g');
        g.innerHTML = '<circle class="halo" r="44"/><circle class="body" r="30"/><path class="late"/><text class="no" y="5"/><text class="nm" y="58"/><text class="st" y="74"/>';
        this.gNodes.append(g);
        this.nodeEls.set(v.node, g);
      }
      const a = (k / n) * Math.PI * 2 - Math.PI / 2 + Math.PI / n;
      const x = 300 + Math.cos(a) * 222;
      const y = 300 + Math.sin(a) * 222;
      const p = playing(v);
      g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      g.setAttribute('class', `l-node${v.alive ? '' : ' silent'}${p.jitter > 0 ? ' late' : ''}`);
      g.style.setProperty('--hue', String((k * 67 + 30) % 360));
      g.style.setProperty('--wob', `${(p.jitter * 40).toFixed(1)}px`);
      g.querySelector('text.nm')!.textContent = drumName(k);
      g.querySelector('text.no')!.textContent = `${t('node')} ${k + 1}`;
      g.querySelector('text.nm')!.setAttribute('aria-label', v.node);
      g.querySelector('text.st')!.textContent = v.alive ? t('{ready} ready', { ready: v.ready }) + (v.notReady ? ' · ' + t('{n} silent', { n: v.notReady }) : '') : t('silent');
      // The lateness arc: how far into its lease the node is.
      const f = Math.max(0, Math.min(0.999, v.late));
      const ang = f * Math.PI * 2;
      const r = 37;
      const path = `M0,${-r} A${r},${r} 0 ${ang > Math.PI ? 1 : 0} 1 ${(Math.sin(ang) * r).toFixed(1)},${(-Math.cos(ang) * r).toFixed(1)}`;
      g.querySelector('path.late')!.setAttribute('d', path);
    });
    for (const [node, g] of this.nodeEls) {
      if (!seen.has(node)) {
        g.remove();
        this.nodeEls.delete(node);
      }
    }
  }

  private flash(node: string): void {
    const g = this.nodeEls.get(node);
    if (!g || reducedMotion()) return;
    g.classList.remove('lease');
    void g.getBoundingClientRect();
    g.classList.add('lease');
  }

  private hit(el: Element | undefined, cls = 'hit'): void {
    if (!el) return;
    el.classList.remove(cls);
    void (el as HTMLElement).getBoundingClientRect?.();
    el.classList.add(cls);
  }

  /** Visual cues, released as their sounds play. */
  private draw(): void {
    const ens = this.ens;
    if (!ens) return;
    const now = ens.ctx.currentTime;
    const since = this.nextAt - now;
    const frac = (((this.pulse - since / PULSE) % PULSES) + PULSES) % PULSES / PULSES;
    this.setHand(frac);
    this.cues.sort((a, b) => a.at - b.at);
    while (this.cues.length && this.cues[0].at <= now) {
      const c = this.cues.shift()!;
      if (c.kind === 'bell') this.hit(this.bellDots[c.pulse!]);
      else if (c.kind === 'node') this.hit(this.nodeEls.get(c.node!), c.accent ? 'accent' : 'hit');
      else if (c.kind === 'call' && c.pulse === 0) this.renderCall(c.node!);
      else if (c.kind === 'call') this.hit(this.callRow.querySelector('.cl') ?? undefined);
      else this.hit(this.callRow.querySelectorAll('.slot')[c.slot!], 'on');
    }
  }

  private renderCall(node: string): void {
    const ex = this.current;
    if (!ex) return;
    this.callRow.replaceChildren(
      h('span.cl', {}, t('Call')),
      h('span.to', {}, `→ ${drumName(Math.max(0, this.source.voices.findIndex((v) => v.node === node)))}`),
      ...ex.slots.map((ok) => h(`i.slot${ok ? '.ok' : '.gap'}`)),
    );
  }

  private render(): void {
    const m = this.source.mode;
    const live = m === 'live';
    this.badge.textContent = t(live ? 'Live · Griot /pulse' : m === 'demo' ? 'Recorded demo · not a live cluster' : m === 'stale' ? 'Live stream quiet' : 'Connecting…');
    this.badge.className = `l-badge ${m}`;
    this.demoRow.hidden = m !== 'demo';
    const v = this.source.voices;
    const alive = v.filter((x) => x.alive).length;
    const ready = v.reduce((s, x) => s + (x.alive ? x.ready : 0), 0);
    const silent = v.reduce((s, x) => s + x.notReady, 0);
    this.status.textContent = v.length
      ? t('{alive} of {total} playing · {ready} answering', { alive, total: count(v.length, 'nodeOf'), ready: count(ready, 'pod') }) + (silent ? ' · ' + t('{n} silent pods', { n: silent }) : '')
      : m === 'connecting'
        ? t('Listening for the cluster…')
        : t('No nodes yet.');
    this.button.replaceChildren(t(this.playingNow ? 'Stop' : 'Start listening'));
    this.button.setAttribute('aria-pressed', String(this.playingNow));
    this.el.classList.toggle('playing', this.playingNow);
    this.renderNodes();
  }
}

/** The part of a node name that tells it apart: kubernetes-museum-md0-htprj-z9txf → z9txf. */
export function shortName(node: string, all: string[]): string {
  if (all.length < 2) return node.length > 18 ? node.slice(-18) : node;
  const parts = all.map((n) => n.split('-'));
  let common = 0;
  while (parts.every((p) => p.length > common + 1 && p[common] === parts[0][common])) common++;
  const rest = node.split('-').slice(common).join('-');
  return rest.length > 18 ? rest.slice(-18) : rest;
}
