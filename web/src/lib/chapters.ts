import { parse as parseYaml } from 'yaml';
import type { Chapter, ChapterTranslation } from './types';

function split(src: string, file: string): { fm: Record<string, any>; body: string } {
  const data = src.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!data.startsWith('---\n')) throw new Error(`${file}: missing front matter`);
  const rest = data.slice(4);
  const end = rest.indexOf('\n---\n');
  if (end < 0) throw new Error(`${file}: unterminated front matter`);
  return { fm: parseYaml(rest.slice(0, end)) ?? {}, body: rest.slice(end + 5).trim() };
}

/** Each paragraph is one scroll step. */
function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/** Parse a chapter Markdown file (docs/card-format.md, "Chapter format"). */
export function parseChapter(src: string, file = 'chapter'): Chapter {
  const { fm, body } = split(src, file);
  if (!fm.id || typeof fm.id !== 'string') throw new Error(`${file}: id is required`);
  if (!fm.title) throw new Error(`${file}: title is required`);
  return {
    id: fm.id,
    title: String(fm.title),
    kicker: String(fm.kicker ?? ''),
    years: Array.isArray(fm.years) ? fm.years.map(Number) : [],
    hero: fm.hero ? { type: 'image', ...fm.hero } : undefined,
    places: Array.isArray(fm.places) ? fm.places : [],
    cards: Array.isArray(fm.cards) ? fm.cards.map(String) : [],
    steps: paragraphs(body),
  };
}

/** Parse a chapter translation (<id>.<lang>.md): title, kicker, heroCaption, body. */
export function parseChapterTranslation(src: string, file = 'translation'): ChapterTranslation {
  const { fm, body } = split(src, file);
  const out: ChapterTranslation = {};
  if (fm.title) out.title = String(fm.title);
  if (fm.kicker) out.kicker = String(fm.kicker);
  const cap = fm.heroCaption ?? (fm.hero && typeof fm.hero === 'object' ? fm.hero.caption : undefined);
  if (cap) out.heroCaption = String(cap);
  const steps = paragraphs(body);
  if (steps.length) out.steps = steps;
  return out;
}

export function sortChapters(chs: Chapter[]): Chapter[] {
  return [...chs].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}
