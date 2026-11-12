type Attrs = Record<string, string | number | boolean | undefined | null | EventListener>;
type Child = Node | string | null | undefined | false;

/** Tiny hyperscript: h('a.xref', {href: '#'}, 'text'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K | string, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElement {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function svgIcon(name: 'sun' | 'moon' | 'map' | 'book' | 'close' | 'term' | 'link' | 'prev' | 'next' | 'down'): SVGSVGElement {
  const paths: Record<string, string> = {
    sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
    map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13v2',
    close: 'M6 6l12 12M18 6 6 18',
    term: 'm5 8 4 4-4 4m6 0h8',
    link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
    prev: 'M15 6l-6 6 6 6',
    next: 'M9 6l6 6-6 6',
    down: 'M12 3v15m0 0-6-6m6 6 6-6M5 21h14',
  };
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', paths[name]);
  svg.append(p);
  return svg;
}

let toastTimer = 0;
export function toast(msg: string): void {
  let el = document.querySelector<HTMLElement>('.toast');
  if (!el) {
    el = h('div.toast', { role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('on'), 2200);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }) as HTMLTextAreaElement;
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Reveal elements once when they enter the viewport. */
export function revealOnScroll(root: ParentNode = document): void {
  const els = root.querySelectorAll('.reveal:not(.seen), .hero:not(.seen)');
  if (!('IntersectionObserver' in window)) {
    els.forEach((e) => e.classList.add('seen'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('seen');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
  );
  els.forEach((e) => io.observe(e));
}

const BOOK_PATHS: Record<string, string> = {
  // ❝ the Book of Voices: two quotation marks
  voices: 'M3 14c0-4 2-7 5-8l1 1.6C7.4 8.6 6.6 10 6.5 11.5H9V18H3v-4Zm9 0c0-4 2-7 5-8l1 1.6c-1.6 1-2.4 2.4-2.5 3.9H18V18h-6v-4Z',
  // ▤ the Book of Archives: a ledger page with ruled lines
  archives: 'M4 4h16v16H4V4Zm2 2v3h12V6H6Zm0 5v2h12v-2H6Zm0 4v3h12v-3H6Z',
  // ✶ the Book of Heirs: a six-pointed star
  heirs: 'M12 2l2.2 6.2L20.7 7l-4.4 5 4.4 5-6.5-1.2L12 22l-2.2-6.2L3.3 17l4.4-5-4.4-5 6.5 1.2L12 2Z',
};

/** The book symbols as inline SVG, so they render the same on every system. */
export function bookMarks(books: string[] | undefined): HTMLElement {
  const span = h('span.sym', { 'aria-hidden': 'true' });
  for (const b of books ?? []) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', `bm ${b}`);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', BOOK_PATHS[b] ?? '');
    p.setAttribute('fill', 'currentColor');
    p.setAttribute('fill-rule', 'evenodd');
    svg.append(p);
    span.append(svg);
  }
  return span;
}
