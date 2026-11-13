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
          en: 'Pick a band or an artist. Link by documented link, every one with two sources, the chain runs back to Black traditions and ends at a card of the museum.',
          ru: 'Выберите группу или исполнителя. Звено за звеном, у каждого два источника, цепочка уходит назад, к чёрным традициям, и заканчивается карточкой музея.',
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
                  borrowed ? h('span.r-what', {}, (lang() === 'ru' && borrowed.whatRu) || borrowed.what || '') : null,
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
    const yearOf = (ref: string) => (ref.startsWith('card:') ? this.app.set.get(ref.slice(5))?.years[0] : this.byId.get(ref)?.years[0]);
    // A chain of chains: each step is told on the connector between exactly
    // the two names it joins; where an artist has several roots, each is its
    // own indented sub-chain; a node met before is a short pointer back.
    const seen = new Set<string>();
    const render = (n: TreeNode, isRoot: boolean): HTMLElement[] => {
      const out: HTMLElement[] = [];
      if (seen.has(n.ref)) {
        out.push(h('p.r-again', {}, pick({ en: `${this.refName(n.ref)}: as above`, ru: `${this.refName(n.ref)} — см. выше` })));
        return out;
      }
      seen.add(n.ref);
      const el = n.ref.startsWith('card:') ? this.cardEl(n.ref.slice(5), step++, !!n.lineage) : this.artistEl(n.ref, isRoot, step++);
      out.push(el);
      const groups = groupChildren(n);
      const sub = groups.length > 1;
      groups.forEach((g, gi) => {
        const from = this.refName(n.ref);
        const to = g.map((c) => this.inlineName(c.ref));
        const yFrom = yearOf(n.ref);
        const yTo = yearOf(g[0].ref);
        // "N years back" only between two artists; an edge into a museum card
        // carries the card's own years instead.
        const intoCard = g[0].ref.startsWith('card:') || n.ref.startsWith('card:');
        const target = g[0].ref.startsWith('card:') ? this.app.set.get(g[0].ref.slice(5)) : undefined;
        const gap = !intoCard && yFrom !== undefined && yTo !== undefined && yFrom > yTo ? yFrom - yTo : 0;
        const when = intoCard ? (target ? formatYears(target.years) : undefined) : yTo;
        const edge = g[0].lineage ? this.lineageEdge(from, to, step++, gap, when) : this.edgeEl(g[0].link!, from, to, step++, gap, when);
        const body = [edge, ...g.flatMap((c) => render(c, false))];
        out.push(sub ? h('div.r-sub', { style: `--b:${gi}` }, h('span.r-branch-no', {}, pick({ en: `root ${gi + 1} of ${groups.length}`, ru: `корень ${gi + 1} из ${groups.length}` })), ...body) : h('div.r-run', {}, ...body));
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
        h('p.r-count', {}, pick({ en: `${a.paths.length} ${a.paths.length === 1 ? 'chain' : 'chains'}, ${ends.length} ${ends.length === 1 ? 'root' : 'roots'} in the museum`, ru: `Цепочек: ${a.paths.length}, корней в музее: ${ends.length}` })),
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
  private inlineName(ref: string): string {
    if (ref.startsWith('card:')) {
      const c = this.app.set.get(ref.slice(5));
      return c?.inline || c?.title || ref.slice(5);
    }
    return this.refName(ref);
  }

  /** One step, told between the two names it joins. */
  private edgeEl(l: RootLink, from: string, to: string[], i: number, gap: number, year?: number | string): HTMLElement {
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
      h('div.r-edge-foot', {}, this.gapEl(gap, year), h('ul.r-src', {}, l.sources.map((s) => h('li', {}, h('a', { href: s.url, rel: 'noopener', target: '_blank' }, s.title))))),
    );
  }

  private lineageEdge(from: string, to: string[], i: number, gap: number, year?: number | string): HTMLElement {
    return h(
      'div.r-edge.r-lin.r-anim',
      { style: `--i:${i}` },
      h('div.r-edge-head', {}, h('b', {}, from), h('span.r-arrow', { 'aria-hidden': 'true' }, '→'), h('b', {}, to.join(pick({ en: ' and ', ru: ' и ' }))), h('span.r-kind', {}, h('i', { 'aria-hidden': 'true' }, '↓'), pick({ en: 'grew out of', ru: 'выросло из' }))),
      h('div.r-edge-foot', {}, this.gapEl(gap, year)),
    );
  }

  private endYears(ref: string): string {
    const c = ref.startsWith('card:') ? this.app.set.get(ref.slice(5)) : undefined;
    return c ? `, ${c.places[0].name}, ${formatYears(c.years)}` : '';
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

  /** The time between two steps, written on the line: '← 13 years · 1968'. */
  private gapEl(gap: number, year?: number | string): HTMLElement | null {
    if (!year) return null;
    return h('span.r-gap', {}, gap ? pick({ en: `${gap} ${gap === 1 ? 'year' : 'years'} back · ${year}`, ru: `на ${count(gap, 'year', 'ru')} раньше · ${year}` }) : String(year));
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
        h('small', {}, pick({ en: 'In the museum', ru: 'В музее' }), ...vtags(` · ${c.era ?? ''} · ${formatYears(c.years)}`)),
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
