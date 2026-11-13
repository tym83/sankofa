// Where the reader is in the story, kept across a rebuild (language or copy
// switch): the chapter in view and how far into it, in this tab only.

const KEY = 'sankofa.place';

export interface Place {
  ch: string;
  frac: number;
}

/** The chapter at the middle of the screen and the reader's depth in it. */
export function placeNow(): Place | undefined {
  const mid = window.innerHeight / 2;
  for (const el of document.querySelectorAll<HTMLElement>('article.chapter')) {
    const r = el.getBoundingClientRect();
    if (r.top <= mid && r.bottom >= mid) return { ch: el.dataset.chapter!, frac: Math.max(0, Math.min(1, -r.top / Math.max(1, r.height))) };
  }
  return undefined;
}

/** Remember the place before the page is rebuilt; returns it for the link. */
export function rememberPlace(): Place | undefined {
  const p = placeNow();
  try {
    if (p) sessionStorage.setItem(KEY, JSON.stringify(p));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the chapter in the link is enough */
  }
  return p;
}

/** The remembered place for this chapter, once. */
export function takePlace(ch: string): Place | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const p = raw ? (JSON.parse(raw) as Place) : undefined;
    return p && p.ch === ch ? p : undefined;
  } catch {
    return undefined;
  }
}
