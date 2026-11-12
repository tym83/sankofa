// What the atlas shows at each zoom level. Zoom is a level of generalisation:
// 1 big movements, 2 regions, 3 cities and genres, 4 people, 5 one document.
import type { Card, Edition } from './types';
import { CardSet, overlaps } from './cards';
import { MOVEMENTS, REGIONS, regionOf } from './movements';
import type { MapPoint, MapRegion, MapRoute } from '../views/map';

export const eraColor = (era?: string): string => `var(--${/^v[0-7]$/.test(era ?? '') ? era : 'v0'})`;

export interface AtlasQuery {
  level: number;
  from?: number;
  to?: number;
  focus?: string;
  edition: Exclude<Edition, 'both'> | '';
  lit?: string[];
}

/** Cards in the reader's copy: shared cards plus the reader's half of each pair. */
export function readerCards(set: CardSet, edition: AtlasQuery['edition']): Card[] {
  return set.all().filter((c) => !edition || c.edition === 'both' || c.edition === edition);
}

/** Spread cards that share a place on a small spiral so each stays clickable. */
function spread(cards: Card[], level: number): Map<string, [number, number]> {
  const groups = new Map<string, Card[]>();
  for (const c of cards) {
    const p = c.places[0];
    const key = `${p.lon.toFixed(1)},${p.lat.toFixed(1)}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const out = new Map<string, [number, number]>();
  const step = 2.2 / [1, 2.2, 4.6, 9, 18][level - 1];
  for (const g of groups.values()) {
    g.forEach((c, i) => {
      const p = c.places[0];
      if (i === 0) return out.set(c.id, [p.lon, p.lat]);
      const a = i * 2.4;
      const r = step * Math.sqrt(i);
      out.set(c.id, [p.lon + Math.cos(a) * r, p.lat + Math.sin(a) * r * 0.8]);
    });
  }
  return out;
}

function arcs(c: Card, color: string, opts: Partial<MapRoute> = {}): MapRoute | null {
  if (c.places.length < 2) return null;
  const [o, ...rest] = c.places;
  return {
    id: `card:${c.id}`,
    legs: rest.map((p) => ({ from: [o.lon, o.lat], to: [p.lon, p.lat] })),
    color,
    ...opts,
  };
}

export interface AtlasLayers {
  points: MapPoint[];
  routes: MapRoute[];
  regions: MapRegion[];
  visible: Card[];
}

export function atlasLayers(set: CardSet, q: AtlasQuery, extra: Card[] = []): AtlasLayers {
  const lvl = Math.max(1, Math.min(5, q.level));
  const own = readerCards(set, q.edition);
  const cards = [...own, ...extra.filter((e) => !own.includes(e))];
  const pos = spread(cards, lvl);
  const lit = new Set(q.lit ?? []);
  const points: MapPoint[] = [];
  const routes: MapRoute[] = [];
  const visible: Card[] = [];

  for (const c of cards) {
    const inTime = overlaps(c, q.from, q.to);
    const focus = c.id === q.focus;
    const major = c.zoom <= lvl || focus || lit.has(c.id);
    const [lon, lat] = pos.get(c.id)!;
    if (inTime && major) visible.push(c);
    points.push({
      id: c.id,
      lon,
      lat,
      label: c.title,
      title: c.kind === 'person' || c.kind === 'work' || lvl >= 4,
      color: eraColor(c.era),
      minor: !major,
      out: !inTime && !focus,
      lit: lit.has(c.id) || focus,
      focus,
      priority: (focus ? 100 : 0) + (lit.has(c.id) ? 50 : 0) + (6 - c.zoom) * 2 + (c.media?.length ? 1 : 0),
      aria: `${c.title}, ${c.places[0].name}. ${c.wow}`,
    });
    if (!inTime && !focus) continue;
    const color = eraColor(c.era);
    if (focus) {
      const r = arcs(c, color, { flow: true });
      if (r) routes.push(r);
    } else if (c.kind === 'genre' && lvl >= 3 && lvl <= 4) {
      const r = arcs(c, color, { flow: lvl === 3 });
      if (r) routes.push(r);
    } else if (c.zoom === 1 && lvl <= 2) {
      const r = arcs(c, color, { flow: lvl === 1, faint: lvl === 2 });
      if (r) routes.push(r);
    } else if (lvl >= 4 && c.zoom <= lvl && (c.kind === 'person' || c.kind === 'event')) {
      const r = arcs(c, color, { faint: true });
      if (r) routes.push(r);
    }
  }

  // Genre lineage (pkg/card roots): a genre grows from its roots' homes.
  if (lvl >= 3 && lvl <= 4) {
    for (const c of cards) {
      if (c.kind !== 'genre' || !c.roots?.length || !overlaps(c, q.from, q.to)) continue;
      const legs = c.roots
        .map((r) => set.get(r))
        .filter((r): r is Card => !!r)
        .map((r) => ({ from: [r.places[0].lon, r.places[0].lat] as [number, number], to: [c.places[0].lon, c.places[0].lat] as [number, number] }))
        .filter((l) => l.from[0] !== l.to[0] || l.from[1] !== l.to[1]);
      if (legs.length) routes.push({ id: `roots:${c.id}`, legs, color: eraColor(c.era), flow: true });
    }
  }

  if (lvl <= 2) {
    for (const m of MOVEMENTS) {
      if (q.from && !(m.years[1] >= q.from && m.years[0] <= (q.to ?? q.from))) continue;
      routes.unshift({
        id: `mv:${m.id}`,
        legs: m.legs,
        color: eraColor(m.era),
        flow: lvl === 1,
        faint: lvl === 2,
        label: lvl === 1 ? { text: m.title, sub: m.sub, at: m.label } : undefined,
      });
    }
  }

  const regions: MapRegion[] = [];
  if (lvl === 2) {
    const tally = new Map<string, { n: number; eras: Map<string, number>; lon: number; lat: number }>();
    for (const c of cards) {
      if (!overlaps(c, q.from, q.to)) continue;
      const p = c.places[0];
      const r = regionOf(p.lon, p.lat);
      if (!r) continue;
      const t = tally.get(r.id) ?? { n: 0, eras: new Map(), lon: 0, lat: 0 };
      t.n++;
      t.lon += p.lon;
      t.lat += p.lat;
      t.eras.set(c.era ?? 'v0', (t.eras.get(c.era ?? 'v0') ?? 0) + 1);
      tally.set(r.id, t);
    }
    for (const r of REGIONS) {
      const t = tally.get(r.id);
      if (!t) continue;
      const era = [...t.eras.entries()].sort((a, b) => b[1] - a[1])[0][0];
      regions.push({ id: r.id, name: r.name, lon: t.lon / t.n, lat: t.lat / t.n, count: t.n, color: eraColor(era) });
    }
  }

  return { points, routes, regions, visible };
}
