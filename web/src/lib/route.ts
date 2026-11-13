// The museum's own position next to the shared atlas point: which view is
// open (view=descent) and which chapter the story is at (ch=v3). Go's
// atlas.Parse ignores these keys, so terminal links stay compatible.
import { formatFragment, goQueryEscape, safeParse, type Point } from './fragment';

export type View = 'descent' | 'listen' | 'atlas' | 'engine' | 'roots' | 'roots-map';

export interface Route {
  point: Point;
  ch?: string;
  view?: View;
  /** the artist the roots view is rooted on */
  artist?: string;
}

export function parseRoute(hash: string): Route {
  const s = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = new URLSearchParams(s);
  const v = q.get('view');
  const view = v === 'descent' || v === 'listen' || v === 'atlas' || v === 'engine' || v === 'roots' || v === 'roots-map' ? v : undefined;
  const artist = q.get('artist') ?? undefined;
  return { point: safeParse(s), ch: q.get('ch') ?? undefined, view, ...(artist ? { artist } : {}) };
}

/** The fragment for a route: atlas keys as Go writes them, museum keys after. */
export function formatRoute(r: Route): string {
  const extra: string[] = [];
  if (r.ch) extra.push('ch=' + goQueryEscape(r.ch));
  if (r.view) extra.push('view=' + r.view);
  if (r.artist) extra.push('artist=' + goQueryEscape(r.artist));
  return [formatFragment(r.point), ...extra].filter(Boolean).join('&');
}

/** Which screen a route opens. */
export function screenOf(r: Route): View | 'story' {
  if (r.view) return r.view;
  if (!r.ch && (r.point.path?.length || r.point.from || r.point.place || r.point.zoom)) return 'atlas';
  return 'story';
}
