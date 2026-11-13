import { afterEach, describe, expect, it } from 'vitest';
import { count, detectLang, edition, pluralRu, setLang, t, yearsAgo } from '../src/lib/i18n';

afterEach(() => setLang('en'));

describe('i18n', () => {
  it('chooses Russian plural forms', () => {
    const f: [string, string, string] = ['карточка', 'карточки', 'карточек'];
    const want: [number, string][] = [
      [0, 'карточек'], [1, 'карточка'], [2, 'карточки'], [4, 'карточки'], [5, 'карточек'], [11, 'карточек'],
      [12, 'карточек'], [14, 'карточек'], [21, 'карточка'], [22, 'карточки'], [101, 'карточка'], [111, 'карточек'], [112, 'карточек'],
    ];
    for (const [n, w] of want) expect(pluralRu(n, f), String(n)).toBe(w);
  });

  it('counts cards and years in both languages', () => {
    expect(count(1, 'card', 'en')).toBe('1 card');
    expect(count(3, 'card', 'en')).toBe('3 cards');
    expect(count(21, 'card', 'ru')).toBe('21 карточка');
    expect(count(3, 'card', 'ru')).toBe('3 карточки');
    expect(count(5, 'card', 'ru')).toBe('5 карточек');
    expect(yearsAgo(726, 'ru')).toBe('726 лет назад');
    expect(count(21, 'nodeOf', 'ru')).toBe('21 узла');
    expect(count(3, 'nodeOf', 'ru')).toBe('3 узлов');
    expect(yearsAgo(1, 'ru')).toBe('1 год назад');
    expect(yearsAgo(23, 'ru')).toBe('23 года назад');
    expect(yearsAgo(0, 'ru')).toBe('в этом году');
    expect(yearsAgo(61, 'en')).toBe('61 years ago');
    expect(yearsAgo(1, 'en')).toBe('1 year ago');
  });

  it('detects the language: fragment, then choice, then browser', () => {
    expect(detectLang('ru', 'en', 'en-US')).toBe('ru');
    expect(detectLang(null, 'ru', 'en-US')).toBe('ru');
    expect(detectLang(null, null, ['de-DE', 'ru-RU'])).toBe('ru');
    expect(detectLang(null, null, 'en-GB')).toBe('en');
    expect(detectLang('xx', null, 'ru')).toBe('ru');
  });

  it('translates and falls back to English', () => {
    setLang('ru');
    expect(t('Open the atlas')).toBe('Открыть атлас');
    expect(t('No such string')).toBe('No such string');
    expect(t('In {chapter}: {cards}', { chapter: 'v2', cards: count(9, 'card') })).toBe('В v2: 9 карточек');
    expect(edition('f', 'prep')).toBe('женском экземпляре');
    setLang('en');
    expect(t('Open the atlas')).toBe('Open the atlas');
  });
});

import { nbsp } from '../src/lib/typo';
describe('typography', () => {
  it('binds short Russian words and names to the next word', () => {
    const s = nbsp('Он пел в хоре и до звездолётов Сан Ра — дальше', 'ru');
    expect(s).toContain('в хоре');
    expect(s).toContain('и до звездолётов');
    expect(s).toContain('Сан Ра —');
  });
  it('binds English articles and keeps Sun Ra together', () => {
    expect(nbsp('the starships of Sun Ra', 'en')).toBe('the starships of Sun Ra');
  });
});

import { localizeCredit } from '../src/lib/i18n';
describe('credits in Russian', () => {
  it('translates licences and the museum’s own phrases, keeps names', () => {
    expect(localizeCredit('Public domain', 'ru')).toBe('общественное достояние');
    expect(localizeCredit('Carl Van Vechten; Library of Congress; resized for display', 'ru')).toBe('Carl Van Vechten; Library of Congress; размер изменён для показа');
    expect(localizeCredit('Attributed to Abraham Cresques; BnF, via Wikimedia Commons', 'ru')).toBe('приписывается: Abraham Cresques; BnF, через Викисклад');
    expect(localizeCredit('CC BY-SA 4.0', 'ru')).toBe('CC BY-SA 4.0');
    expect(localizeCredit('Public domain', 'en')).toBe('Public domain');
  });
});

import { quotes } from '../src/lib/typo';
describe('typographer quotes', () => {
  it('curls quotes and apostrophes, closing one that starts a node after a link', () => {
    expect(quotes(`Le Sony'r Ra said "go"`, 'en')).toBe('Le Sony’r Ra said “go”');
    expect(quotes(`'s funeral`, 'en')).toBe('’s funeral');
    expect(quotes(`" said Ida`, 'en')).toBe('” said Ida');
    expect(quotes(`он сказал "иди"`, 'ru')).toBe('он сказал «иди»');
  });
});
