import { describe, expect, it } from 'vitest';
import { parseChapter, sortChapters } from '../src/lib/chapters';

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
