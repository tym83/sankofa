// Fixed labels (eras, regions, movements, zoom levels, kinds, books) are
// translated once at start-up, before any view is built.
import { ERAS, BOOK_NAMES } from './types';
import { KIND_LABEL } from './cards';
import { MOVEMENTS, REGIONS } from './movements';
import { LEVEL_NAMES } from '../views/map';
import { t, type Lang } from './i18n';

/** Russian chapter titles that read as unfinished on their own. */
export const RU_TITLE_FIX: Record<string, string> = { 'Африка до': 'Африка до работорговли' };

export function localizeStatics(l: Lang): void {
  if (l === 'en') return;
  for (const e of ERAS) e.label = t(e.label);
  for (const r of REGIONS) r.name = t(r.name);
  for (const m of MOVEMENTS) {
    m.title = m.ru.title;
    m.sub = m.ru.sub;
  }
  LEVEL_NAMES.forEach((n, i) => (LEVEL_NAMES[i] = t(n)));
  for (const k of Object.keys(KIND_LABEL)) KIND_LABEL[k] = t(KIND_LABEL[k]);
  for (const k of Object.keys(BOOK_NAMES) as (keyof typeof BOOK_NAMES)[]) BOOK_NAMES[k] = t(BOOK_NAMES[k]);
}
