// One signature moment per chapter, built only from what its cards already
// say: a number that counts, a plate that draws itself in, an object you
// insert, or a sentence set large. No new facts here.
import type { App } from '../app';
import type { Card } from '../lib/types';
import { formatYears } from '../lib/cards';
import { h, reducedMotion } from '../lib/dom';
import { lang, pick, t } from '../lib/i18n';
import { progressive } from '../lib/media';

type Kind = 'counter' | 'plate' | 'insert' | 'quote';

const PLAN: Record<string, { kind: Kind; card: string }> = {
  v0: { kind: 'plate', card: 'timbuktu-manuscripts' },
  v1: { kind: 'counter', card: 'slavevoyages' },
  v2: { kind: 'quote', card: 'haitian-revolution' },
  v3: { kind: 'plate', card: 'dave-the-potter' },
  v4: { kind: 'quote', card: 'what-black-means' },
  v5: { kind: 'plate', card: 'du-bois-infographics' },
  v6: { kind: 'quote', card: 'big-mama-thornton' },
  v7: { kind: 'insert', card: 'jerry-lawson' },
};

/** The card each chapter's signature is built from. */
export const SIGNATURE_CARD: Record<string, string> = Object.fromEntries(Object.entries(PLAN).map(([k, v]) => [k, v.card]));

/** The first number of thousands written in a text: "almost 100,000 Africans" → 100000. */
export function firstBigNumber(text: string): number | undefined {
  const m = text.match(/\b(\d{1,3}(?:,\d{3})+)\b/);
  return m ? Number(m[1].replace(/,/g, '')) : undefined;
}

const QUALIFIERS: Record<string, { en: string; ru: string }> = {
  nearly: { en: 'nearly', ru: 'почти' },
  almost: { en: 'almost', ru: 'почти' },
  about: { en: 'about', ru: 'около' },
  around: { en: 'around', ru: 'около' },
  over: { en: 'over', ru: 'более' },
  'more than': { en: 'more than', ru: 'более' },
};

/** The word that qualifies that number in the card ("nearly 100,000"), if any. */
export function qualifierOf(text: string): keyof typeof QUALIFIERS | undefined {
  const m = text.match(/\b(nearly|almost|about|around|over|more than)\s+\d{1,3}(?:,\d{3})+/i);
  return m ? (m[1].toLowerCase() as keyof typeof QUALIFIERS) : undefined;
}

export function signature(app: App, chapterId: string, cards: Card[], fallback?: Card): HTMLElement | null {
  const plan = PLAN[chapterId];
  const c = (plan && cards.find((x) => x.id === plan.card)) ?? fallback;
  if (!c) return null;
  const img = c.media?.find((m) => m.type === 'image');
  let kind: Kind = plan && plan.card === c.id ? plan.kind : 'quote';
  if ((kind === 'plate' || kind === 'insert') && !img) kind = 'quote';
  const raw = app.raw(c.id) ?? c;
  const n = kind === 'counter' ? firstBigNumber(`${raw.wow} ${raw.body}`) : undefined;
  if (kind === 'counter' && !n) kind = 'quote';
  const link = h('a.btn.attr', { href: `#focus=${c.id}`, 'data-card': c.id }, kindLink(c));
  const era = `--era:var(--${chapterId})`;

  if (kind === 'counter') return counter(n!, qualifierOf(`${raw.wow} ${raw.body}`), c, link, era);
  if (kind === 'plate') return plate(app, c, link, era);
  if (kind === 'insert') return insert(app, c, link, era);
  return h('section.interlude.sig', { style: era }, h('blockquote.reveal', {}, c.wow), link);
}

