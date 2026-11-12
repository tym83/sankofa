// Zoom 1 of the atlas: the large movements across the Atlantic. These are
// generalisations by design, so each one names its source and its span, and
// the atlas never shows them instead of the cards at zooms 3–5.
import type { Source } from './types';

export interface Leg {
  from: [number, number]; // lon, lat
  to: [number, number];
  /** Share of the movement this leg carried, 0..1 of the largest; drawn as width. */
  weight?: number;
}

export interface Movement {
  id: string;
  title: string;
  sub: string;
  /** Russian title and subtitle: the same facts, in Russian. */
  ru: { title: string; sub: string };
  years: [number, number];
  era: string;
  legs: Leg[];
  label: [number, number];
  sources: Source[];
}

const P = {
  goree: [-17.4, 14.67],
  elmina: [-1.35, 5.08],
  ouidah: [2.08, 6.36],
  bonny: [7.15, 4.43],
  luanda: [13.23, -8.84],
  mozambique: [40.73, -15.03],
  salvador: [-38.5, -12.97],
  rio: [-43.2, -22.9],
  recife: [-34.88, -8.05],
  jamaica: [-76.8, 18.0],
  stdomingue: [-72.2, 19.7],
  charleston: [-79.93, 32.78],
  chesapeake: [-76.3, 37.3],
  cuba: [-82.38, 23.13],
  delta: [-90.57, 34.2],
  chicago: [-87.63, 41.88],
  detroit: [-83.05, 42.33],
  harlem: [-73.94, 40.81],
  atlanta: [-84.39, 33.75],
  philadelphia: [-75.16, 39.95],
  la: [-118.24, 34.05],
  houston: [-95.37, 29.76],
  london: [-0.13, 51.51],
  freetown: [-13.23, 8.48],
  halifax: [-63.57, 44.65],
  monrovia: [-10.8, 6.3],
  lagos: [3.38, 6.45],
  paris: [2.35, 48.86],
  fortdefrance: [-61.07, 14.6],
  dakar: [-17.45, 14.69],
  kingston: [-76.79, 17.97],
  tilbury: [0.36, 51.46],
  berlin: [13.4, 52.52],
  kangaba: [-8.41, 11.94],
  cairo: [31.24, 30.04],
  mecca: [39.83, 21.42],
} as const satisfies Record<string, [number, number]>;

const leg = (a: keyof typeof P, b: keyof typeof P, weight?: number): Leg => ({ from: [...P[a]], to: [...P[b]], weight });

