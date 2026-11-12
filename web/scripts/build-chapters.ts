// Convert chapter Markdown (content/chapters/*.md) into data/chapters.json.
// Usage: node scripts/build-chapters.ts <chapters-dir> <out.json>
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseChapter, sortChapters } from '../src/lib/chapters.ts';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error('usage: build-chapters.ts <chapters-dir> <out.json>');
  process.exit(2);
}
const files = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.endsWith('.ru.md'));
const chapters = sortChapters(files.map((f) => parseChapter(readFileSync(join(dir, f), 'utf8'), f)));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ version: 1, chapters }, null, 1));
console.log(`${chapters.length} chapters -> ${out}`);