function counter(n: number, q: string | undefined, c: Card, link: HTMLElement, era: string): HTMLElement {
  const fmt = (v: number) => v.toLocaleString(lang() === 'ru' ? 'ru-RU' : 'en-US').replace(/ /g, ' ');
  const num = h('div.sig-num', { 'aria-label': fmt(n) }, reducedMotion() ? fmt(n) : '0');
  const el = h(
    'section.sig.sig-counter',
    { style: era },
    h('div.kicker', {}, pick({ en: 'Names, not cargo', ru: 'Имена, а не груз' })),
    // The card's own wording stays with the number: "nearly 100,000".
    q ? h('div.sig-q', {}, pick(QUALIFIERS[q])) : null,
    num,
    h('p.sig-wow', {}, c.wow),
    link,
  );
  if (!reducedMotion()) {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const dur = 4200;
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / dur);
          num.textContent = fmt(Math.round(n * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(num);
  }
  return el;
}

/** A plate on a paper mat, drawn in from the top as the reader scrolls. */
function plate(app: App, c: Card, link: HTMLElement, era: string): HTMLElement {
  const m = c.media!.find((x) => x.type === 'image')!;
  const image = progressive(app, m.file, { want: 1600, sizes: '(max-width: 720px) 92vw, 60vw', alt: m.caption ?? c.title, near: true }).img;
  const mat = h('div.sig-mat', {}, image);
  const sticky = h(
    'div.sig-sticky',
    {},
    mat,
    h('div.sig-cap', {}, h('b', {}, c.title), h('p', {}, c.wow), link, h('p.credit', {}, m.caption ? m.caption + ' · ' : '', m.credit, ' · ', m.license)),
  );
  const el = h('section.sig.sig-plate', { style: era }, sticky);
  if (!reducedMotion()) {
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total > 0 ? Math.max(0, Math.min(1, -r.top / (total * 0.8))) : 1;
      mat.style.setProperty('--p', p.toFixed(3));
    };
    window.addEventListener('scroll', () => (raf ||= requestAnimationFrame(update)), { passive: true });
    update();
  } else mat.style.setProperty('--p', '1');
  return el;
}

/** An object you insert: the cartridge slides into its slot as you scroll. */
function insert(app: App, c: Card, link: HTMLElement, era: string): HTMLElement {
  const m = c.media!.find((x) => x.type === 'image')!;
  const cart = h('div.sig-cart', {}, progressive(app, m.file, { want: 960, sizes: '420px', alt: m.caption ?? c.title, near: true }).img);
  const slot = h('div.sig-slot', { 'aria-hidden': 'true' }, h('span', {}, pick({ en: 'POWER', ru: 'ПИТАНИЕ' })));
  const done = h('div.sig-done', { 'aria-hidden': 'true' }, pick({ en: '▶ READY', ru: '▶ ГОТОВО' }));
  const el = h(
    'section.sig.sig-insert',
    { style: era },
    h('div.sig-sticky', {}, h('div.sig-stage', {}, cart, slot, done), h('div.sig-cap', {}, h('b', {}, c.title), h('p', {}, c.wow), link, h('p.credit', {}, m.caption ? m.caption + ' · ' : '', m.credit, ' · ', m.license))),
  );
  if (!reducedMotion()) {
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total > 0 ? Math.max(0, Math.min(1, -r.top / (total * 0.75))) : 1;
      el.style.setProperty('--p', p.toFixed(3));
      el.classList.toggle('in', p >= 0.98);
    };
    window.addEventListener('scroll', () => (raf ||= requestAnimationFrame(update)), { passive: true });
    update();
  } else {
    el.style.setProperty('--p', '1');
    el.classList.add('in');
  }
  return el;
}

/** One line at a chapter's end tying it to the cluster. */
export function chapterCoda(chapterId: string, countText: string): HTMLElement {
  return h(
    'p.ch-cluster',
    {},
    pick({
      en: `These ${countText} are objects in release ${chapterId} of the cluster; Griot remembers them. `,
      ru: `Эти ${countText} — объекты релиза ${chapterId} в кластере; Griot их помнит. `,
    }),
    h('a', { href: '#view=engine', 'data-engine': '' }, t('The engine room') + ' →'),
  );
}

function kindLink(c: Card): string {
  return `${pick({ en: 'Open the card', ru: 'Открыть карточку' })} · ${formatYears(c.years)} →`;
}
