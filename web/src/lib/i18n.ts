// The museum's two languages. English is the source; Russian strings are keyed
// by the English text, so a missing translation falls back to English.

export type Lang = 'en' | 'ru';
export const LANGS: Lang[] = ['en', 'ru'];
const KEY = 'sankofa.lang';

let current: Lang = 'en';

export function lang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  current = l;
}

export function isLang(s: string | null | undefined): s is Lang {
  return s === 'en' || s === 'ru';
}

/** The fragment wins, then the reader's earlier choice, then the browser. */
export function detectLang(fromHash?: string | null, stored?: string | null, browser?: string | readonly string[]): Lang {
  if (isLang(fromHash)) return fromHash;
  if (isLang(stored)) return stored;
  const list = typeof browser === 'string' ? [browser] : (browser ?? []);
  return list.some((b) => /^ru\b/i.test(b)) ? 'ru' : 'en';
}

export function storedLang(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function storeLang(l: Lang): void {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* private mode */
  }
}

/** Russian plural form: 1 карточка, 2 карточки, 5 карточек, 21 карточка, 11 карточек. */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

const NOUNS: Record<string, { en: [string, string]; ru: [string, string, string] }> = {
  card: { en: ['card', 'cards'], ru: ['карточка', 'карточки', 'карточек'] },
  year: { en: ['year', 'years'], ru: ['год', 'года', 'лет'] },
  node: { en: ['node', 'nodes'], ru: ['узел', 'узла', 'узлов'] },
  pod: { en: ['pod', 'pods'], ru: ['под', 'пода', 'подов'] },
  program: { en: ['program', 'programs'], ru: ['программа', 'программы', 'программ'] },
  artist: { en: ['artist', 'artists'], ru: ['исполнитель', 'исполнителя', 'исполнителей'] },
  // after «из»: из 1 исполнителя, из 120 исполнителей
  artistOf: { en: ['artist', 'artists'], ru: ['исполнителя', 'исполнителей', 'исполнителей'] },
  // after «из»: из 1 узла, из 3 узлов, из 21 узла
  nodeOf: { en: ['node', 'nodes'], ru: ['узла', 'узлов', 'узлов'] },
};

/** "5 cards" / «5 карточек». */
export function count(n: number, noun: keyof typeof NOUNS, l: Lang = current): string {
  const f = NOUNS[noun];
  const word = l === 'ru' ? pluralRu(n, f.ru) : n === 1 ? f.en[0] : f.en[1];
  return `${formatNumber(n, l)} ${word}`;
}

export function formatNumber(n: number, l: Lang = current): string {
  // Years and small counts stay unspaced; Russian groups thousands with a thin space.
  if (Math.abs(n) < 10000) return String(n);
  return l === 'ru' ? n.toLocaleString('ru-RU').replace(/ /g, ' ') : n.toLocaleString('en-US');
}

/** "726 years ago" / «726 лет назад». */
export function yearsAgo(n: number, l: Lang = current): string {
  if (n === 0) return l === 'ru' ? 'в этом году' : 'this year';
  return l === 'ru' ? `${count(n, 'year', l)} назад` : `${count(n, 'year', l)} ago`;
}

/** Pick the reader's language from a pair written side by side. */
export function pick<T>(o: { en: T; ru: T }): T {
  return current === 'ru' ? o.ru : o.en;
}

/** Translate an interface string; {name} placeholders are filled from vars. */
export function t(en: string, vars?: Record<string, string | number>): string {
  const s = current === 'ru' ? (RU[en] ?? en) : en;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s;
}

/** The copies of the museum, in the cases the sentences need. */
export const EDITION = {
  en: { m: { nom: 'male copy', prep: 'male copy' }, f: { nom: 'female copy', prep: 'female copy' } },
  ru: { m: { nom: 'мужской экземпляр', prep: 'мужском экземпляре' }, f: { nom: 'женский экземпляр', prep: 'женском экземпляре' } },
} as const;

