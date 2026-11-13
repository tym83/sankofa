// Roots: type a band or an artist and watch the chain grow back, link by
// sourced link, to a card of the museum.
import type { App } from '../app';
import { buildTree, chainLine, deepest, endCards, extendLineage, foldRun, KIND_LABEL, longestRoots, searchArtists, suggestions, type Artist, type LineageCard, type RootLink, type TreeNode } from '../lib/roots';
import { copyText, h, reducedMotion, svgIcon, toast } from '../lib/dom';
import { formatYears } from '../lib/cards';
import { lang, pick, t } from '../lib/i18n';
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
          h('span', {}, `${(lang() === 'ru' && a.genreRu) || a.genre} · ${formatYears(a.years)} · ${a.place.name}`),
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
    const one = (n: TreeNode, isRoot = false): HTMLElement[] => {
      const parts: HTMLElement[] = [];
      if (n.link) parts.push(this.linkEl(n.link, step++));
      if (n.lineage) parts.push(this.lineageEl(step++));
      parts.push(n.ref.startsWith('card:') ? this.cardEl(n.ref.slice(5), step++, n.lineage) : this.artistEl(n.ref, isRoot, step++));
      return parts;
    };
    // A node and the run of single steps after it; long runs fold in the middle.
    const seq = (n: TreeNode, isRoot = false): HTMLElement => {
      const run: TreeNode[] = [n];
      let cur = n;
      while (cur.children.length === 1) {
        cur = cur.children[0];
        run.push(cur);
      }
      const artists = run.filter((x) => !x.ref.startsWith('card:')).length;
      const { hide } = foldRun(artists, 4);
      const out: HTMLElement[] = [];
      run.forEach((x, i) => {
        const hidden = hide > 0 && i >= 2 && i < 2 + hide;
        if (hide > 0 && i === 2) {
          const box = h('div.r-folded', { hidden: true });
          const btn = h(
            'button.r-fold',
            {
              'aria-expanded': 'false',
              onclick: () => {
                box.hidden = false;
                box.querySelectorAll('.r-anim').forEach((e) => e.classList.add('in'));
                btn.remove();
              },
            },
            pick({ en: `+${hide} steps`, ru: `ещё шагов: ${hide}` }),
          );
          out.push(btn, box);
        }
        const parts = one(x, isRoot && i === 0);
        if (hidden) (out[out.length - 1] as HTMLElement).append(...parts);
        else out.push(...parts);
      });
      if (cur.children.length > 1)
        out.push(h('div.r-branches', { style: `--n:${cur.children.length}` }, cur.children.map((c) => h('div.r-branch', {}, seq(c)))));
      return h('div.r-seq', {}, out);
    };
    const node = (n: TreeNode) => seq(n, true);
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
        node(tree),
      ),
      close,
    );
    this.el.scrollTo({ top: 0, behavior: 'auto' });
    if (!reducedMotion()) requestAnimationFrame(() => this.stage.querySelectorAll('.r-anim').forEach((x) => x.classList.add('in')));
    else this.stage.querySelectorAll('.r-anim').forEach((x) => x.classList.add('in'));
  }

  private endYears(ref: string): string {
    const c = ref.startsWith('card:') ? this.app.set.get(ref.slice(5)) : undefined;
    return c ? `, ${c.places[0].name}, ${formatYears(c.years)}` : '';
  }

  private artistEl(id: string, isRoot: boolean, i: number): HTMLElement {
    const a = this.byId.get(id);
    if (!a) return h('div.r-artist', {}, id);
    const genre = (lang() === 'ru' && a.genreRu) || a.genre;
    const body = [h('small', {}, `${formatYears(a.years)} · ${a.place.name}`), h('b', {}, this.nameOf(a)), h('span', {}, genre)];
    return isRoot
      ? h(`div.r-artist.r-root.r-anim`, { style: `--i:${i}` }, ...body)
      : h('a.r-artist.r-anim', { href: `#view=roots&artist=${id}`, 'data-artist': id, style: `--i:${i}`, title: pick({ en: 'Follow this artist’s own roots', ru: 'Проследить корни этого исполнителя' }) }, ...body);
  }

  private linkEl(l: RootLink, i: number): HTMLElement {
    const claim = (lang() === 'ru' && l.claimRu) || l.claim;
    const what = (lang() === 'ru' && l.whatRu) || l.what;
    const kind = l.kind ? KIND_LABEL[l.kind] : undefined;
    return h(
      `div.r-link.r-anim${l.kind ? `.k-${l.kind}` : ''}`,
      { style: `--i:${i}` },
      h('i.r-line', { 'aria-hidden': 'true' }),
      h(
        'div.r-claim',
        {},
        kind ? h('span.r-kind', {}, h('b', { 'aria-hidden': 'true' }, kind.glyph), pick(kind)) : null,
        // A cover or a sample names what was taken: that is the surprise.
        what ? h('p.r-what', {}, what) : null,
        h('p', {}, claim),
        h(
          'ul.r-src',
          {},
          l.sources.map((s) => h('li', {}, h('a', { href: s.url, rel: 'noopener', target: '_blank' }, s.title))),
        ),
      ),
    );
  }

  /** The museum's own lineage: one genre grew out of an older one. */
  private lineageEl(i: number): HTMLElement {
    return h(
      'div.r-link.r-lineage.r-anim',
      { style: `--i:${i}` },
      h('i.r-line', { 'aria-hidden': 'true' }),
      h('div.r-claim', {}, h('span.r-kind', {}, h('b', { 'aria-hidden': 'true' }, '↓'), pick({ en: 'grew out of', ru: 'выросло из' }))),
    );
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
        h('small', {}, pick({ en: 'In the museum', ru: 'В музее' }), ` · ${c.era ?? ''} · ${formatYears(c.years)}`),
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
