// Serve the placeholder deep roots (web/fixtures/roots) in place of the
// exported ones, until the deepened collection is merged. Paths are found
// the way pkg/roots does: artist ids, then the final card.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Page } from '@playwright/test';

interface Link {
  to: string;
}
interface Artist {
  id: string;
  links: Link[];
  paths?: string[][];
}

export function fixtureRoots(): Artist[] {
  const dir = join(process.cwd(), 'fixtures', 'roots');
  const all: Artist[] = readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => parse(readFileSync(join(dir, f), 'utf8')));
  const byId = new Map(all.map((a) => [a.id, a]));
  for (const a of all) {
    const paths: string[][] = [];
    const walk = (id: string, chain: string[]) => {
      for (const l of byId.get(id)?.links ?? []) {
        const [kind, ref] = l.to.split(':');
        if (kind === 'card') paths.push([...chain, id, l.to]);
        else if (!chain.includes(ref)) walk(ref, [...chain, id]);
      }
    };
    walk(a.id, []);
    a.paths = paths;
  }
  return all;
}

export async function serveFixtureRoots(page: Page): Promise<void> {
  const roots = fixtureRoots();
  await page.route('**/data/cards.json', async (route) => {
    const res = await route.fetch();
    const data = await res.json();
    await route.fulfill({ response: res, json: { ...data, roots } });
  });
}
