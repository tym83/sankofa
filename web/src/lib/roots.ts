// Roots: how an artist stands on Black traditions, link by sourced link, as
// exported by `sankofa content export` (pkg/roots). Pure logic, no DOM.

export interface RootSource {
  title: string;
  url: string;
}

export interface RootLink {
  to: string; // root:<id> | card:<id>
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
