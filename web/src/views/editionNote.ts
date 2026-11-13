// The two copies, said plainly: what differs, which one you hold, a switch to
// the other, and the list of pairs straight from the cards.
import type { App } from '../app';
import { h, reducedMotion } from '../lib/dom';
import { lang, pick } from '../lib/i18n';
import { setEdition } from '../lib/reader';
import { rememberPlace } from '../lib/place';
import type { Card } from '../lib/types';

/** Short names for the list sentence; Russian in the nominative. */
const NAMES: Record<string, { en: string; ru: string }> = {
  'douglass-covey': { en: 'Frederick Douglass', ru: 'Фредерик Дуглас' },
  'jacobs-garret': { en: 'Harriet Jacobs', ru: 'Гарриет Джейкобс' },
  tuskegee: { en: 'the Tuskegee study', ru: 'исследование в Таскиги' },
  'henrietta-lacks': { en: 'Henrietta Lacks', ru: 'Генриетта Лакс' },
  'robert-smalls': { en: 'Robert Smalls', ru: 'Роберт Смоллс' },
  'combahee-raid': { en: 'the Combahee River Raid', ru: 'рейд на реке Комбахи' },
};

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
  // In the order the chapters tell them.
  return [...by.values()].filter((p): p is Pair => !!p.m && !!p.f).sort((a, b) => (a.m.era ?? '').localeCompare(b.m.era ?? ''));
}

/** Switch copies at once and rebuild the museum where the reader is. */
export function switchEdition(to: 'm' | 'f'): void {
  setEdition(to);
  // Come back to the same place in the story after the rebuild.
  const here = rememberPlace();
  if (here && !/(^|[#&])view=/.test(location.hash)) {
    const q = new URLSearchParams(location.hash.slice(1));
    q.set('ch', here.ch);
    history.replaceState(null, '', `#${q.toString()}`);
  }
  location.reload();
}

export function editionNote(app: App): HTMLElement {
  const ru = lang() === 'ru';
  const pairs = editionPairs(app);
  const mine = app.edition;
  const other = mine === 'f' ? 'm' : 'f';
  const n = pairs.length;
  // Every pair from the data, in each copy's own words.
  const name = (c: Card) => (ru ? NAMES[c.id]?.ru ?? `«${c.title}»` : NAMES[c.id]?.en ?? (c.inline || `“${c.title}”`));
  const join = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ${ru ? 'и' : 'and'} ${xs[xs.length - 1]}` : xs.join(''));
  const fList = join(pairs.map((p) => name(p.f)));
  const mList = join(pairs.map((p) => name(p.m)));
  const text = ru
    ? `Как у Павича, у музея два экземпляра — мужской и женский. Они расходятся ${RU_IN[n] ?? `в ${n} местах`}: одну и ту же тему там рассказывают разные истории. В женском экземпляре — ${fList}; в мужском — ${mList}. У вас — ${mine === 'f' ? 'женский' : 'мужской'}.`
    : `Like Pavić’s dictionary, this museum has two copies, a male and a female one. They differ in ${EN_NUM[n] ?? n} places, where the same theme is told through a different story. In the female copy you read ${fList}; in the male copy, ${mList}. Yours is the ${mine === 'f' ? 'female' : 'male'} copy.`;

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
export function pairLink(app: App, c: Card, label?: string): HTMLElement {
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
    label ?? c.title,
  );
}
