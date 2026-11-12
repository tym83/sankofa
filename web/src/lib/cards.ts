import type { Book, Card, Edition, Place } from './types';
import { BOOK_SYMBOLS } from './types';
import { slug } from './fragment';

// Same expression as pkg/card linkRe.
const LINK_RE = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;

export type Segment = { text: string } | { target: string; text: string };

/** Split text into plain runs and [[links]], in order. */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ target: m[1], text: m[2] ?? m[1] });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function links(text: string): string[] {
  return [...text.matchAll(LINK_RE)].map((m) => m[1]);
}

export function plain(text: string): string {
  return text.replace(LINK_RE, (_, id: string, t?: string) => t ?? id);
}

export class CardSet {
  readonly byId = new Map<string, Card>();
  readonly order: string[];

  constructor(cards: Card[]) {
    for (const c of cards) {
      this.byId.set(c.id, { ...c, edition: c.edition || 'both' });
    }
    this.order = [...this.byId.keys()].sort();
  }

  get(id: string): Card | undefined {
    return this.byId.get(id);
  }

  all(): Card[] {
    return this.order.map((id) => this.byId.get(id)!);
  }

  /** Port of card.Set.ForEdition: m/f cards swap for the reader's copy. */
  forEdition(id: string, edition: Edition | ''): Card | undefined {
    const c = this.byId.get(id);
    if (!c || c.edition === 'both' || c.edition === edition || !edition) return c;
    for (const oid of this.order) {
      const o = this.byId.get(oid)!;
      if (o.pair === c.pair && o.id !== c.id) return o;
    }
    return c;
  }

  /** The other copy of an m/f card, if any. */
  partner(id: string): Card | undefined {
    const c = this.byId.get(id);
    if (!c?.pair) return undefined;
    return this.all().find((o) => o.pair === c.pair && o.id !== c.id);
  }

  backlinks(id: string): string[] {
    const c = this.byId.get(id);
    if (c?.backlinks) return c.backlinks;
    return this.order.filter((oid) => links(this.byId.get(oid)!.body).includes(id));
  }

  /** Resolve a fragment place key: a card id, or the slug of a place name. */
  resolvePlace(key: string): Place | undefined {
    const byCard = this.byId.get(key);
    if (byCard?.places[0]) return byCard.places[0];
    let partial: Place | undefined;
    for (const c of this.all()) {
      for (const p of c.places) {
        const s = slug(p.name);
        if (s === key) return p;
        if (!partial && s.split('-').includes(key)) partial = p;
      }
    }
    return partial;
  }
}

export function bookSymbols(books: Book[] | undefined): string {
  return (books ?? []).map((b) => BOOK_SYMBOLS[b] ?? '').join('');
}

export function span(c: { years: number[] }): [number, number] {
  const a = c.years[0];
  const b = c.years[1] ?? a;
  return [a, b];
}

export function formatYears(years: number[]): string {
  if (!years.length) return '';
  const fmt = (y: number) => (y < 0 ? `${-y} BCE` : String(y));
  return years.length > 1 && years[1] !== years[0] ? `${fmt(years[0])}–${fmt(years[1])}` : fmt(years[0]);
}

export const KIND_LABEL: Record<string, string> = {
  person: 'Person',
  genre: 'Genre',
  place: 'Place',
  object: 'Object',
  language: 'Language',
  script: 'Script',
  instrument: 'Instrument',
  event: 'Event',
  media: 'Media',
  work: 'Work',
  myth: 'Myth, examined',
  comparison: 'Comparison',
};

export function overlaps(c: { years: number[] }, from?: number, to?: number): boolean {
  if (!from) return true;
  const [a, b] = span(c);
  const end = to ?? from;
  return b >= from && a <= end;
}
