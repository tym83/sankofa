import { describe, expect, it } from 'vitest';
import { parseChapter, parseChapterTranslation, sortChapters } from '../src/lib/chapters';
import { localizeChapter, localizeCard } from '../src/lib/cards';
import type { Card } from '../src/lib/types';

const SRC = `---
id: v1
title: The Middle Passage
kicker: 1500s–1860s · the Atlantic
years: [1501, 1866]
hero: {file: hero-v1.jpg, caption: "The Brookes", credit: "Library of Congress", license: "Public domain", url: "https://www.loc.gov/"}
places: [{name: Atlantic Ocean, lat: 10, lon: -30}]
cards: [equiano, zong]
---
First paragraph about [[equiano]]
wrapped over two lines.

Second about the [[zong|Zong]].


Third.
`;

describe('chapters', () => {
  it('parses front matter and splits paragraphs into steps', () => {
    const c = parseChapter(SRC);
    expect(c.id).toBe('v1');
    expect(c.years).toEqual([1501, 1866]);
    expect(c.hero).toMatchObject({ type: 'image', file: 'hero-v1.jpg', license: 'Public domain' });
    expect(c.places[0]).toEqual({ name: 'Atlantic Ocean', lat: 10, lon: -30 });
    expect(c.cards).toEqual(['equiano', 'zong']);
    expect(c.steps).toEqual(['First paragraph about [[equiano]] wrapped over two lines.', 'Second about the [[zong|Zong]].', 'Third.']);
  });

  it('handles CRLF and a BOM', () => {
    expect(parseChapter('﻿' + SRC.replace(/\n/g, '\r\n')).steps).toHaveLength(3);
  });

  it('rejects broken files', () => {
    expect(() => parseChapter('no front matter')).toThrow(/front matter/);
    expect(() => parseChapter('---\nid: v1\n')).toThrow(/unterminated/);
    expect(() => parseChapter('---\ntitle: x\n---\nbody')).toThrow(/id/);
  });

  it('sorts v0..v10 naturally', () => {
    const ids = sortChapters(['v10', 'v2', 'v0'].map((id) => parseChapter(`---\nid: ${id}\ntitle: t\n---\nx`))).map((c) => c.id);
    expect(ids).toEqual(['v0', 'v2', 'v10']);
  });
});

describe('translations', () => {
  const RU = `---
title: Средний путь
kicker: 1500-е — 1860-е · Атлантика
heroCaption: Корабль «Брукс»
---
Первый абзац о [[equiano|Эквиано]].

Второй — о [[zong|«Зонге»]].

Третий.
`;

  it('parses a chapter translation and localizes the chapter', () => {
    const tr = parseChapterTranslation(RU);
    expect(tr).toMatchObject({ title: 'Средний путь', heroCaption: 'Корабль «Брукс»' });
    expect(tr.steps).toHaveLength(3);
    const ch = { ...parseChapter(SRC), translations: { ru: tr } };
    const ru = localizeChapter(ch, 'ru');
    expect(ru.title).toBe('Средний путь');
    expect(ru.hero?.caption).toBe('Корабль «Брукс»');
    expect(ru.steps[1]).toContain('«Зонге»');
    expect(ru.textLang).toBe('ru');
    expect(localizeChapter(ch, 'en').title).toBe('The Middle Passage');
  });

  it('keeps the English body when paragraphs do not match, and the title anyway', () => {
    const ch = { ...parseChapter(SRC), translations: { ru: { title: 'Средний путь', steps: ['один'] } } };
    const ru = localizeChapter(ch, 'ru');
    expect(ru.title).toBe('Средний путь');
    expect(ru.steps[0]).toContain('First paragraph');
    expect(ru.textLang).toBe('en');
  });

  it('localizes a card and keeps English place names for links', () => {
    const c: Card = {
      id: 'bridgetower', kind: 'person', title: 'George Bridgetower', wow: 'w', years: [1778], zoom: 4, books: ['heirs'], sources: [], body: 'b',
      places: [{ name: 'Vienna', lat: 48, lon: 16 }],
      further: ['Op. 47'],
      translations: { ru: { title: 'Джордж Бриджтауэр', wow: 'в', body: 'тело', places: ['Вена'], further: ['Соч. 47', 'лишнее'] } },
    };
    const ru = localizeCard(c, 'ru');
    expect(ru.title).toBe('Джордж Бриджтауэр');
    expect(ru.places[0]).toEqual({ name: 'Вена', lat: 48, lon: 16, en: 'Vienna' });
    expect(ru.further).toEqual(['Op. 47']);
    expect(localizeCard({ ...c, translations: undefined }, 'ru').title).toBe('George Bridgetower');
  });

  it('localizes media captions, credits and licences', () => {
    const c: Card = {
      id: 'dave', kind: 'object', title: 'Dave', wow: 'w', years: [1858], zoom: 4, books: ['voices'], sources: [], body: 'b', places: [],
      media: [{ type: 'image', file: 'd.jpg', caption: 'Jar', credit: 'Dave; The Met', license: 'Public domain' }],
      translations: { ru: { title: 'Дейв', wow: 'в', body: 'тело', captions: ['Кувшин'], credits: ['Дейв; Метрополитен-музей'], licenses: ['общественное достояние'] } },
    };
    expect(localizeCard(c, 'ru').media![0]).toEqual({ type: 'image', file: 'd.jpg', caption: 'Кувшин', credit: 'Дейв; Метрополитен-музей', license: 'общественное достояние' });
  });
});