export const MOVEMENTS: Movement[] = [
  {
    id: 'hajj',
    title: 'Mansa Musa’s pilgrimage',
    sub: '1324–1325 · from Mali through Cairo to Mecca',
    ru: { title: 'Хадж Мансы Мусы', sub: '1324–1325 · из Мали через Каир в Мекку' },
    years: [1324, 1325],
    era: 'v0',
    label: [8, 34],
    legs: [leg('kangaba', 'cairo'), leg('cairo', 'mecca')],
    sources: [{ title: 'Nehemia Levtzion and J. F. P. Hopkins (eds.), Corpus of Early Arabic Sources for West African History (Cambridge University Press, 1981): al-ʿUmari' }],
  },
  {
    id: 'middle-passage',
    title: 'The Middle Passage',
    sub: '1501–1866 · about 12.5 million people embarked',
    ru: { title: 'Средний путь', sub: '1501–1866 · на корабли погрузили около 12,5 млн человек' },
    years: [1501, 1866],
    era: 'v1',
    label: [-26, 2],
    legs: [
      // Width follows the share of people embarked from each African region
      // (SlaveVoyages estimates, rounded): West-Central Africa about 45%,
      // Bight of Benin 16%, Bight of Biafra 13%, Gold Coast 10%,
      // Senegambia 6%, South-East Africa 4%. A region's share is split
      // between its legs.
      leg('goree', 'chesapeake', 3 / 45),
      leg('goree', 'charleston', 3 / 45),
      leg('elmina', 'jamaica', 10 / 45),
      leg('ouidah', 'stdomingue', 8 / 45),
      leg('ouidah', 'salvador', 8 / 45),
      leg('bonny', 'jamaica', 7 / 45),
      leg('bonny', 'cuba', 6 / 45),
      leg('luanda', 'rio', 25 / 45),
      leg('luanda', 'recife', 20 / 45),
      leg('mozambique', 'rio', 4 / 45),
    ],
    sources: [
      { title: 'SlaveVoyages: Trans-Atlantic Slave Trade Database, estimates', url: 'https://www.slavevoyages.org/assessment/estimates' },
      { title: 'David Eltis and David Richardson, Atlas of the Transatlantic Slave Trade (Yale University Press, 2010)' },
    ],
  },
  {
    id: 'return',
    title: 'Return to Africa',
    sub: '1787–1890s · Freetown, Monrovia, the Agudás of Lagos',
    ru: { title: 'Возвращение в Африку', sub: '1787–1890-е · Фритаун, Монровия, агуда в Лагосе' },
    years: [1787, 1895],
    era: 'v4',
    label: [-31, 20],
    legs: [leg('london', 'freetown'), leg('halifax', 'freetown'), leg('chesapeake', 'monrovia'), leg('salvador', 'lagos')],
    sources: [
      { title: 'Library of Congress: The African-American Mosaic, Colonization', url: 'https://www.loc.gov/exhibits/african/afam002.html' },
      { title: 'Lisa A. Lindsay, "To Return to the Bosom of Their Fatherland": Brazilian Immigrants in Nineteenth-Century Lagos, Slavery & Abolition 15 (1994)' },
    ],
  },
  {
    id: 'negritude',
    title: 'Harlem, Paris, Fort-de-France',
    sub: '1920s–1940s · the conversation that became Négritude',
    ru: { title: 'Гарлем, Париж, Фор-де-Франс', sub: '1920–1940-е · разговор, из которого вырос негритюд' },
    years: [1920, 1950],
    era: 'v5',
    label: [-44, 49],
    legs: [leg('harlem', 'paris'), leg('fortdefrance', 'paris'), leg('dakar', 'paris')],
    sources: [{ title: 'T. Denean Sharpley-Whiting, Negritude Women (University of Minnesota Press, 2002)' }],
  },
  {
    id: 'great-migration',
    title: 'The Great Migration',
    sub: '1910–1970 · some six million people leave the South',
    ru: { title: 'Великая миграция', sub: '1910–1970 · около шести миллионов человек покидают Юг' },
    years: [1910, 1970],
    era: 'v5',
    label: [-128, 47],
    legs: [leg('delta', 'chicago'), leg('delta', 'detroit'), leg('atlanta', 'harlem'), leg('atlanta', 'philadelphia'), leg('houston', 'la')],
    sources: [{ title: 'U.S. National Archives: The Great Migration (1910–1970)', url: 'https://www.archives.gov/research/african-americans/migrations/great-migration' }],
  },
  {
    id: 'windrush',
    title: 'Windrush and the sound systems',
    sub: '1948–1971 · Kingston to Tilbury, ska to London',
    ru: { title: '«Уиндраш» и саунд-системы', sub: '1948–1971 · из Кингстона в Тилбери, ска — в Лондон' },
    years: [1948, 1971],
    era: 'v6',
    label: [-58, 31],
    legs: [leg('kingston', 'tilbury')],
    sources: [{ title: 'Mike Phillips and Trevor Phillips, Windrush: The Irresistible Rise of Multi-Racial Britain (HarperCollins, 1998)' }],
  },
  {
    id: 'techno',
    title: 'Detroit to Berlin',
    sub: '1988–1990s · techno crosses the Atlantic',
    ru: { title: 'Из Детройта в Берлин', sub: '1988–1990-е · техно пересекает Атлантику' },
    years: [1988, 1999],
    era: 'v7',
    label: [-40, 59],
    legs: [leg('detroit', 'berlin')],
    sources: [{ title: 'Dan Sicko, Techno Rebels: The Renegades of Electronic Funk (Wayne State University Press, 2010)' }],
  },
];

export interface Region {
  id: string;
  name: string;
  /** [west, south, east, north] */
  box: [number, number, number, number];
}

// Zoom 2: regions and families. A card belongs to the first region whose box
// holds its main place.
export const REGIONS: Region[] = [
  { id: 'west-africa', name: 'West Africa', box: [-18, 4, 16, 25] },
  { id: 'central-africa', name: 'West-Central Africa', box: [8, -18, 30, 4] },
  { id: 'east-africa', name: 'East and Southern Africa', box: [22, -35, 52, 16] },
  { id: 'north-africa', name: 'Sahara and the Nile', box: [-18, 16, 40, 37] },
  { id: 'caribbean', name: 'The Caribbean', box: [-86, 9, -58, 27] },
  { id: 'brazil', name: 'Brazil', box: [-74, -34, -34, 6] },
  { id: 'us-south', name: 'The American South', box: [-106, 24, -75, 37.5] },
  { id: 'us-north', name: 'The American North', box: [-125, 37.5, -60, 50] },
  { id: 'us-west', name: 'The American West', box: [-125, 24, -106, 37.5] },
  { id: 'europe', name: 'Western Europe', box: [-11, 36, 20, 60] },
  { id: 'russia', name: 'Russia and the East', box: [20, 40, 70, 68] },
];

export function regionOf(lon: number, lat: number): Region | undefined {
  return REGIONS.find((r) => lon >= r.box[0] && lon <= r.box[2] && lat >= r.box[1] && lat <= r.box[3]);
}

/** A movement's title and subtitle in the reader's language. */
export function movementText(m: Movement, lang: string): { title: string; sub: string } {
  return lang === 'ru' ? m.ru : { title: m.title, sub: m.sub };
}
