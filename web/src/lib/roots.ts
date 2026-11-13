// Roots: how an artist stands on Black traditions, link by sourced link, as
// exported by `sankofa content export` (pkg/roots). Pure logic, no DOM.

export interface RootSource {
  title: string;
  url: string;
}

export type LinkKind = 'influence' | 'cover' | 'sample' | 'interpolation' | 'member' | 'producer' | 'scene' | 'teacher' | 'collaboration';

export interface RootLink {
  to: string; // root:<id> | card:<id>
  /** what kind of borrowing (pkg/roots); absent in older data */
  kind?: LinkKind;
  /** for covers and samples: which song or recording, and what of it */
  what?: string;
  whatRu?: string;
  claim: string;
  claimRu?: string;
  sources: RootSource[];
}

export interface Artist {
  id: string;
  name: string;
  nameRu?: string;
  aliases?: string[];
  years: number[];
  place: { name: string; lat: number; lon: number };
  genre: string;
  genreRu?: string;
  placeRu?: string;
  /** 2–3 sentences: how the artist grew out of the tradition */
  story?: string;
  storyRu?: string;
  links: RootLink[];
  /** each: artist ids, then the final "card:<id>" */
  paths: string[][];
}

/** Lower case, ё as е, no diacritics, no punctuation: what search compares. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Artists matching a query: whole name first, then names that start with it, then any part. */
export function searchArtists(all: Artist[], query: string, limit = 8): Artist[] {
  const q = fold(query);
  if (!q) return [];
  const scored: [number, Artist][] = [];
  for (const a of all) {
    const names = [a.name, a.nameRu ?? '', ...(a.aliases ?? [])].map(fold).filter(Boolean);
    let score = 0;
    for (const n of names) {
      const bare = n.replace(/^the /, '');
      if (n === q || bare === q) score = Math.max(score, 3);
      else if (n.startsWith(q) || bare.startsWith(q) || n.split(' ').some((w) => w.startsWith(q))) score = Math.max(score, 2);
      else if (n.includes(q)) score = Math.max(score, 1);
    }
    if (score) scored.push([score, a]);
  }
  return scored.sort((x, y) => y[0] - x[0] || x[1].name.localeCompare(y[1].name)).slice(0, limit).map((x) => x[1]);
}

/** The link an artist uses to reach the next step of a path. */
export function linkTo(from: Artist | undefined, to: string): RootLink | undefined {
  if (!from) return undefined;
  const target = to.startsWith('card:') ? to : `root:${to}`;
  return from.links.find((l) => l.to === target);
}

/**
 * A family tree growing back to the roots: the paths merged by their shared
 * beginnings. Each node is an artist or the final card; `link` is the sourced
 * step that led to it from its parent.
 */
export interface TreeNode {
  ref: string; // artist id, or "card:<id>"
  link?: RootLink;
  /** a step through the museum's genre lineage (a card's own `roots`) */
  lineage?: boolean;
  children: TreeNode[];
  /** the number of complete chains through this node */
  weight: number;
}

export function buildTree(artist: Artist, byId: Map<string, Artist>): TreeNode {
  const root: TreeNode = { ref: artist.id, children: [], weight: 0 };
  for (const path of artist.paths) {
    if (path[0] !== artist.id || path.length < 2) continue;
    let node = root;
    node.weight++;
    for (let i = 1; i < path.length; i++) {
      const ref = path[i];
      let child = node.children.find((c) => c.ref === ref);
      if (!child) {
        child = { ref, link: linkTo(byId.get(path[i - 1]), ref), children: [], weight: 0 };
        node.children.push(child);
      }
      child.weight++;
      node = child;
    }
  }
  // The strongest branch first.
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => b.weight - a.weight);
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

/** Distinct cards the artist reaches, in tree order. */
export function endCards(tree: TreeNode): string[] {
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    if (n.ref.startsWith('card:') && !out.includes(n.ref)) out.push(n.ref);
    n.children.forEach(walk);
  };
  walk(tree);
  return out;
}

