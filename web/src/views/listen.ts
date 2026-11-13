// The listening room: the live cluster played with Web Audio. The control
// plane keeps the 12/8 bell timeline, each node is a drum with its own part
// driven by its Lease, and ready pods answer the cluster's call.
import type { App } from '../app';
import { richText } from '../app';
import { h, reducedMotion, svgIcon } from '../lib/dom';
import { count, lang, pick, t } from '../lib/i18n';
import { subtitle, type Sub } from '../lib/subtitles';
import { BELL, GRACE, mend, roomState, simTargets, type RoomState, GUEST_EVERY, GUEST_PART, PARTS, PULSES, guestPitch, SLOTS, TUNINGS, demoLeases, demoVoices, drumName, exchange, podsOf, type Sim, type SimVoice, parsePulse, playing, strokes, type Exchange, type Voice } from '../lib/rhythm';

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
  base: Voice[] = [];
  sim: Sim = {};
  /** The one state everything on the page is drawn from, updated in one place. */
  state: RoomState = roomState([], {}, 0);
  get voices(): SimVoice[] {
    return this.state.voices;
  }
  update(now = performance.now()): void {
    this.state = roomState(this.base, this.sim, now);
  }
  private es?: EventSource;
  private started = 0;
  private lastData = 0;
  private demoTimer = 0;
  private lastDemo = 0;
  onChange?: () => void;
  onLease?: (node: string) => void;
  onPod?: (phase: 'joined' | 'left', name: string, node: string) => void;
  /** Guest voices now playing: workload name → node. */
  guests = new Map<string, string>();
  /** When the last guest joined (ms), to guess the next one. */
  lastGuestAt = 0;

  private pod(phase: 'joined' | 'left', name: string, node: string): void {
    if (phase === 'joined') {
      if (this.guests.has(name)) return;
      this.guests.set(name, node);
      this.lastGuestAt = performance.now();
    } else if (!this.guests.delete(name)) return;
    this.onPod?.(phase, name, node);
    this.onChange?.();
  }

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
        this.base = e.voices;
        this.update();
        this.onChange?.();
      } else if (e.type === 'lease' && e.node) this.onLease?.(e.node);
      else if (e.type === 'pod' && e.phase && e.name) this.pod(e.phase, e.name, e.node ?? '');
    };
    this.es.onerror = () => {
      if (this.mode === 'connecting' || (this.mode !== 'live' && performance.now() - this.started > 2500)) this.demo();
    };
    window.setTimeout(() => this.mode === 'connecting' && this.demo(), 4000);
    // A live stream that goes quiet is played as silence, not as old news.
    window.setInterval(() => {
      if (this.mode === 'live' && performance.now() - this.lastData > 15000) {
        this.mode = 'stale';
        this.base = this.base.map((v) => ({ ...v, alive: false }));
        this.update();
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
      this.base = demoVoices(t);
      this.update();
      for (const l of demoLeases(this.lastDemo, t)) this.onLease?.(l.node);
      // In the demo a guest drummer sits in for 30 s of every minute.
      const m = ((t % 60) + 60) % 60;
      const node = this.base[2]?.node ?? this.base[0]?.node ?? '';
      if (m >= 8 && m < 38) this.pod('joined', 'guest-drummer', node);
      else this.pod('left', 'guest-drummer', node);
      this.lastDemo = t;
      this.onChange?.();
    };
    tick();
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

  /** A guest's voice: a bright plucked tone, unlike the drums and the hum. */
  pluck(t: number, f: number, gain: number): void {
    const g = this.env(t, gain, 0.5, 0.003);
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 6, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.3);
    o.connect(lp).connect(g);
    o.start(t);
    o.stop(t + 0.55);
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
  private gPods = document.createElementNS(NS, 'g');
  private moveNote: HTMLElement;
  private subs = h('ul.l-subs', { 'aria-live': 'polite', 'aria-label': 'Subtitles' });
  private next = h('p.l-next');
  private nodeLine = h('p.l-nodeline', { 'aria-live': 'off' });
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
    this.svg.setAttribute('viewBox', '-24 -24 648 648');
    this.svg.setAttribute('class', 'l-ring');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', t('The bell timeline in the centre and one drum per node around it'));
    this.hand = document.createElementNS(NS, 'line');
    this.gNodes = document.createElementNS(NS, 'g');
    this.drawRing();
    this.callRow = h('div.l-call', { 'aria-hidden': 'true' });
    const tweak = (key: 'brokenAt' | 'failingAt', on: [string, string], off: [string, string]) => {
      const b = h(
        'button.btn',
        {
          'aria-pressed': 'false',
          onclick: () => {
            const active = this.source.sim[key] !== undefined;
            const now = performance.now();
            if (active && key === 'brokenAt') this.source.sim = mend(this.source.sim, now);
            else if (active) delete this.source.sim[key];
            else this.source.sim = { ...this.source.sim, [key]: now, ...(key === 'brokenAt' ? { mendedAt: undefined } : {}) };
            this.source.update(now);
            this.narrateSim(key, !active);
            b.setAttribute('aria-pressed', String(!active));
            b.textContent = pick(!active ? { en: off[0], ru: off[1] } : { en: on[0], ru: on[1] });
            this.tickSim();
          },
        },
        pick({ en: on[0], ru: on[1] }),
      );
      return b;
    };
    this.demoRow = h(
      'div.l-demo',
      {},
      tweak('brokenAt', ['Break a node', 'Сломать узел'], ['Mend the node', 'Починить узел']),
      tweak('failingAt', ['Fail two pods', 'Уронить два пода'], ['Heal the pods', 'Поднять поды']),
    );
    const talk = app.set.get('talking-drums') ? `[[talking-drums|${t('talking drums')}]]` : t('talking drums');
    const spirit = app.set.get('spirituals') ? `[[spirituals|${t('the spirituals')}]]` : t('the spirituals');
    const ctl = h('div.l-ctl', {}, h('div.l-controls', {}, this.button, this.badge), this.demoRow, this.status);
    const ctlSlot = h('div.l-ctl-slot');
    const text = h(
      'div.l-text',
      {},
      h('div.kicker', {}, t('The cluster, played live')),
      h('h2', {}, t('The listening room')),
      h(
        'p.l-what',
        {},
        h('b', {}, pick({ en: 'What you are hearing. ', ru: 'Что вы слышите. ' })),
        pick({
          en: 'A bell keeps time, each machine of the museum plays a drum, and every other bar the cluster calls and its programs answer. A healthy cluster sounds steady on purpose; every few minutes a guest drummer joins for a minute, and the words under the circle say what just happened.',
          ru: 'Колокол держит ритм, каждая машина музея играет на барабане, а через такт кластер зовёт — и его программы отвечают. Здоровый кластер и должен звучать ровно; время от времени на минуту вступает приглашённый барабанщик, а подписи под кругом говорят, что сейчас произошло.',
        }),
      ),
      ctlSlot,
      h(
        'p.l-lede',
        {},
        h('b', {}, pick({ en: 'Technically. ', ru: 'Технически. ' })),
        richText(
          app,
          t('The bell is the control plane. It keeps the West African 12/8 timeline, seven strokes in twelve pulses, and every drum in an ensemble, {talk} included, plays its own part locked to that one shared pattern; the nodes keep time against the control plane in the same way. Each node is a drum with its own interlocking part: it plays while its Lease is fresh, stumbles as heartbeats come late, and falls silent when the node stops. Then the cluster calls and every ready pod answers, as in {spirit}; a pod that is not ready leaves its answer empty, and you hear the gap.', { talk, spirit }),
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
        h('li', {}, h('i.k-soft'), pick({ en: 'Soft dot: an answer still to come', ru: 'Бледная точка: ответ ещё впереди' })),
      ),
    );
    this.moveNote = h(
      'p.l-move',
      { hidden: true },
      pick({
        en: 'Its pods have started again on the nodes still playing. In a real cluster Kubernetes waits for a timeout first: by default five minutes after a node stops answering.',
        ru: 'Его поды снова запустились на узлах, которые продолжают играть. В настоящем кластере Kubernetes сначала ждёт тайм-аут: по умолчанию пять минут после того, как узел перестал отвечать.',
      }),
    );
    const whatShort = h(
      'p.l-what-short',
      {},
      pick({
        en: 'A bell keeps time, each machine plays a drum, the cluster calls and its programs answer. The words below say what just happened.',
        ru: 'Колокол держит ритм, каждая машина играет на барабане, кластер зовёт — программы отвечают. Подписи ниже говорят, что сейчас произошло.',
      }),
    );
    const stage = h('div.l-stage', {}, whatShort, this.svg, this.nodeLine, this.callRow, this.subs, this.next, this.moveNote);
    // On phones the controls sit under the drums, so pressing them shows what happens.
    const place = () => (window.innerWidth <= 900 ? stage.append(ctl) : ctlSlot.append(ctl));
    place();
    window.matchMedia('(max-width: 900px)').addEventListener('change', place);
    const bar = h('header.d-bar', {}, h('span.d-title', {}, t('The listening room')), h('button.icon-btn', { 'aria-label': t('Leave the listening room'), onclick: () => this.onClose?.() }, svgIcon('close')));
    this.el = h('section.listen', { 'aria-label': t('The listening room'), tabindex: '-1' }, bar, h('div.l-wrap', {}, text, stage));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.onClose?.();
    });
    document.body.append(this.el);
    this.source.onChange = () => this.render();
    this.source.onLease = (node) => {
      if (this.source.voices.find((x) => x.node === node)?.broken) return;
      this.accents.add(node);
      this.flash(node);
      // A node the reader stopped does not check in, whatever the stream says.
      const v = this.source.voices.find((x) => x.node === node);
      if (!v?.broken) this.say({ kind: 'lease', drum: this.drumOf(node) });
    };
    this.source.onPod = (phase, name, node) => this.say(phase === 'joined' ? { kind: 'join', name, drum: this.drumOf(node) } : { kind: 'leave', name, drum: this.drumOf(node) });
    window.setInterval(() => this.isOpen && this.paintNext(), 1000);
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
    for (const [name] of this.source.guests) {
      if (GUEST_PART[i] === 'x') ens.pluck(t, guestPitch(name), 0.12);
    }
    // Call-and-response every other cycle, so the drums can breathe.
    if (i === 0) {
      this.current = this.cycle % 2 === 0 ? exchange(voices, this.cycle / 2) : null;
      const ex = this.current;
      if (ex) {
        const at = t - this.ens!.ctx.currentTime;
        // Counted when the line is shown, from the state the drum label shows.
        window.setTimeout(() => {
          const v = this.source.voices.find((x) => x.node === ex.node);
          this.say({ kind: 'call', drum: this.drumOf(ex.node), ready: v?.ready ?? 0, silent: v?.notReady ?? 0 });
        }, Math.max(0, at * 1000));
      }
    }
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
    this.gPods.setAttribute('class', 'l-pods');
    svg.append(this.gPods);
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
    // On a small circle the labels are larger and the words shorter.
    const small = this.svg.clientWidth > 0 && this.svg.clientWidth < 520;
    const seen = new Set<string>();
    const n = Math.max(1, voices.length);
    // Crop the picture to what is drawn, so the call row sits right under it.
    const ys = voices.map((_, k) => 300 + Math.sin(nodeAngle(k, n)) * 222);
    const top = Math.min(300 - 180, ...ys.map((y) => y - 52));
    const bottom = Math.max(300 + 180, ...ys.map((y) => y + 84));
    const vb = `-24 ${top.toFixed(0)} 648 ${(bottom - top).toFixed(0)}`;
    if (this.svg.getAttribute('viewBox') !== vb) this.svg.setAttribute('viewBox', vb);
    voices.forEach((v, k) => {
      seen.add(v.node);
      let g = this.nodeEls.get(v.node);
      if (!g) {
        g = document.createElementNS(NS, 'g');
        g.innerHTML = '<circle class="halo" r="44"/><circle class="body" r="30"/><path class="late"/><text class="no" y="5"/><text class="nm" y="58"/><text class="st" y="74"/>';
        this.gNodes.append(g);
        this.nodeEls.set(v.node, g);
      }
      const a = nodeAngle(k, n);
      const x = 300 + Math.cos(a) * 222;
      const y = 300 + Math.sin(a) * 222;
      const p = playing(v);
      g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      g.setAttribute('class', `l-node${v.alive ? '' : ' silent'}${p.jitter > 0 ? ' late' : ''}`);
      g.style.setProperty('--wob', `${(p.jitter * 40).toFixed(1)}px`);
      g.querySelector('text.nm')!.textContent = drumName(k);
      g.querySelector('text.no')!.textContent = `${t('node')} ${k + 1}`;
      g.querySelector('text.nm')!.setAttribute('aria-label', v.node);
      g.querySelector('text.st')!.textContent = v.broken
        ? v.alive
          ? small
            ? pick({ en: `late ${v.lateSeconds} s · down in ${v.downIn}`, ru: `опаздывает ${v.lateSeconds} с · ещё ${v.downIn}` })
            : pick({ en: `heartbeat ${v.lateSeconds} s late · down in ${v.downIn} s`, ru: `сердцебиение опаздывает на ${v.lateSeconds} с · выбывает через ${v.downIn} с` })
          : v.evicted
            ? small
              ? pick({ en: 'down · moved', ru: 'выбыл' })
              : pick({ en: 'down · its pods moved away', ru: 'выбыл · его поды переехали' })
            : pick({ en: 'declared down · pods silent', ru: 'объявлен выбывшим · поды молчат' })
        : v.alive
          ? v.rebalancing
            ? pick({ en: `back · ${v.ready} ready, more as pods restart`, ru: `вернулся · готовы: ${v.ready}, остальные по мере перезапуска` })
            : small
              ? `${v.ready}${v.adopted ? ` (+${v.adopted})` : ''} ${pick({ en: 'ready', ru: 'готовы' })}`
              : (v.adopted ? pick({ en: `took over ${v.adopted} · `, ru: `принял ${v.adopted} · ` }) : '') + t('{ready} ready', { ready: v.ready }) + (v.notReady ? ' · ' + t('{n} silent', { n: v.notReady }) : '')
          : t('silent');
      g.classList.toggle('broken', !!v.broken);
      // The lateness arc: how far into its lease the node is.
      const f = Math.max(0, Math.min(0.999, v.late));
      const ang = f * Math.PI * 2;
      const r = 37;
      const path = `M0,${-r} A${r},${r} 0 ${ang > Math.PI ? 1 : 0} 1 ${(Math.sin(ang) * r).toFixed(1)},${(-Math.cos(ang) * r).toFixed(1)}`;
      g.querySelector('path.late')!.setAttribute('d', path);
    });
    this.renderPods(voices);
    // On small circles each drum's state is one line under the circle instead.
    this.nodeLine.replaceChildren(
      ...voices.map((v, k) => h(`span${v.broken ? '.bad' : ''}`, {}, h('b', {}, drumName(k)), ' ', (this.nodeEls.get(v.node)?.querySelector('text.st')?.textContent ?? ''))),
    );
    this.narrate(voices);
    for (const [node, g] of this.nodeEls) {
      if (!seen.has(node)) {
        g.remove();
        this.nodeEls.delete(node);
      }
    }
  }

  private drumOf(node: string): string {
    const k = this.source.voices.findIndex((v) => v.node === node);
    return k >= 0 ? drumName(k) : node;
  }

  /** One line of subtitles; the newest on top, the older fading below. */
  private liveLate?: HTMLElement;

  private say(s: Sub): void {
    if (!this.isOpen) return;
    const line = h('li', {}, subtitle(s, lang()));
    // The late line is kept live: it reads the same clock as the drum.
    if (s.kind === 'late') {
      this.liveLate?.remove();
      this.liveLate = line;
      line.dataset.drum = s.drum;
    }
    this.subs.prepend(line);
    while (this.subs.children.length > 3) this.subs.lastElementChild!.remove();
  }

  private lastState = new Map<string, string>();
  private lateTimer = 0;

  /** What the reader just did, said first, then counted down. */
  private narrateSim(key: 'brokenAt' | 'failingAt', on: boolean): void {
    const tg = simTargets(this.source.base.length);
    clearInterval(this.lateTimer);
    if (key === 'brokenAt') {
      const drum = drumName(tg.broken);
      if (!on) {
        this.say({ kind: 'mended', drum });
        if (this.source.sim.mendedAt !== undefined) this.say({ kind: 'rebalance', drum });
        return;
      }
      this.say({ kind: 'stopped', drum, s: this.source.voices[tg.broken]?.downIn ?? GRACE });
      this.lateTimer = window.setInterval(() => {
        const v = this.source.voices[tg.broken];
        if (!v?.broken || !v.alive) return clearInterval(this.lateTimer);
        this.say({ kind: 'late', drum, late: v.lateSeconds ?? 0, s: v.downIn ?? 0 });
      }, 4000);
    } else if (on) {
      const v = this.source.voices[tg.failing];
      this.say({ kind: 'failed', drum: drumName(tg.failing), n: v?.failing ?? 2 });
    }
  }

  /** Watch the voices for a node going down and its pods moving on. */
  private narrate(voices: SimVoice[]): void {
    voices.forEach((v, k) => {
      const state = v.evicted ? 'moved' : !v.alive ? 'down' : 'up';
      const was = this.lastState.get(v.node);
      this.lastState.set(v.node, state);
      if (!was || was === state) return;
      if (state === 'down') this.say({ kind: 'down', drum: drumName(k) });
      if (state === 'moved') this.say({ kind: 'moved', drum: drumName(k), n: voices.reduce((a, x) => a + (x.adopted ?? 0), 0) });
    });
  }

  private paintNext(): void {
    const g = this.source.guests;
    if (g.size) {
      this.next.textContent = pick({ en: `Guest playing now: ${[...g.keys()].join(', ')}`, ru: `Сейчас играет гость: ${[...g.keys()].join(', ')}` });
      return;
    }
    if (!this.source.lastGuestAt || this.source.mode !== 'live') {
      this.next.textContent = pick({ en: 'Every few minutes a guest drummer joins.', ru: 'Каждые несколько минут вступает приглашённый барабанщик.' });
      return;
    }
    const left = Math.max(0, Math.round(GUEST_EVERY - (performance.now() - this.source.lastGuestAt) / 1000));
    const mm = Math.floor(left / 60);
    const ss = String(left % 60).padStart(2, '0');
    this.next.textContent = pick({ en: `Next guest drummer in about ${mm}:${ss}`, ru: `Следующий гость примерно через ${mm}:${ss}` });
  }

  private podEls = new Map<string, SVGCircleElement>();

  /** Every pod as a dot beside its node: grey when silent; dots travel when pods move. */
  private renderPods(voices: SimVoice[]): void {
    const pods = podsOf(voices);
    const n = Math.max(1, voices.length);
    const slot = new Map<number, number>();
    const total = new Map<number, number>();
    for (const p of pods) total.set(p.at, (total.get(p.at) ?? 0) + 1);
    const seen = new Set<string>();
    for (const p of pods) {
      seen.add(p.id);
      let c = this.podEls.get(p.id);
      if (!c) {
        c = document.createElementNS(NS, 'circle');
        c.setAttribute('r', '5');
        this.gPods.append(c);
        this.podEls.set(p.id, c);
      }
      const j = slot.get(p.at) ?? 0;
      slot.set(p.at, j + 1);
      const a = nodeAngle(p.at, n);
      // A short arc of dots inside the node, clear of its name: at most twelve
      // to a row, further rows closer in, so a busy node never wraps the ring.
      const ROW = 12;
      const row = Math.floor(j / ROW);
      const inRow = Math.min(ROW, (total.get(p.at) ?? 1) - row * ROW);
      const spread = (j % ROW - (inRow - 1) / 2) * 0.085;
      const r = 150 - row * 15;
      const x = 300 + Math.cos(a + spread) * r;
      const y = 300 + Math.sin(a + spread) * r;
      c.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      c.setAttribute('class', `l-pod${p.ok ? '' : ' off'}`);
    }
    // Guests: a bright dot that appears with the voice and leaves with it.
    for (const [name, node] of this.source.guests) {
      const id = `guest:${name}`;
      seen.add(id);
      let c = this.podEls.get(id);
      if (!c) {
        c = document.createElementNS(NS, 'circle');
        c.setAttribute('r', '9');
        this.gPods.append(c);
        this.podEls.set(id, c);
      }
      const at = Math.max(0, voices.findIndex((v) => v.node === node));
      const a = nodeAngle(at, n) - 0.42;
      c.style.transform = `translate(${(300 + Math.cos(a) * 222).toFixed(1)}px, ${(300 + Math.sin(a) * 222).toFixed(1)}px)`;
      c.setAttribute('class', 'l-pod guest');
      c.setAttribute('aria-label', name);
    }
    for (const [id, c] of this.podEls) {
      if (!seen.has(id)) {
        c.remove();
        this.podEls.delete(id);
      }
    }
    const moved = voices.some((v) => v.evicted);
    this.moveNote.hidden = !moved;
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
      // The dots count from the state the drum label shows right now.
      ...(exchange(this.source.voices.filter((v) => v.node === node), 0)?.slots ?? ex.slots).map((ok) => h(`i.slot${ok ? '.ok' : '.gap'}`)),
    );
  }

  private simTimer = 0;

  /** While an intervention runs, the room redraws every quarter second. */
  private tickSim(): void {
    clearInterval(this.simTimer);
    this.render();
    const sim = this.source.sim;
    if (sim.brokenAt !== undefined || sim.failingAt !== undefined || sim.mendedAt !== undefined)
      this.simTimer = window.setInterval(() => {
        this.source.update();
        this.render();
      }, 250);
  }

  private render(): void {
    const m = this.source.mode;
    const live = m === 'live';
    this.badge.textContent = live ? pick({ en: 'Live: this museum’s own cluster', ru: 'Вживую: собственный кластер музея' }) : t( m === 'demo' ? 'Recorded demo · not a live cluster' : m === 'stale' ? 'Live stream quiet' : 'Connecting…');
    this.badge.className = `l-badge ${m}`;
    this.demoRow.hidden = m === 'connecting';
    const st = this.source.state;
    const late = st.late.map((n) => this.drumOf(n));
    this.status.textContent = st.total
      ? t('{alive} of {total} playing · {ready} answering', { alive: st.playing, total: count(st.total, 'nodeOf'), ready: count(st.ready, 'pod') }) +
        (late.length ? ' · ' + pick({ en: `${late.join(', ')} late`, ru: `опаздывает: ${late.join(', ')}` }) : '') +
        (st.silent ? ' · ' + pick({ en: `${st.silent} silent ${st.silent === 1 ? 'pod' : 'pods'}`, ru: `молчат: ${st.silent}` }) : '')
      : m === 'connecting'
        ? t('Listening for the cluster…')
        : t('No nodes yet.');
    this.button.replaceChildren(t(this.playingNow ? 'Stop' : 'Start listening'));
    this.button.setAttribute('aria-pressed', String(this.playingNow));
    this.el.classList.toggle('playing', this.playingNow);
    this.renderNodes();
    // Keep the newest late line in step with the drum's own countdown.
    const ll = this.liveLate;
    if (ll && ll.isConnected) {
      const k = this.source.voices.findIndex((x) => x.broken);
      const v = this.source.voices[k];
      if (v?.broken && v.alive) ll.textContent = subtitle({ kind: 'late', drum: ll.dataset.drum!, late: v.lateSeconds ?? 0, s: v.downIn ?? 0 }, lang());
      // The moment the drum reads "declared down", the countdown line stops counting.
      else if (v?.broken) {
        ll.remove();
        this.liveLate = undefined;
      }
    }
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

/** Node 1 on the left, then clockwise: reading order around the circle. */
export function nodeAngle(k: number, n: number): number {
  return Math.PI + (k / Math.max(1, n)) * Math.PI * 2;
}
