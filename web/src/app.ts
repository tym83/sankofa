import type { Card, Chapter, Book } from './lib/types';
import { CardSet, bookSymbols, segments } from './lib/cards';
import { slug, type Point } from './lib/fragment';
import { h } from './lib/dom';

export interface App {
  set: CardSet;
  chapters: Chapter[];
  edition: 'm' | 'f';
  media(file: string): string;
  /** Open a card over the current view. `asked` is what the link pointed to. */
  openCard(id: string, opts?: { exact?: boolean; push?: boolean }): void;
  closeCard(): void;
  openAtlas(p: Point, push?: boolean): void;
  openBook(): void;
  /** Story position, kept in the fragment as ch=… next to the atlas keys. */
  chapterInView(id: string | null): void;
  onPath(cb: (path: string[]) => void): void;
}

export function cardPoint(c: Card): Point {
  const [a, b] = [c.years[0], c.years[1]];
  return { from: a, to: b && b !== a ? b : undefined, place: slug(c.places[0].name), zoom: c.zoom, focus: c.id };
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
      frag.append(h('span.xref.missing', { title: 'This card is not written yet' }, s.text));
      continue;
    }
    const book: Book | undefined = target.books[0];
    const symbols = bookSymbols(target.books);
    frag.append(
      h(
        `a.xref.${book ?? 'heirs'}`,
        {
          href: `#focus=${s.target}`,
          'data-card': s.target,
          title: `${target.title}: ${target.wow}`,
        },
        h('span.sym', { 'aria-hidden': 'true' }, symbols),
        // A bare [[some-id]] reads as words in prose.
        s.text === s.target ? s.text.replace(/-/g, ' ') : s.text,
      ),
    );
  }
  return frag;
}