/** "Metallica → Black Sabbath → The blues" for a path, given display names. */
export function chainLine(path: string[], name: (ref: string) => string): string {
  return path.map(name).join(' → ');
}

/** Suggested artists: the ones with the longest and most branching chains. */
export function suggestions(all: Artist[], n = 6): Artist[] {
  const depth = (a: Artist) => Math.max(0, ...a.paths.map((p) => p.length));
  return [...all].filter((a) => a.paths.length).sort((a, b) => depth(b) - depth(a) || b.paths.length - a.paths.length || a.name.localeCompare(b.name)).slice(0, n);
}

export const KIND_LABEL: Record<LinkKind, { en: string; ru: string; glyph: string }> = {
  influence: { en: 'named as influence', ru: 'называл влиянием', glyph: '❝' },
  cover: { en: 'covered', ru: 'перепел', glyph: '↻' },
  sample: { en: 'sampled', ru: 'взял сэмпл', glyph: '◐' },
  interpolation: { en: 'interpolated', ru: 'цитата из песни', glyph: '♪' },
  member: { en: 'played in', ru: 'играл в', glyph: '◎' },
  producer: { en: 'produced', ru: 'продюсер', glyph: '◇' },
  scene: { en: 'same scene', ru: 'одна сцена', glyph: '⁂' },
  teacher: { en: 'taught', ru: 'учил', glyph: '✎' },
  collaboration: { en: 'worked with', ru: 'работал вместе', glyph: '⇄' },
};

/** A museum card as far as lineage needs it: genres name the genres they grew from. */
export interface LineageCard {
  id: string;
  roots?: string[];
}

/**
 * Unwind past the card: every card node that is a genre continues through
 * its `roots`, down to the oldest tradition the museum has. Shared roots are
 * drawn once per branch; cycles are cut.
 */
export function extendLineage(tree: TreeNode, cards: Map<string, LineageCard>, maxDepth = 6): TreeNode {
  const grow = (n: TreeNode, seen: Set<string>, depth: number) => {
    if (n.ref.startsWith('card:') && !n.children.length && depth < maxDepth) {
      const c = cards.get(n.ref.slice(5));
      for (const r of c?.roots ?? []) {
        if (seen.has(r) || !cards.has(r)) continue;
        const child: TreeNode = { ref: `card:${r}`, lineage: true, children: [], weight: n.weight };
        n.children.push(child);
        grow(child, new Set([...seen, r]), depth + 1);
      }
      return;
    }
    n.children.forEach((c) => grow(c, c.ref.startsWith('card:') ? new Set([c.ref.slice(5)]) : seen, depth));
  };
  grow(tree, new Set(), 0);
  return tree;
}

/** The deepest chain of a tree, as refs from the artist to the oldest card. */
export function deepest(tree: TreeNode): string[] {
  let best: string[] = [];
  const walk = (n: TreeNode, path: string[]) => {
    const p = [...path, n.ref];
    if (!n.children.length && p.length > best.length) best = p;
    n.children.forEach((c) => walk(c, p));
  };
  walk(tree, []);
  return best;
}

/**
 * Runs of single steps longer than `keep` are folded: the first and last
 * steps stay, the middle ones hide behind "+N steps". Returns how many to hide.
 */
export function foldRun(length: number, keep = 4): { show: number; hide: number } {
  if (length <= keep) return { show: length, hide: 0 };
  return { show: 2, hide: length - 2 };
}

/**
 * The teaser on the landing: artists with the deepest chains first, then the
 * ones whose links name a sample or a cover.
 */