export function edition(e: 'm' | 'f', form: 'nom' | 'prep' = 'nom'): string {
  return EDITION[current][e][form];
}

export const RU: Record<string, string> = {
  // nav and shell
  'The engine room': 'Машинное отделение',
  Roots: 'Корни',
  'Engine room': 'Машинное отделение',
  'This card is a Kubernetes object': 'Эта карточка — объект Kubernetes',
  'Read it in the terminal': 'Прочитать в терминале',
  'Skip to the story': 'Перейти к истории',
  Descend: 'Сквозь века',
  Atlas: 'Атлас',
  Listen: 'Слушать',
  'Your book': 'Ваша книга',
  'Switch to light theme': 'Светлая тема',
  'Switch to dark theme': 'Тёмная тема',
  'Loading the museum': 'Музей загружается',
  'The museum could not load its cards ({error}). Run scripts/build-data.sh.': 'Музей не смог загрузить карточки ({error}). Запустите scripts/build-data.sh.',
  Card: 'Карточка',
  Chapters: 'Главы',
  Close: 'Закрыть',
  Copy: 'Копировать',
  'Copy failed': 'Не удалось скопировать',
  'Command copied': 'Команда скопирована',
  'Link copied': 'Ссылка скопирована',
  'Link to your path copied': 'Ссылка на ваш путь скопирована',
  'This card is not written yet': 'Эта карточка ещё не написана',

  // eras, books, kinds
  'Africa before': 'Африка до работорговли',
  'Middle Passage': 'Средний путь',
  Resistance: 'Сопротивление',
  Voices: 'Голоса',
  Diaspora: 'Диаспора',
  'Harlem and Négritude': 'Гарлем и негритюд',
  'Civil rights': 'Гражданские права',
  Afrofuturism: 'Афрофутуризм',
  'Book of Voices': 'Книга голосов',
  'Book of Archives': 'Книга архивов',
  'Book of Heirs': 'Книга наследников',
  Person: 'Человек',
  Genre: 'Жанр',
  Place: 'Место',
  Object: 'Предмет',
  Language: 'Язык',
  Script: 'Письменность',
  Instrument: 'Инструмент',
  Event: 'Событие',
  Media: 'Медиа',
  Work: 'Произведение',
  'Myth, examined': 'Разбор мифа',
  Comparison: 'Сравнение',
  BCE: 'до н. э.',

  // story
  Contents: 'Содержание',
  'Eight releases': 'Восемь релизов',
  'Eight chapters': 'Восемь глав',
  release: 'релиз',
  'Each era ships as a release of the distribution, from v0 to v7. Begin anywhere; every card leads somewhere else.':
    'Каждая эпоха — глава и одновременно релиз дистрибутива, от v0 до v7. Начните откуда угодно: каждая карточка ведёт дальше.',
  'The places of this chapter · map data: Natural Earth, public domain': 'Места этой главы · картографические данные: Natural Earth, общественное достояние',
  'In {chapter}: {cards}': 'В {chapter}: {cards}',
  'See all {cards}': 'Показать все: {cards}',
  'The atlas': 'Атлас',
  'Seven centuries on one map': 'Семь веков на одной карте',
  'Every card has a place and a time. Brush the years, zoom from oceans to a single page, and watch the routes the music and the people took.':
    'У каждой карточки есть место и время. Выделите годы, приблизьте карту от океана до одной страницы — и смотрите, какими путями шли музыка и люди.',
  'Descend through the centuries': 'Спуститься сквозь века',
  'Open the atlas': 'Открыть атлас',
  '1900–1935, cities and genres': '1900–1935: города и жанры',

  // card panel
  'Contested.': 'Об этом спорят.',
  'You followed a link to {title}. In your {edition} this place is held by another voice.':
    'Вы шли по ссылке к странице «{title}». В вашем {edition} на этом месте звучит другой голос.',
  'The other page exists: a reader with the other copy can pass it to you by sharing their path.':
    'Другая страница существует: читатель с другим экземпляром может передать её вам, поделившись своим путём.',
  'From the other copy.': 'Из другого экземпляра.',
  "You hold the {edition}; this page reached you through another reader's path.": 'У вас в руках {edition}; эта страница пришла к вам по пути другого читателя.',
  'Its counterpart in your copy is': 'Её пара в вашем экземпляре —',
  'Only in the {edition}.': 'Только в {edition}.',
  'This museum comes in two copies, like Pavić’s dictionary. The other one tells this moment in a different voice; ask another reader for their path.':
    'Музей существует в двух экземплярах, как словарь Павича. В другом этот момент рассказан иным голосом — попросите у другого читателя его путь.',
  'Go further': 'Куда смотреть дальше',
  'Cards that lead here': 'Сюда ведут',
  'Show on the atlas': 'Показать на атласе',
  'Open in terminal': 'Открыть в терминале',
  'Copy link': 'Скопировать ссылку',
  Sources: 'Источники',
  'Your book · {edition}': 'Ваша книга · {edition}',
  'The path you walked': 'Пройденный путь',
  'Every card you open is written into your own book, here in your browser and nowhere else. Share it and another reader walks the same road, including pages their copy does not have.':
    'Каждая открытая карточка вписывается в вашу собственную книгу — здесь, в браузере, и больше нигде. Поделитесь ею, и другой читатель пройдёт той же дорогой, включая страницы, которых нет в его экземпляре.',
  'Open a card and it is written into your own book. Nothing leaves your browser until you share it.':
    'Откройте карточку — и она впишется в вашу книгу. Ничто не покинет браузер, пока вы сами не поделитесь.',
  'Share my path': 'Поделиться путём',
  'Replay on the atlas': 'Пройти заново по атласу',
  'Start a new book': 'Начать новую книгу',

  // atlas and map
  'Close the atlas': 'Закрыть атлас',
  'Zoom level': 'Масштаб',
  'Zoom changes what is told, not only the scale. Keys: + − arrows [ ]': 'Масштаб меняет не только размер, но и то, о чём рассказывает карта. Клавиши: + − стрелки [ ]',
  'Reader path': 'Путь читателя',
  '1300 – today': '1300 — сегодня',
  'A reader’s path ·': 'Путь читателя ·',
  'Previous card in the path': 'Предыдущая карточка пути',
  'Next card in the path': 'Следующая карточка пути',
  Centuries: 'Века',
  Regions: 'Регионы',
  'Cities and genres': 'Города и жанры',
  People: 'Люди',
  'One document': 'Один документ',
  'Map of the Atlantic world': 'Карта атлантического мира',
  'Timeline, 1300 to today': 'Хронология, с 1300 года до наших дней',
  'West Africa': 'Западная Африка',
  'West-Central Africa': 'Западно-Центральная Африка',
  'East and Southern Africa': 'Восточная и Южная Африка',
  'Sahara and the Nile': 'Сахара и Нил',
  'The Caribbean': 'Карибы',
  Brazil: 'Бразилия',
  'The American South': 'Американский Юг',
  'The American North': 'Американский Север',
  'The American West': 'Американский Запад',
  'Western Europe': 'Западная Европа',
  'Russia and the East': 'Россия и Восток',

  // descent
  'Through the centuries': 'Сквозь века',
  'Leave the descent': 'Выйти',
  'Through the centuries: a descent from 1300 to today': 'Сквозь века: спуск от 1300 года до наших дней',
  'The archive is quiet here. The people were not.': 'Архив здесь молчит. Люди — нет.',
  'Few records survive from these years. Absence of evidence, not of lives.': 'От этих лет дошло мало записей. Нет свидетельств — не значит, что не было жизней.',
  'A long stretch with no card yet. Somebody was singing.': 'Долгий отрезок без карточек. Кто-то в это время пел.',
  'Silence in the sources. Keep going.': 'Источники молчат. Идите дальше.',
  'Read the chapter →': 'Читать главу →',
  Movement: 'Движение',
  'Seven hundred years of Black culture, one year at a time. Scroll down: every screen is time, and the deeper you go, the closer you come to today.':
    'Семьсот лет чёрной культуры, год за годом. Прокручивайте вниз: каждый экран — это время, и чем глубже вы спускаетесь, тем ближе сегодняшний день.',
  'Today.': 'Сегодня.',
  'You have come down {years}. Every card on the way has a place, a time and its sources.': 'Вы спустились на {years}. У каждой карточки по дороге есть место, время и источники.',
  'Back to 1300': 'Назад, в 1300 год',
  '{from} – {to}': '{from} — {to}',

  // listening room
  'The listening room': 'Кластер звучит',
  'The cluster, played live': 'Живой кластер в исполнении ансамбля',
  'Leave the listening room': 'Выйти',
  'Start listening': 'Начать слушать',
  Stop: 'Остановить',
  'The bell timeline in the centre and one drum per node around it': 'Колокольный ритм в центре и по барабану на каждый узел вокруг',
  'Bell: the control plane': 'Колокол — это управляющая машина (control plane)',
  'Drum: a node, renewing its Lease': 'Барабан — машина кластера, пока она подаёт сигнал жизни',
  'Wavering: the heartbeat is late': 'Дрожь: сердцебиение запаздывает',
  'Hollow: the node is silent': 'Пустой круг: узел молчит',
  'Filled: a pod answered': 'Заполненный: под откликнулся',
  'Empty: a pod was called and stayed silent': 'Пунктир: под позвали, а он промолчал',
  'Live · Griot /pulse': 'Вживую · Griot /pulse',
  'Recorded demo · not a live cluster': 'Записанное демо · не живой кластер',
  'Live stream quiet': 'Поток молчит',
  'Connecting…': 'Подключение…',
  'Listening for the cluster…': 'Прислушиваемся к кластеру…',
  'No nodes yet.': 'Узлов пока нет.',
  Call: 'Зов',
  node: 'узел',
  silent: 'молчит',
  '{ready} ready': 'готовы: {ready}',
  '{n} silent': 'молчат: {n}',
  '{alive} of {total} playing · {ready} answering': 'Играют: {alive} из {total} · откликаются: {ready}',
  '{n} silent pods': 'молчат: {n}',
  'talking drums': 'говорящие барабаны',
  'the spirituals': 'спиричуэлс',
  'The bell is the control plane, keeping the West African 12/8 timeline of seven strokes in twelve pulses that every drum in the ensemble locks to, the way {talk} carry speech in rhythm. Each node is a drum with its own interlocking part: it plays while its Lease is fresh, stumbles as heartbeats come late, and falls silent when the node stops. Then the cluster calls and every ready pod answers, as in {spirit}; a pod that is not ready leaves its answer empty, and you hear the gap.':
    'Колокол — это control plane: он держит западноафриканскую линию 12/8, семь ударов на двенадцать долей, по которой сверяется каждый барабан ансамбля, — так {talk} передают речь ритмом. Каждый узел — барабан со своей партией, вплетённой в общий узор: он играет, пока его Lease свеж, сбивается, когда сердцебиение запаздывает, и замолкает, когда узел останавливается. Потом кластер зовёт, и каждый готовый под откликается, как в {spirit}; под, который не готов, оставляет место отклика пустым — и вы слышите эту паузу.',
};

/** The one way the museum counts its cards: "96 cards in your copy · 102 in both". */
export function copyCount(mine: number, total: number, l: Lang = current): string {
  return l === 'ru'
    ? `${count(mine, 'card', 'ru')} в вашем экземпляре · ${total} в обоих`
    : `${count(mine, 'card', 'en')} in your copy · ${total} in both`;
}
