// Convert chapter Markdown (content/chapters/*.md) into data/chapters.json.
// Usage: node scripts/build-chapters.ts <chapters-dir> <out.json>
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseChapter, parseChapterTranslation, sortChapters } from '../src/lib/chapters.ts';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error('usage: build-chapters.ts <chapters-dir> <out.json>');
  process.exit(2);
}
const LANGS = ['ru'];
const files = readdirSync(dir).filter((f) => f.endsWith('.md') && !/\.[a-z]{2}\.md$/.test(f));
const chapters = sortChapters(
  files.map((f) => {
    const ch = parseChapter(readFileSync(join(dir, f), 'utf8'), f);
    for (const lang of LANGS) {
      const tf = join(dir, f.replace(/\.md$/, `.${lang}.md`));
      if (!existsSync(tf)) continue;
      const tr = parseChapterTranslation(readFileSync(tf, 'utf8'), tf);
      if (tr.steps && tr.steps.length !== ch.steps.length) {
        console.warn(`${tf}: ${tr.steps.length} paragraphs, the original has ${ch.steps.length}; the body stays in English`);
        delete tr.steps;
      }
      ch.translations = { ...ch.translations, [lang]: tr };
    }
    return ch;
  }),
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ version: 1, chapters }, null, 1));
console.log(`${chapters.length} chapters -> ${out}`);
