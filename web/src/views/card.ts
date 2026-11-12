import type { App } from '../app';
import { cardPoint, richText } from '../app';
import type { Card } from '../lib/types';
import { BOOK_NAMES, ERAS } from '../lib/types';
import { formatYears, KIND_LABEL } from '../lib/cards';
import { formatFragment, terminalCommand } from '../lib/fragment';
import { bookMarks, copyText, h, svgIcon, toast } from '../lib/dom';
import { eraColor } from '../lib/atlasModel';
import { edition, lang, t } from '../lib/i18n';

/** A drawer that slides in from the right, with a focus trap and Esc to close. */
export class Drawer {
  readonly el: HTMLElement;
  private scrim: HTMLElement;
  private returnTo: Element | null = null;
  onClose?: () => void;

  constructor(label: string) {
    this.scrim = h('div.scrim', { 'aria-hidden': 'true' });
    this.el = h('aside.drawer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' });
    this.scrim.addEventListener('click', () => this.close());
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
      if (e.key === 'Tab') this.trap(e);
    });
    document.body.append(this.scrim, this.el);
  }

  get isOpen(): boolean {
    return this.el.classList.contains('on');
  }

  show(content: HTMLElement): void {
    if (!this.isOpen) this.returnTo = document.activeElement;
    const close = h('button.icon-btn.close', { 'aria-label': t('Close'), onclick: () => this.close() }, svgIcon('close'));
    this.el.replaceChildren(close, content);
    this.el.scrollTop = 0;
    this.el.classList.add('on');
    this.scrim.classList.add('on');
    requestAnimationFrame(() => {
      if (this.isOpen) (this.el.querySelector<HTMLElement>('h2') ?? this.el).focus({ preventScroll: true });
    });
  }

  close(silent = false): void {
    if (!this.isOpen) return;
    this.el.classList.remove('on');
    this.scrim.classList.remove('on');
    if (this.returnTo instanceof HTMLElement || this.returnTo instanceof SVGElement) (this.returnTo as HTMLElement).focus?.({ preventScroll: true });
    if (!silent) this.onClose?.();
  }

  private trap(e: KeyboardEvent): void {
    const items = [...this.el.querySelectorAll<HTMLElement>('a[href], button, [tabindex="0"], audio')].filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

export interface CardContext {
  /** The id the reader followed, when edition resolution swapped it. */
  asked?: Card;
  /** The card came from someone else's path and is not in the reader's copy. */
  foreign?: boolean;
}

export function renderCard(app: App, c: Card, ctx: CardContext = {}): HTMLElement {
  const era = ERAS.find((e) => e.id === c.era);
  const img = c.media?.find((m) => m.type === 'image');
  const audio = c.media?.filter((m) => m.type === 'audio') ?? [];
  const point = cardPoint(c);
  const term = h('div.term', {}, h('code', {}, terminalCommand(point)));
  term.append(
    h('button', { onclick: async () => toast((await copyText(terminalCommand(point))) ? t('Command copied') : t('Copy failed')) }, t('Copy')),
  );

  const paragraphs = c.body.split(/\n\s*\n/).map((p) => h('p', {}, richText(app, p.replace(/\s*\n\s*/g, ' '))));
  const partner = app.set.partner(c.id);
  const notices: HTMLElement[] = [];
  if (c.dispute) notices.push(h('div.notice', { role: 'note' }, h('b', {}, t('Contested.') + ' '), c.dispute));
  if (ctx.asked && ctx.asked.id !== c.id) {
    notices.push(
      h(
        'div.notice.edition',
        {},
        t('You followed a link to {title}. In your {edition} this place is held by another voice.', { title: ctx.asked.title, edition: edition(app.edition, 'prep') }) + ' ',
        t('The other page exists: a reader with the other copy can pass it to you by sharing their path.'),
      ),
    );
  } else if (ctx.foreign) {
    notices.push(
      h(
        'div.notice.edition',
        {},
        h('b', {}, t('From the other copy.') + ' '),
        t("You hold the {edition}; this page reached you through another reader's path.", { edition: edition(app.edition) }),
        partner ? ' ' + t('Its counterpart in your copy is') + ' ' : '',
        partner ? h('a', { href: `#focus=${partner.id}`, 'data-card': partner.id }, partner.title) : '',
        partner ? '.' : '',
      ),
    );
  } else if (c.edition === 'm' || c.edition === 'f') {
    notices.push(
      h(
        'div.notice.edition',
        {},
        h('b', {}, t('Only in the {edition}.', { edition: edition(c.edition, 'prep') }) + ' '),
        t('This museum comes in two copies, like Pavić’s dictionary. The other one tells this moment in a different voice; ask another reader for their path.'),
      ),
    );
  }

  const backlinks = app.set.backlinks(c.id).map((id) => app.set.get(id)).filter(Boolean) as Card[];
  const sameGenre = (c.genres ?? []).map((g) => app.set.get(g)).filter(Boolean) as Card[];

  const body = h(
    `div.card-body${img ? '' : '.nomedia'}`,
    { style: `--era:${eraColor(c.era)}` },
    h(
      'div.meta',
      {},
      h('span.era-tag', {}, `${(c.era ?? '').toUpperCase()} ${era ? '· ' + era.label : ''}`),
      h('span', {}, KIND_LABEL[c.kind] ?? c.kind),
      h('span', {}, formatYears(c.years)),
      h('span', {}, c.places.map((p) => p.name).join(' → ')),
    ),
    h('h2', { tabindex: '-1', id: 'card-title' }, c.title),
    h('p.wow', {}, c.wow),
    h(
      'div.books',
      {},
      c.books.map((b) => h(`span.book.${b}`, {}, bookMarks([b]), BOOK_NAMES[b])),
    ),
    ...notices,
    h('div.text', {}, ...paragraphs),
    ...audio.map((a) =>
      h(
        'figure.card-audio',
        {},
        h('audio', { controls: true, preload: 'none', src: app.media(a.file) }),
        h('figcaption.credit', {}, a.caption ? a.caption + ' · ' : '', a.credit, ' · ', a.url ? h('a', { href: a.url, rel: 'noopener', target: '_blank' }, a.license) : a.license),
      ),
    ),
    c.further?.length ? h('section.sec.further', {}, h('h3', {}, t('Go further')), h('ul', {}, c.further.map((f) => h('li', {}, richText(app, f))))) : null,
    sameGenre.length || backlinks.length
      ? h(
          'section.sec',
          {},
          h('h3', {}, t('Cards that lead here')),
          h(
            'div.chips',
            {},
            [...sameGenre, ...backlinks.filter((b) => !sameGenre.includes(b))].map((b) =>
              h('a.chip', { href: `#focus=${b.id}`, 'data-card': b.id }, bookMarks(b.books), b.title),
            ),
          ),
        )
      : null,
    h(
      'div.card-actions',
      {},
      h('button.btn', { onclick: () => app.openAtlas(point, true) }, svgIcon('map'), t('Show on the atlas')),
      h('button.btn', { onclick: () => term.classList.toggle('on'), 'aria-label': t('Open in terminal') }, svgIcon('term'), t('Open in terminal')),
      h(
        'button.btn',
        {
          onclick: async () => {
            const url = location.href.split('#')[0] + '#' + formatFragment(point);
            toast((await copyText(url)) ? t('Link copied') : t('Copy failed'));
          },
        },
        svgIcon('link'),
        t('Copy link'),
      ),
    ),
    term,
    h(
      'section.sec.sources',
      {},
      h('h3', {}, t('Sources')),
      h(
        'ol',
        {},
        c.sources.map((s) => h('li', {}, s.url ? h('a', { href: s.url, rel: 'noopener', target: '_blank' }, s.title) : s.title)),
      ),
    ),
  );

  const media = img
    ? h(
        'figure.card-media',
        {},
        h('img', { src: app.media(img.file), alt: img.caption ?? c.title, loading: 'eager', decoding: 'async' }),
        h(
          'figcaption.credit',
          {},
          img.caption ? h('span.cap', {}, img.caption) : null,
          img.credit,
          ' · ',
          img.url ? h('a', { href: img.url, rel: 'noopener', target: '_blank' }, img.license) : img.license,
        ),
      )
    : null;

  return h('article.card', { 'data-card-id': c.id, 'aria-labelledby': 'card-title', lang: c.textLang && c.textLang !== lang() ? c.textLang : undefined }, media, body);
}

export function renderBook(app: App, path: string[], actions: { share(): void; replay(): void; clear(): void }): HTMLElement {
  const cards = path.map((id) => app.set.get(id)).filter(Boolean) as Card[];
  return h(
    'div.book-panel',
    {},
    h('div.kicker', {}, t('Your book · {edition}', { edition: edition(app.edition) })),
    h('h2', { tabindex: '-1' }, t('The path you walked')),
    h(
      'p',
      {},
      cards.length
        ? t('Every card you open is written into your own book, here in your browser and nowhere else. Share it and another reader walks the same road, including pages their copy does not have.')
        : t('Open a card and it is written into your own book. Nothing leaves your browser until you share it.'),
    ),
    cards.length
      ? h(
          'ol.path-list',
          {},
          cards.map((c) =>
            h('li', {}, h('button', { 'data-card': c.id }, h('b', {}, bookMarks(c.books), ' ', c.title), h('span', {}, c.wow))),
          ),
        )
      : null,
    cards.length
      ? h(
          'div.card-actions',
          {},
          h('button.btn.primary', { onclick: actions.share }, svgIcon('link'), t('Share my path')),
          h('button.btn', { onclick: actions.replay }, svgIcon('map'), t('Replay on the atlas')),
          h('button.btn', { onclick: actions.clear }, t('Start a new book')),
        )
      : null,
  );
}
