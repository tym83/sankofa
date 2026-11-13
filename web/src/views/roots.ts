// Roots: type a band or an artist and watch the chain grow back, link by
// sourced link, to a card of the museum.
import type { App } from '../app';
import { placeName, buildTree, chainLine, deepest, endCards, extendLineage, groupChildren, KIND_LABEL, quotes, longestRoots, searchArtists, suggestions, type Artist, type LineageCard, type RootLink, type TreeNode } from '../lib/roots';
import { vtags, copyText, h, reducedMotion, svgIcon, toast } from '../lib/dom';
import { formatYears } from '../lib/cards';
import { count, lang, pick, t } from '../lib/i18n';
import { mediaSrc } from '../lib/media';
import { eraColor } from '../lib/atlasModel';

export class Roots {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private results: HTMLElement;
  private stage: HTMLElement;
  private sugg: HTMLElement;
  private byId: Map<string, Artist>;
  private lineage: Map<string, LineageCard>;
  private active = -1;
  private current?: string;
  onArtist?: (id: string | undefined) => void;
  onClose?: () => void;

  constructor(
    private app: App,
    private artists: Artist[],
  ) {
    this.byId = new Map(artists.map((a) => [a.id, a]));
    this.lineage = new Map(app.set.all().map((c) => [c.id, { id: c.id, roots: c.roots }] as [string, LineageCard]));
    this.input = h('input.r-input', {
      type: 'search',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: pick({ en: 'Type a band or an artist…', ru: 'Группа или исполнитель…' }),
      'aria-label': pick({ en: 'Band or artist', ru: 'Группа или исполнитель' }),
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-controls': 'r-results',
      'aria-autocomplete': 'list',
    }) as HTMLInputElement;
    this.results = h('ul.r-results', { id: 'r-results', role: 'listbox' });
    this.sugg = h('div.r-sugg');
    this.stage = h('div.r-stage', { 'aria-live': 'polite' });
    this.input.addEventListener('input', () => this.search());
    this.input.addEventListener('keydown', (e) => this.key(e));
    const bar = h('header.d-bar', {}, h('span.d-title', {}, t('Roots')), h('a.btn.r-maplink', { href: '#view=roots-map', 'data-roots-map': '' }, pick({ en: 'The music map', ru: 'Карта музыки' })), h('button.icon-btn', { 'aria-label': t('Close'), onclick: () => this.onClose?.() }, svgIcon('close')));
    const head = h(
      'header.r-head',
      {},
      h('div.kicker', {}, t('Roots')),
      h('h2', {}, pick({ en: 'Where does your music come from?', ru: 'Откуда растёт ваша музыка?' })),
      h(
        'p.r-lede',
        {},
        pick({
          en: 'Pick a band or an artist. The chain runs back from them to Black traditions and ends at a card of the museum; every link in it is documented by two sources.',
          ru: 'Выберите группу или исполнителя. Цепочка ведёт от них назад, к чёрным традициям, и заканчивается карточкой музея; каждое её звено подтверждено двумя источниками.',
        }),
      ),
      h('div.r-search', {}, searchIcon(), this.input, this.results),
      this.sugg,
    );
    this.el = h('section.roots', { 'aria-label': t('Roots'), tabindex: '-1' }, bar, h('div.r-wrap', {}, head, this.stage));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.activeElement !== this.input) this.onClose?.();
    });
    this.el.addEventListener('click', (e) => {
      const a = (e.target as Element).closest<HTMLElement>('[data-artist]');
      if (!a) return;
      e.preventDefault();
      this.show(a.dataset.artist!);
      this.onArtist?.(a.dataset.artist!);
    });
    document.body.append(this.el);
    this.renderSuggestions();
  }

  get isOpen(): boolean {
    return this.el.classList.contains('open');
  }

  open(artist?: string): void {
    this.el.classList.add('open');
    document.body.classList.add('locked');
    if (artist) this.show(artist);
    else if (!this.current) {
      this.renderEmpty();
      requestAnimationFrame(() => this.input.focus({ preventScroll: true }));
    }
  }

  close(): void {
    this.el.classList.remove('open');
    document.body.classList.remove('locked');
  }

  private nameOf(a: Artist): string {
    return lang() === 'ru' && a.nameRu ? a.nameRu : a.name;
  }

  private refName(ref: string): string {
    if (ref.startsWith('card:')) return this.app.set.get(ref.slice(5))?.title ?? ref.slice(5);
    const a = this.byId.get(ref);
    return a ? this.nameOf(a) : ref;
  }

  private renderSuggestions(): void {
    const list = suggestions(this.artists, 7);
    this.sugg.replaceChildren(
      ...(list.length ? [h('span', {}, pick({ en: 'Try', ru: 'Например' }))] : []),
      ...list.map((a) => h('a.chip', { href: `#view=roots&artist=${a.id}`, 'data-artist': a.id }, this.nameOf(a))),
    );
  }

  private search(): void {
    const found = searchArtists(this.artists, this.input.value);
    this.active = found.length ? 0 : -1;
    this.results.replaceChildren(
      ...found.map((a, i) =>
        h(
          `li.r-hit${i === 0 ? '.on' : ''}`,
          { role: 'option', 'aria-selected': String(i === 0), 'data-id': a.id, onmousedown: (e: Event) => (e.preventDefault(), this.pick(a.id)) },
          h('b', {}, this.nameOf(a)),
          h('span', {}, `${(lang() === 'ru' && a.genreRu) || a.genre} · ${formatYears(a.years)} · ${placeName(a, lang())}`),
        ),
      ),
    );
    const q = this.input.value.trim();
    if (q && !found.length) this.results.append(h('li.r-none', {}, this.emptyLine()));
    this.input.setAttribute('aria-expanded', String(!!q));
    this.stage.classList.toggle('typing', !!q && !this.current);
    this.results.classList.toggle('on', !!q);
  }

  private key(e: KeyboardEvent): void {
    const hits = [...this.results.querySelectorAll<HTMLElement>('.r-hit')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hits.length) return;
      this.active = (this.active + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length;
      hits.forEach((x, i) => {
        x.classList.toggle('on', i === this.active);
        x.setAttribute('aria-selected', String(i === this.active));
      });
    } else if (e.key === 'Enter' && hits[this.active]) {
      e.preventDefault();
      this.pick(hits[this.active].dataset.id!);
    } else if (e.key === 'Escape') {
      this.input.value = '';
      this.search();
    }
  }

  private pick(id: string): void {
    this.input.value = '';
    this.search();
    this.input.blur();
    this.show(id);
    this.onArtist?.(id);
  }

  private emptyLine(): string {
    return pick({
      en: 'Can’t find them? The collection grows; every link needs two sources.',
      ru: 'Не нашли? Коллекция растёт, а каждому звену нужны два источника.',
    });
  }

  private renderEmpty(): void {
    const top = longestRoots(this.artists, this.lineage, 4);
    this.stage.replaceChildren(
      ...(top.length
        ? [h(
            'section.r-longest',
            {},
            h('h3', {}, pick({ en: 'The longest roots', ru: 'Самые длинные корни' })),
            h(
              'div.r-long-grid',
              {},
              top.map(({ artist, chain, borrowed }) =>
                h(
                  'a.r-long',
                  { href: `#view=roots&artist=${artist.id}`, 'data-artist': artist.id },
                  h('small', {}, pick({ en: `${chain.length - 1} steps back`, ru: `шагов назад: ${chain.length - 1}` })),
                  h('b', {}, this.nameOf(artist)),
                  borrowed ? h('span.r-what', {}, quotes((lang() === 'ru' && (borrowed.whatRu || borrowed.claimRu)) || borrowed.what || borrowed.claim, lang())) : null,
                  h('span.r-chain', {}, chainLine(chain, (r) => this.refName(r))),
                ),
              ),
            ),
            h('a.btn', { href: '#view=roots-map', 'data-roots-map': '' }, pick({ en: 'See every chain on one map →', ru: 'Все цепочки на одной карте →' })),
          )]
        : []),
      h('p.r-empty', {}, this.artists.length ? this.emptyLine() : pick({ en: 'The first chains are being written and checked.', ru: 'Первые цепочки пишутся и проверяются.' })),
    );
  }

  /** Root the view on an artist: the tree of chains, then the closing line. */
  show(id: string): void {
    const a = this.byId.get(id);
    this.current = id;
    if (!a) return this.renderEmpty();
    const tree = extendLineage(buildTree(a, this.byId), this.lineage);
    const ends = endCards(tree);
    let step = 0;
    // A chain of chains: each step is told on the connector between exactly
    // the two names it joins; where an artist has several roots, each is its
    // own indented sub-chain; a node met before is a short pointer back.
    const seen = new Set<string>();
    const render = (n: TreeNode, isRoot: boolean, band?: string): HTMLElement[] => {
      const out: HTMLElement[] = [];
      if (seen.has(n.ref)) {
        out.push(h('p.r-again', {}, pick({ en: `${this.refName(n.ref)}: as above`, ru: `${this.refName(n.ref)} — см. выше` })));
        return out;
      }
      seen.add(n.ref);
      // A band's member is not a step of its own: the band's chain goes on
      // through the member's roots ("Lou Reed, of The Velvet Underground").
      const el = band
        ? this.memberEl(n.ref, band, step++)
        : n.ref.startsWith('card:')
          ? this.cardEl(n.ref.slice(5), step++, !!n.lineage)
          : this.artistEl(n.ref, isRoot, step++);
      out.push(el);
      const all = groupChildren(n);
      const members = all.filter((g) => g.length === 1 && g[0].link?.kind === 'member' && !g[0].ref.startsWith('card:'));
      for (const g of members) out.push(...render(g[0], false, n.ref));
      const groups = all.filter((g) => !members.includes(g));
      const sub = groups.length > 1;
      groups.forEach((g, gi) => {
        const from = this.refName(n.ref);
        const to = g.map((c) => this.refName(c.ref));
        // Links carry no date of their own in the data, so the line shows none:
        // a card's span would date the genre, not the link.
        const edge = g[0].lineage ? this.lineageEdge(from, to, step++) : this.edgeEl(g[0].link!, from, to, step++);
        const body = [edge, ...g.flatMap((c) => render(c, false))];
        out.push(sub ? h('div.r-sub', { style: `--b:${gi}` }, h('span.r-branch-no', {}, pick({ en: `branch ${gi + 1} of ${groups.length}`, ru: `ветвь ${gi + 1} из ${groups.length}` })), ...body) : h('div.r-run', {}, ...body));
      });
      return out;
    };
    const column = h('div.r-col', {}, ...render(tree, true));
    const story = (lang() === 'ru' && a.storyRu) || a.story;
    const depth = deepest(tree);
    const first = a.paths[0];
    const close = first
      ? h(
          'footer.r-close',
          {},
          h('p', {}, chainLine(depth, (r) => this.refName(r)) + this.endYears(depth[depth.length - 1])),
          a.paths.length > 1
            ? h('p.r-more', {}, pick({ en: `and ${a.paths.length - 1} more ${a.paths.length - 1 === 1 ? 'chain' : 'chains'} above`, ru: `и ещё цепочек выше: ${a.paths.length - 1}` }))
            : null,
          h(
            'button.btn.primary',
            {
              onclick: async () => {
                const url = location.href.split('#')[0] + `#view=roots&artist=${id}${lang() === 'en' ? '' : `&lang=${lang()}`}`;
                toast((await copyText(url)) ? pick({ en: 'Link to this chain copied', ru: 'Ссылка на цепочку скопирована' }) : t('Copy failed'));
              },
            },
            svgIcon('link'),
            pick({ en: 'Share this chain', ru: 'Поделиться цепочкой' }),
          ),
        )
      : h('p.r-empty', {}, pick({ en: 'No documented chain reaches the museum yet.', ru: 'Документированной цепочки до музея пока нет.' }));
    this.stage.replaceChildren(
      h(
        'div.r-tree',
        { 'data-root': id },
        story ? h('p.r-story', {}, story) : null,
        h('p.r-count', {}, pick({ en: `${a.paths.length} ${a.paths.length === 1 ? 'chain leads' : 'chains lead'} back to ${ends.length} ${ends.length === 1 ? 'card' : 'cards'} of the museum`, ru: `${count(a.paths.length, 'chain', 'ru')} ${a.paths.length % 10 === 1 && a.paths.length % 100 !== 11 ? 'ведёт' : 'ведут'} к ${toCardsRu(ends.length)} музея` })),
        column,
      ),
      close,
    );
    // The answer is the chain: bring it up and fold the header away.
    this.el.classList.add('chosen');
    requestAnimationFrame(() => {
      const top = this.stage.getBoundingClientRect().top + this.el.scrollTop - 70;
      this.el.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
    if (!reducedMotion()) requestAnimationFrame(() => this.stage.querySelectorAll('.r-anim').forEach((x) => x.classList.add('in')));
    else this.stage.querySelectorAll('.r-anim').forEach((x) => x.classList.add('in'));
  }

  /** A name as it reads inside a sentence: "the blues", «блюз». */

  /** One step, told between the two names it joins. */
  private edgeEl(l: RootLink, from: string, to: string[], i: number): HTMLElement {
    const L = lang();
    const kind = l.kind ? KIND_LABEL[l.kind] : undefined;
    const what = quotes((L === 'ru' && l.whatRu) || l.what || '', L);
    const claim = quotes((L === 'ru' && l.claimRu) || l.claim, L);
    return h(
      `div.r-edge.r-anim${l.kind ? `.k-${l.kind}` : ''}`,
      { style: `--i:${i}` },
      h('div.r-edge-head', {}, h('b', {}, from), h('span.r-arrow', { 'aria-hidden': 'true' }, '→'), h('b', {}, to.join(pick({ en: ' and ', ru: ' и ' }))), kind ? h('span.r-kind', {}, h('i', { 'aria-hidden': 'true' }, kind.glyph), pick(kind)) : null),
      // One sentence per step: what was borrowed when it is named, else the claim.
      h('p.r-say', { title: what ? claim : undefined }, what || claim),
      h('div.r-edge-foot', {}, h('ul.r-src', {}, l.sources.map((s) => h('li', {}, h('a', { href: s.url, rel: 'noopener', target: '_blank' }, s.title))))),
    );
  }

  private lineageEdge(from: string, to: string[], i: number): HTMLElement {
    return h(
      'div.r-edge.r-lin.r-anim',
      { style: `--i:${i}` },
      h('div.r-edge-head', {}, h('b', {}, from), h('span.r-arrow', { 'aria-hidden': 'true' }, '→'), h('b', {}, to.join(pick({ en: ' and ', ru: ' и ' }))), h('span.r-kind', {}, h('i', { 'aria-hidden': 'true' }, '↓'), pick({ en: 'rooted in', ru: 'корни в' }))),
    );
  }

  private endYears(ref: string): string {
    const c = ref.startsWith('card:') ? this.app.set.get(ref.slice(5)) : undefined;
    return c ? `, ${c.places[0].name}, ${formatYears(c.years)}` : '';
  }

  /** A member through whom a band's chain continues. */
  private memberEl(id: string, band: string, i: number): HTMLElement {
    const a = this.byId.get(id);
    const b = this.byId.get(band);
    const name = a ? this.nameOf(a) : id;
    const of = b ? this.nameOf(b) : band;
    return h(
      'a.r-member.r-anim',
      { href: `#view=roots&artist=${id}`, 'data-artist': id, style: `--i:${i}`, title: pick({ en: 'Follow this artist’s own roots', ru: 'Проследить корни этого исполнителя' }) },
      h('b', {}, name),
      // The data has no person/band field. A group has a founding year only;
      // a person with a birth and a death year is a person. Names stay in the
      // nominative in Russian.
      b && isGroup(b)
        ? pick({ en: `, of ${of}`, ru: `, участник группы ${/[а-яё]/i.test(of) ? `«${of}»` : of}` })
        : pick({ en: `, who led the band ${of} played in`, ru: ` — руководитель ансамбля, где играл ${of}` }),
      a ? h('small', {}, ` · ${formatYears(a.years)}`) : null,
    );
  }

  private artistEl(id: string, isRoot: boolean, i: number): HTMLElement {
    const a = this.byId.get(id);
    if (!a) return h('div.r-artist', {}, id);
    const genre = (lang() === 'ru' && a.genreRu) || a.genre;
    // No photographs yet: a typographic plate, tinted by the artist's genre.
    let hue = 0;
    for (const ch of a.genre) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    const name = this.nameOf(a);
    const initial = name.replace(/^the\s+/i, '').charAt(0);
    const body = [
      h('span.r-mono', { 'aria-hidden': 'true' }, initial),
      h('div.r-plate', {}, h('small', {}, `${formatYears(a.years)} · ${placeName(a, lang())}`), h('b', {}, name), h('span', {}, genre)),
    ];
    const style = `--i:${i};--hue:${hue}`;
    return isRoot
      ? h(`div.r-artist.r-root.r-anim`, { style }, ...body)
      : h('a.r-artist.r-anim', { href: `#view=roots&artist=${id}`, 'data-artist': id, style, title: pick({ en: 'Follow this artist’s own roots', ru: 'Проследить корни этого исполнителя' }) }, ...body);
  }


  private cardEl(id: string, i: number, deep = false): HTMLElement {
    const c = this.app.set.forEdition(id, this.app.edition) ?? this.app.set.get(id);
    if (!c) return h('div.r-card', {}, id);
    const img = c.media?.find((m) => m.type === 'image');
    return h(
      `a.r-card.r-anim${deep ? '.r-deep' : ''}`,
      { href: `#focus=${c.id}`, 'data-card': c.id, style: `--i:${i};--era:${eraColor(c.era)}` },
      img ? h('img', { ...mediaSrc(this.app, img.file, [480]), sizes: '160px', alt: '', loading: 'lazy', decoding: 'async' }) : null,
      h(
        'div',
        {},
        h('small', {}, ...vtags(`${pick({ en: 'In the museum', ru: 'В музее' })} · ${c.era ?? ''} · ${formatYears(c.years)}`)),
        h('b', {}, c.title),
        h('span', {}, c.wow),
      ),
    );
  }
}

function searchIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  return svg;
}

/** A group, not a person: one year (founding) and a name that is not a person's. */
export function isGroup(a: Pick<Artist, 'years' | 'name'>): boolean {
  return a.years.length === 1 && (/^the\s/i.test(a.name) || !/^[A-Z][a-z]+\s[A-Z][a-z]+$/.test(a.name));
}

/** «к трём карточкам», «к одной карточке»: the dative, in words up to ten. */
function toCardsRu(n: number): string {
  const words = ['', 'одной', 'двум', 'трём', 'четырём', 'пяти', 'шести', 'семи', 'восьми', 'девяти', 'десяти'];
  const noun = n % 10 === 1 && n % 100 !== 11 ? 'карточке' : 'карточкам';
  return `${words[n] ?? n} ${noun}`;
}
