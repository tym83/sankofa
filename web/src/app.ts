import type { Card, Chapter, Book } from './lib/types';
import { CardSet, segments } from './lib/cards';
import { type Point } from './lib/fragment';
import { placeKey } from './lib/cards';
import { lang } from './lib/i18n';
import { t } from './lib/i18n';
import { h } from './lib/dom';

export interface App {
  set: CardSet;
  /** The card as exported (English, with translations), as the cluster holds it. */
  raw(id: string): Card | undefined;
  openEngine(push?: boolean): void;
  chapters: Chapter[];
  edition: 'm' | 'f';
  media(file: string): string;
  /** Open a card over the current view. `asked` is what the link pointed to. */
  openCard(id: string, opts?: { exact?: boolean; push?: boolean }): void;
  closeCard(): void;
  openAtlas(p: Point, push?: boolean): void;
  openBook(): void;
  openDescent(year?: number, push?: boolean): void;
  /** Story position, kept in the fragment as ch=… next to the atlas keys. */
  chapterInView(id: string | null): void;
  onPath(cb: (path: string[]) => void): void;
}

export function cardPoint(c: Card): Point {
  const [a, b] = [c.years[0], c.years[1]];
  return { from: a, to: b && b !== a ? b : undefined, place: placeKey(c.places[0]), zoom: c.zoom, focus: c.id, lang: lang() === 'en' ? undefined : lang() };
}

export const EDITION_NAME = { m: 'male copy', f: 'female copy' } as const;

/** Text with [[links]] as DOM; links carry the book symbol of their target. */
export function richText(app: App, text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const s of segments(text)) {
    if (!('target' in s)) {
      frag.append(s.text);
      continue;
    }
    const target = app.set.forEdition(s.target, app.edition) ?? app.set.get(s.target);
    if (!target) {
      frag.append(h('span.xref.missing', { title: t('This card is not written yet') }, s.text));
      continue;
    }
    const book: Book | undefined = target.books[0];
    frag.append(
      h(
        `a.xref.${book ?? 'heirs'}`,
        {
          href: `#focus=${s.target}`,
          'data-card': s.target,
          title: `${target.title}: ${target.wow}`,
        },
        // A bare [[id]] shows the title of the card it names; an explicit
        // [[id|text]] always shows its own words, even when they equal the id.
        s.explicit ? s.text : (app.set.get(s.target)?.title ?? s.text),
      ),
    );
  }
  return frag;
}
