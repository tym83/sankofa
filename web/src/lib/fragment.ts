// The atlas point, encoded exactly like pkg/atlas (Go): url.Values.Encode with
// sorted keys and QueryEscape, so terminal and web share links byte for byte.

export interface Point {
  from?: number;
  to?: number;
  place?: string;
  zoom?: number;
  focus?: string;
  path?: string[];
}

/** Go's url.QueryEscape: unreserved are A-Z a-z 0-9 - _ . ~, space becomes +. */
export function goQueryEscape(s: string): string {
  let out = '';
  for (const byte of new TextEncoder().encode(s)) {
    const c = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.~]/.test(c)) out += c;
    else if (c === ' ') out += '+';
    else out += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

function goQueryUnescape(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, ' '));
}

/** Encode a point as a fragment (without the leading #). */
export function formatFragment(p: Point): string {
  const v: Record<string, string> = {};
  if (p.from) {
    let t = String(p.from);
    if (p.to && p.to !== p.from) t += '-' + p.to;
    v.t = t;
  }
  if (p.place) v.place = p.place;
  if (p.zoom) v.zoom = String(p.zoom);
  if (p.focus) v.focus = p.focus;
  if (p.path && p.path.length) v.path = p.path.join('.');
  return Object.keys(v)
    .sort()
    .map((k) => goQueryEscape(k) + '=' + goQueryEscape(v[k]))
    .join('&');
}

const strictInt = (s: string): number => {
  if (!/^[+-]?\d+$/.test(s)) throw new Error(`bad number ${JSON.stringify(s)}`);
  return parseInt(s, 10);
};

/** Decode a fragment or a full museum URL; throws on what Go rejects. */
export function parseFragment(input: string): Point {
  let s = input;
  const i = s.indexOf('#');
  if (i >= 0) s = s.slice(i + 1);
  const v = new Map<string, string>();
  for (const part of s.split('&')) {
    if (!part) continue;
    if (part.includes(';')) throw new Error('invalid semicolon separator in query');
    const eq = part.indexOf('=');
    const k = goQueryUnescape(eq >= 0 ? part.slice(0, eq) : part);
    const val = goQueryUnescape(eq >= 0 ? part.slice(eq + 1) : '');
    if (!v.has(k)) v.set(k, val); // url.Values.Get returns the first value
  }
  const p: Point = {};
  const t = v.get('t');
  if (t) {
    const dash = t.indexOf('-');
    const a = dash >= 0 ? t.slice(0, dash) : t;
    const b = dash >= 0 ? t.slice(dash + 1) : '';
    p.from = strictInt(a);
    if (b !== '') p.to = strictInt(b);
  }
  const z = v.get('zoom');
  if (z) {
    const n = strictInt(z);
    if (n < 1 || n > 5) throw new Error(`bad zoom ${JSON.stringify(z)}`);
    p.zoom = n;
  }
  if (v.get('place')) p.place = v.get('place');
  if (v.get('focus')) p.focus = v.get('focus');
  const path = v.get('path');
  if (path) p.path = path.split('.');
  return p;
}

/** Same as parseFragment, but never throws: a broken link opens the cover. */
export function safeParse(input: string): Point {
  try {
    return parseFragment(input);
  } catch {
    return {};
  }
}

/** Port of atlas.Slug: the place key used in fragments. */
export function slug(name: string): string {
  let b = '';
  let dash = false;
  // Like Go's fold: drop diacritics, so "Île de Gorée" is "ile-de-goree".
  const folded = name.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC');
  for (const r of folded.toLowerCase()) {
    if ((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')) {
      b += r;
      dash = false;
    } else if (!dash && b.length > 0) {
      b += '-';
      dash = true;
    }
  }
  return b.endsWith('-') ? b.slice(0, -1) : b;
}

export function isEmpty(p: Point): boolean {
  return formatFragment(p) === '';
}

/** The command that opens the same point in the terminal atlas. */
export function terminalCommand(p: Point): string {
  return `sankofa atlas --at '${formatFragment(p)}'`;
}
