// What the reader keeps in their own browser: the edition they hold, the path
// they walked, the theme. The server knows nothing about visitors.
import type { Edition } from './types';

const K = { edition: 'sankofa.edition', path: 'sankofa.path', theme: 'sankofa.theme' };
const MAX_PATH = 200;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: keep going without memory */
  }
}

/** The copy this reader holds. Like an installation, it is dealt once at random. */
export function edition(random = Math.random): Exclude<Edition, 'both'> {
  const e = read(K.edition);
  if (e === 'm' || e === 'f') return e;
  const dealt = random() < 0.5 ? 'm' : 'f';
  write(K.edition, dealt);
  return dealt;
}

export function readPath(): string[] {
  const raw = read(K.path);
  return raw ? raw.split('.').filter(Boolean) : [];
}

/** Append a visit; a repeated visit to the same card is one step. */
export function appendPath(path: string[], id: string): string[] {
  if (path[path.length - 1] === id) return path;
  return [...path, id].slice(-MAX_PATH);
}

export function recordVisit(id: string): string[] {
  const next = appendPath(readPath(), id);
  write(K.path, next.join('.'));
  return next;
}

export function clearPath(): void {
  write(K.path, '');
}

export type Theme = 'dark' | 'light';

export function theme(): Theme {
  return read(K.theme) === 'light' ? 'light' : 'dark';
}

export function setTheme(t: Theme): void {
  write(K.theme, t);
}
