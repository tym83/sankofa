import { parse as parseYaml } from 'yaml';
import type { Chapter } from './types';

/** Parse a chapter Markdown file (docs/card-format.md, "Chapter format"). */
export function parseChapter(src: string, file = 'chapter'): Chapter {
  const data = src.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!data.startsWith('---\n')) throw new Error(`${file}: missing front matter`);
  const rest = data.slice(4);
  const end = rest.indexOf('\n---\n');
  if (end < 0) throw new Error(`${file}: unterminated front matter`);
  const fm = parseYaml(rest.slice(0, end)) ?? {};
  const body = rest.slice(end + 5).trim();
  if (!fm.id || typeof fm.id !== 'string') throw new Error(`${file}: id is required`);
  if (!fm.title) throw new Error(`${file}: title is required`);
  const steps = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  return {
    id: fm.id,
    title: String(fm.title),
    kicker: String(fm.kicker ?? ''),
    years: Array.isArray(fm.years) ? fm.years.map(Number) : [],
    hero: fm.hero ? { type: 'image', ...fm.hero } : undefined,
    places: Array.isArray(fm.places) ? fm.places : [],
    cards: Array.isArray(fm.cards) ? fm.cards.map(String) : [],
    steps,
  };
}

export function sortChapters(chs: Chapter[]): Chapter[] {
  return [...chs].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}
