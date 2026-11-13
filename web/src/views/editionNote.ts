// The two copies, said plainly: what differs, which one you hold, a switch to
// the other, and the list of pairs straight from the cards.
import type { App } from '../app';
import { h, reducedMotion } from '../lib/dom';
import { lang, pick } from '../lib/i18n';
import { setEdition } from '../lib/reader';
import type { Card } from '../lib/types';

/** Short names for the lead sentence, in the cases Russian needs. */
const NAMES: Record<string, { en: string; acc: string; gen: string }> = {
  'douglass-covey': { en: 'Frederick Douglass', acc: 'Фредерика Дугласа', gen: 'Фредерика Дугласа' },
  'jacobs-garret': { en: 'Harriet Jacobs', acc: 'Гарриет Джейкобс', gen: 'Гарриет Джейкобс' },
  tuskegee: { en: 'the Tuskegee study', acc: 'исследование в Таскиги', gen: 'исследования в Таскиги' },
  'henrietta-lacks': { en: 'Henrietta Lacks', acc: 'Генриетту Лакс', gen: 'Генриетты Лакс' },
};
/** The two pairs the lead sentence names, in this order. */
const LEAD = ['freedom', 'consent'];

const EN_NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const RU_IN = ['ни в одном месте', 'в одном месте', 'в двух местах', 'в трёх местах', 'в четырёх местах', 'в пяти местах', 'в шести местах', 'в семи местах', 'в восьми местах', 'в девяти местах', 'в десяти местах'];
const RU_ALL = ['', 'Единственная пара', 'Обе пары', 'Все три пары', 'Все четыре пары', 'Все пять пар', 'Все шесть пар', 'Все семь пар', 'Все восемь пар', 'Все девять пар', 'Все десять пар'];

export interface Pair {
  id: string;
  m: Card;
  f: Card;
}

/** Cards that exist only in one copy, matched by `pair`. */
export function editionPairs(app: Pick<App, 'set'>): Pair[] {
  const by = new Map<string, Partial<Pair>>();
  for (const c of app.set.all()) {
    if ((c.edition !== 'm' && c.edition !== 'f') || !c.pair) continue;
    const p = by.get(c.pair) ?? { id: c.pair };
    p[c.edition] = c;
    by.set(c.pair, p);
  }
  return [...by.values()].filter((p): p is Pair => !!p.m && !!p.f);
}

/** Switch copies at once and rebuild the museum where the reader is. */
export function switchEdition(to: 'm' | 'f'): void {
  setEdition(to);
  location.reload();
}

export function editionNote(app: App): HTMLElement {
  const ru = lang() === 'ru';
  const pairs = editionPairs(app);
  const mine = app.edition;
  const other = mine === 'f' ? 'm' : 'f';
  const n = pairs.length;
  const lead = LEAD.map((id) => pairs.find((p) => p.id === id)).filter(Boolean) as Pair[];
  const swaps = lead.map((p) => {
    const gone = p[other];
    const met = p[mine];
    const g = NAMES[gone.id];
    const m = NAMES[met.id];
    return ru ? { gone: g?.gen ?? `«${gone.title}»`, met: m?.acc ?? `«${met.title}»` } : { gone: g?.en ?? (gone.inline || `“${gone.title}”`), met: m?.en ?? (met.inline || `“${met.title}”`) };
  });
  const swapText = swaps.length
    ? ru
      ? ': ' + swaps.map((s, i) => (i === 0 ? `вместо ${s.gone} вы встретите ${s.met}` : `вместо ${s.gone} — ${s.met}`)).join(', ')
      : ': ' + swaps.map((s, i) => (i === 0 ? `instead of ${s.gone} you will meet ${s.met}` : `instead of ${s.gone}, ${s.met}`)).join(', ')
    : '';
  const text = ru
    ? `Как у Павича, у музея два экземпляра — мужской и женский. Они расходятся ${RU_IN[n] ?? `в ${n} местах`}: одну и ту же тему рассказывает то мужской, то женский голос. У вас — ${mine === 'f' ? 'женский' : 'мужской'}${swapText}.`
    : `Like Pavić’s dictionary, this museum has two copies, a male and a female one. They differ in ${EN_NUM[n] ?? n} places: the same theme is told by a man’s voice in one copy and a woman’s in the other. Yours is the ${mine === 'f' ? 'female' : 'male'} copy${swapText}.`;

  const list = h(
    'ol.ed-pairs',
    {},
    pairs.map((p) =>
      h(
        'li',
        {},
        pairLink(app, p.m),
        h('span.ed-dash', {}, ' / '),
        pairLink(app, p.f),
      ),
    ),
  );
  const box = h('div.ed-box', { hidden: true }, h('p.ed-head', {}, pick({ en: 'Male copy / Female copy', ru: 'Мужской экземпляр / Женский экземпляр' })), list);
  const listBtn = h(
    'button.btn.ed-list',
    {
      type: 'button',
      'aria-expanded': 'false',
      onclick: () => {
        box.hidden = !box.hidden;
        listBtn.setAttribute('aria-expanded', String(!box.hidden));
        // The list opens below the fold on most screens: bring it into view.
        if (!box.hidden) box.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
      },
    },
    ru ? RU_ALL[n] || `Все пары (${n})` : n === 2 ? 'Both pairs' : `All ${EN_NUM[n] ?? n} pairs`,
  );
  return h(
    'div.ed-note',
    {},
    h('p', {}, text),
    h(
      'div.ed-actions',
      {},
      h('button.btn.ed-switch', { type: 'button', onclick: () => switchEdition(other) }, pick({ en: `Open the ${other === 'm' ? 'male' : 'female'} copy`, ru: `Открыть ${other === 'm' ? 'мужской' : 'женский'} экземпляр` })),
      listBtn,
    ),
    box,
  );
}

/** A card of either copy, opened as it is (not swapped for the reader's own). */
export function pairLink(app: App, c: Card): HTMLElement {
  return h(
    'a',
    {
      href: `#focus=${c.id}`,
      class: c.edition === app.edition ? 'mine' : 'other',
      onclick: (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        app.openCard(c.id, { exact: true });
      },
    },
    c.title,
  );
}