export function longestRoots(all: Artist[], cards: Map<string, LineageCard>, n = 4): { artist: Artist; chain: string[]; borrowed?: RootLink }[] {
  const byId = new Map(all.map((a) => [a.id, a]));
  const rows = all
    .filter((a) => a.paths.length)
    .map((a) => {
      const chain = deepest(extendLineage(buildTree(a, byId), cards));
      const borrowed = chain
        .map((ref, i) => (i ? linkTo(byId.get(chain[i - 1]), ref) : undefined))
        .find((l) => l && (l.kind === 'sample' || l.kind === 'cover' || l.kind === 'interpolation') && l.what);
      return { artist: a, chain, borrowed };
    });
  return rows.sort((x, y) => y.chain.length - x.chain.length || Number(!!y.borrowed) - Number(!!x.borrowed) || x.artist.name.localeCompare(y.artist.name)).slice(0, n);
}

export interface DagEdge {
  from: string;
  to: string;
  link?: RootLink;
  lineage?: boolean;
}

export interface Dag {
  /** refs in reading order: each after everything that leads to it */
  order: string[];
  /** incoming edges per ref, in order of their sources */
  incoming: Map<string, DagEdge[]>;
  edges: DagEdge[];
}

/**
 * The tree as a graph with shared vertices: every artist and card appears
 * once, and paths that reach the same node converge on it. Order is by the
 * longest way from the artist, so a node comes after all that leads to it.
 */
export function toDag(tree: TreeNode): Dag {
  const edges: DagEdge[] = [];
  const seenEdge = new Set<string>();
  const firstSeen: string[] = [];
  const walk = (n: TreeNode) => {
    if (!firstSeen.includes(n.ref)) firstSeen.push(n.ref);
    for (const c of n.children) {
      const key = `${n.ref}>${c.ref}`;
      if (!seenEdge.has(key)) {
        seenEdge.add(key);
        edges.push({ from: n.ref, to: c.ref, link: c.link, lineage: c.lineage });
      }
      walk(c);
    }
  };
  walk(tree);
  const depth = new Map<string, number>([[tree.ref, 0]]);
  for (let pass = 0; pass < firstSeen.length; pass++) {
    let changed = false;
    for (const e of edges) {
      const d = (depth.get(e.from) ?? 0) + 1;
      if ((depth.get(e.to) ?? -1) < d) {
        depth.set(e.to, d);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const order = [...firstSeen].sort((a, b) => depth.get(a)! - depth.get(b)! || firstSeen.indexOf(a) - firstSeen.indexOf(b));
  const incoming = new Map<string, DagEdge[]>();
  for (const e of edges) incoming.set(e.to, [...(incoming.get(e.to) ?? []), e]);
  for (const list of incoming.values()) list.sort((x, y) => order.indexOf(x.from) - order.indexOf(y.from));
  return { order, incoming, edges };
}

/** Quotation marks of the reader's language: “…” in English, «…» in Russian. */
export function quotes(text: string, lang: string): string {
  if (!text) return text;
  if (lang === 'ru') return text.replace(/[“"]([^”"]+)[”"]/g, '«$1»').replace(/(^|[\s(])'([^']+)'(?=[\s.,;:!?)]|$)/g, '$1«$2»');
  return text.replace(/«([^»]+)»/g, '“$1”').replace(/"([^"]+)"/g, '“$1”').replace(/(^|[\s(])'([^']+)'(?=[\s.,;:!?)]|$)/g, '$1“$2”');
}

/** Children of a node grouped by the same borrowing (kind and what), so one fact is told once. */
export function groupChildren(n: TreeNode): TreeNode[][] {
  const groups: TreeNode[][] = [];
  for (const c of n.children) {
    const key = c.link ? `${c.link.kind ?? ''}|${(c.link.what || c.link.claim).trim()}` : `lineage|${c.ref}`;
    const g = groups.find((x) => x[0].link && `${x[0].link.kind ?? ''}|${(x[0].link.what || x[0].link.claim).trim()}` === key);
    if (g && c.link) g.push(c);
    else groups.push([c]);
  }
  return groups;
}

/** An artist's place in the reader's language. */
export function placeName(a: Pick<Artist, 'place' | 'placeRu'>, lang: string): string {
  return (lang === 'ru' && a.placeRu) || a.place.name;
}
