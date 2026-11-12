// Shapes of the data the museum reads. Cards mirror `sankofa content export`
// (pkg/card.Card plus backlinks); chapters come from scripts/build-chapters.ts.

export type Book = 'voices' | 'archives' | 'heirs';
export type Edition = 'both' | 'm' | 'f';

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export interface Source {
  title: string;
  url?: string;
}

export interface Media {
  type: 'image' | 'audio';
  file: string;
  caption?: string;
  credit: string;
  license: string;
  url?: string;
}

export interface Card {
  id: string;
  kind: string;
  title: string;
  wow: string;
  years: number[];
  places: Place[];
  zoom: number;
  era?: string;
  books: Book[];
  edition?: Edition;
  pair?: string;
  tags?: string[];
  genres?: string[];
  further?: string[];
  sources: Source[];
  media?: Media[];
  dispute?: string;
  body: string;
  backlinks?: string[];
}

export interface Chapter {
  id: string;
  title: string;
  kicker: string;
  years: number[];
  hero?: Media & { type?: 'image' };
  places: Place[];
  cards: string[];
  steps: string[];
}

export interface CardsFile {
  version: number;
  cards: Card[];
}

export interface ChaptersFile {
  version: number;
  chapters: Chapter[];
}

export const BOOK_SYMBOLS: Record<Book, string> = {
  voices: '❝',
  archives: '▤',
  heirs: '✶',
};

export const BOOK_NAMES: Record<Book, string> = {
  voices: 'Book of Voices',
  archives: 'Book of Archives',
  heirs: 'Book of Heirs',
};

/** Default spans of the eras, used when a chapter is missing. */
export const ERAS: { id: string; label: string; from: number; to: number }[] = [
  { id: 'v0', label: 'Africa before', from: 1300, to: 1500 },
  { id: 'v1', label: 'Middle Passage', from: 1501, to: 1866 },
  { id: 'v2', label: 'Resistance', from: 1520, to: 1865 },
  { id: 'v3', label: 'Voices', from: 1760, to: 1940 },
  { id: 'v4', label: 'Diaspora', from: 1700, to: 1900 },
  { id: 'v5', label: 'Harlem and Négritude', from: 1900, to: 1945 },
  { id: 'v6', label: 'Civil rights', from: 1945, to: 1975 },
  { id: 'v7', label: 'Afrofuturism', from: 1950, to: new Date().getFullYear() },
];
