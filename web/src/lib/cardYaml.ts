// A card as the cluster holds it: a sankofa.kuberoot.dev/v1alpha1 Card object
// (api/v1alpha1). Coordinates are decimal strings, as in the CRD.
import type { Card } from './types';

function q(s: string): string {
  // Quote when YAML would misread the plain scalar.
  return /^[\w][\w .,'’()/-]*$/u.test(s) && !/^(true|false|yes|no|null|~|\d)/i.test(s) && !s.includes(': ') ? s : JSON.stringify(s);
}

/** A long scalar as a folded block (`>-`), wrapped at word boundaries. */
function folded(key: string, text: string, indent: string, width = 72): string {
  if (indent.length + key.length + text.length + 2 <= width) return `${indent}${key}: ${q(text)}`;
  const lines: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if (line && indent.length + 2 + line.length + 1 + w.length > width) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return `${indent}${key}: >-\n${lines.map((l) => `${indent}  ${l}`).join('\n')}`;
}

function block(text: string, indent: string): string {
  return text
    .split('\n')
    .map((l) => (l ? indent + l : ''))
    .join('\n');
}

export function cardYaml(c: Card): string {
  const out: string[] = [
    'apiVersion: sankofa.kuberoot.dev/v1alpha1',
    'kind: Card',
    'metadata:',
    `  name: ${c.id}`,
    'spec:',
    `  kind: ${c.kind}`,
    `  title: ${q(c.title)}`,
    folded('wow', c.wow, '  '),
    `  years: [${c.years.join(', ')}]`,
    '  places:',
    ...c.places.map((p) => `  - {name: ${q(p.en ?? p.name)}, lat: "${p.lat}", lon: "${p.lon}"}`),
    `  zoom: ${c.zoom}`,
  ];
  if (c.era) out.push(`  era: ${c.era}`);
  out.push(`  books: [${c.books.join(', ')}]`);
  if (c.edition && c.edition !== 'both') out.push(`  edition: ${c.edition}`, `  pair: ${c.pair ?? ''}`);
  if (c.genres?.length) out.push(`  genres: [${c.genres.join(', ')}]`);
  if (c.roots?.length) out.push(`  roots: [${c.roots.join(', ')}]`);
  out.push('  sources:', ...c.sources.map((s) => `  - title: ${q(s.title)}${s.url ? `\n    url: ${s.url}` : ''}`));
  if (c.media?.length) out.push('  media:', ...c.media.map((m) => `  - {type: ${m.type}, file: ${m.file}, license: ${q(m.license)}}`));
  if (c.translations && Object.keys(c.translations).length) out.push(`  translations: {${Object.keys(c.translations).join(', ')}: …}`);
  out.push('  body: |', block(c.body, '    '));
  return out.join('\n');
}

/** `kubectl get cards` as the CRD's printer columns show it. */
export function cardTable(cards: Card[], limit = 9): string {
  const rows = cards.slice(0, limit).map((c) => [c.id, c.title.length > 34 ? c.title.slice(0, 33) + '…' : c.title, c.kind, c.era ?? '']);
  const head = ['NAME', 'TITLE', 'KIND', 'ERA'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)) + 3);
  const line = (r: string[]) => r.map((v, i) => (i < r.length - 1 ? v.padEnd(widths[i]) : v)).join('').trimEnd();
  return [line(head), ...rows.map(line)].join('\n');
}
