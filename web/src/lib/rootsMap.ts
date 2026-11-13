// The music map: every artist and every link of the roots collection as one
// graph converging on the museum's cards and, through their genre roots, on
// the oldest traditions. Pure model and layout, no DOM.
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';

type SimEdge = SimulationLinkDatum<GNode> & GEdge;
import type { Artist, LinkKind } from './roots';

export interface MapCard {
  id: string;
  title: string;
  years: number[];
  roots?: string[];
}

export interface GNode extends SimulationNodeDatum {
  id: string; // artist id or "card:<id>"
  card: boolean;
  label: string;
  year: number;
  /** how many artists stand on this node (reach it through their links) */
  support: number;
  x?: number;
  y?: number;
}

export interface GEdge {
  from: string;
  to: string;
  kind: LinkKind | 'lineage' | 'unknown';
}

export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  byId: Map<string, GNode>;
  out: Map<string, string[]>;
  in: Map<string, string[]>;
}

export function buildGraph(artists: Artist[], cards: Map<string, MapCard>, name: (a: Artist) => string): Graph {
  const byId = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const add = (n: GNode) => byId.get(n.id) ?? (byId.set(n.id, n), n);
  for (const a of artists) add({ id: a.id, card: false, label: name(a), year: a.years[0] ?? 1950, support: 0 });
  const addCard = (id: string): GNode | undefined => {
    const c = cards.get(id);
    if (!c) return undefined;
    const known = byId.get(`card:${id}`);
    if (known) return known;
    const n = add({ id: `card:${id}`, card: true, label: c.title, year: c.years[0] ?? 1900, support: 0 });
    for (const r of c.roots ?? []) {
      if (addCard(r)) edges.push({ from: n.id, to: `card:${r}`, kind: 'lineage' });
    }
    return n;
  };
  for (const a of artists) {
    for (const l of a.links) {
      const [k, ref] = l.to.split(':');
      const to = k === 'card' ? (addCard(ref) ? `card:${ref}` : undefined) : byId.has(ref) ? ref : undefined;
      if (to) edges.push({ from: a.id, to, kind: l.kind ?? 'unknown' });
    }
  }
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const e of edges) {
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
    inn.set(e.to, [...(inn.get(e.to) ?? []), e.from]);
  }
  const g: Graph = { nodes: [...byId.values()], edges, byId, out, in: inn };
  for (const a of artists) for (const id of reach(g, a.id)) if (id !== a.id) byId.get(id)!.support++;
  return g;
}

/** Everything a node stands on: its links followed down to the oldest roots. */
export function reach(g: Graph, id: string): Set<string> {
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length) for (const n of g.out.get(stack.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), stack.push(n));
  return seen;
}

/** Everything that grew out of a node. */
export function grewFrom(g: Graph, id: string): Set<string> {
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length) for (const n of g.in.get(stack.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), stack.push(n));
  return seen;
}

/** The root most artists lead back to, for the headline. */
export function headline(g: Graph): { total: number; root?: GNode; count: number } {
  const artists = g.nodes.filter((n) => !n.card);
  const roots = g.nodes.filter((n) => n.card && !(g.out.get(n.id)?.length));
  let best: GNode | undefined;
  let count = 0;
  for (const r of roots) {
    const n = [...grewFrom(g, r.id)].filter((id) => !g.byId.get(id)!.card).length;
    if (n > count) {
      count = n;
      best = r;
    }
  }
  return { total: artists.length, root: best, count };
}

/**
 * Lay out once, deterministically: time runs bottom to top (oldest at the
 * bottom), links pull together, nodes keep apart. `h` grows with the years.
 */
/** Height for a year: the last century gets most of it, where the artists are. */
export function yearY(year: number, h: number, years: [number, number]): number {
  const [y0, y1] = years;
  const split = Math.min(y1 - 1, Math.max(y0 + 1, 1900));
  const t = Math.max(y0, Math.min(y1, year));
  const f = t <= split ? ((t - y0) / (split - y0)) * 0.28 : 0.28 + ((t - split) / (y1 - split)) * 0.72;
  return h - 50 - f * (h - 100);
}

export function layout(g: Graph, w: number, h: number, years: [number, number]): void {
  const yOf = (year: number) => yearY(year, h, years);
  // Artists start spread across the width by their family: the root card
  // their first link reaches, so related lines grow side by side.
  const fam = new Map<string, number>();
  const roots = g.nodes.filter((n) => n.card).sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  roots.forEach((r, i) => fam.set(r.id, (i + 0.5) / roots.length));
  const famOf = (id: string): number => {
    let cur = id;
    for (let i = 0; i < 12; i++) {
      if (fam.has(cur)) return fam.get(cur)!;
      const next = g.out.get(cur)?.[0];
      if (!next) break;
      cur = next;
    }
    return 0.5;
  };
  for (const n of g.nodes) {
    let s = 0;
    for (const ch of n.id) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    const f = n.card ? 0.5 + (famOf(n.id) - 0.5) * 0.35 : famOf(n.id) * 0.8 + 0.1 + ((s % 1000) / 1000 - 0.5) * 0.25;
    n.x = 40 + f * (w - 80);
    n.y = yOf(n.year);
  }
  const target = new Map(g.nodes.map((n) => [n.id, n.x!]));
  const sim = forceSimulation<GNode>(g.nodes)
    .force('y', forceY<GNode>((n) => yOf(n.year)).strength(0.85))
    .force('x', forceX<GNode>((n) => target.get(n.id)!).strength((n) => (n.card ? 0.25 : 0.06)))
    .force('charge', forceManyBody<GNode>().strength(-38).distanceMax(220))
    .force('link', forceLink<GNode, SimEdge>(g.edges.map((e) => ({ ...e, source: e.from, target: e.to }))).id((n) => n.id).strength(0.04).distance(60))
    .force('collide', forceCollide<GNode>((n) => radius(n) + (n.card ? 26 : 14)))
    .stop();
  for (let i = 0; i < 300; i++) sim.tick();
  // Keep room for labels at both edges.
  for (const n of g.nodes) n.x = Math.max(70, Math.min(w - 70, n.x ?? w / 2));
}

export function radius(n: GNode): number {
  return (n.card ? 7 : 4) + Math.sqrt(n.support) * (n.card ? 2.4 : 1.6);
}
