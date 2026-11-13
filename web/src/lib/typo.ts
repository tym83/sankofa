// Small typographic care: non-breaking spaces where a short word would be left
// hanging at the end of a line, and inside names that must not split.

const NBSP = ' ';

const RU_SHORT = /(^|[\s(«„"—–-])(а|в|во|и|к|ко|о|об|обо|с|со|у|я|не|ни|но|на|за|из|от|до|по|под|над|при|без|для|же|ли|бы|как|что|это|его|её|их|он|она|они|мы|вы|ты)[ \t\n]+(?=\S|$)/giu;
const EN_SHORT = /(^|[\s(“"—–])(a|an|the|of|to|in|on|at|by|for|and|or|as|is|I)[ \t\n]+(?=\S|$)/gu;
const NAMES = /(Sun|Сан) (Ra|Ра)(?![\p{L}])/gu;

/**
 * Typographer's quotes and apostrophes. Decided by the neighbours of each mark,
 * not by pairing, so a quote that opens in one text node and closes in the next
 * (around a link) still comes out right.
 */
export function quotes(text: string, lang: string): string {
  const ru = lang === 'ru';
  return (
    text
      // apostrophes inside or at the end of a word: Sony’r, don’t, Jacobs’
      .replace(/(\p{L})'(?=\p{L})/gu, '$1’')
      .replace(/(\p{L}s)'(?=\s|[.,;:!?)]|$)/gu, '$1’')
      // double quotes: opening after start, space or bracket; closing otherwise
      .replace(/(^|[\s(\[—–-])"/gu, `$1${ru ? '«' : '“'}`)
      .replace(/"/g, ru ? '»' : '”')
      // single quotes left: opening after start, space or bracket
      .replace(/(^|[\s(\[—–-])'/gu, '$1‘')
      .replace(/'/g, '’')
  );
}

export function nbsp(text: string, lang: string): string {
  let s = quotes(text, lang).replace(NAMES, `$1${NBSP}$2`);
  // A dash belongs to the word before it.
  s = s.replace(/ (—)/g, `${NBSP}$1`);
  // A year range is one word: "1791–1804" never breaks at the dash.
  s = s.replace(/(\d)([–-])(?=\d)/g, '$1\u2060$2\u2060');
  // Numbers stay with their units and the words they count.
  s = s.replace(/(\d) (?=[^\d\s])/g, `$1${NBSP}`);
  const re = lang === 'ru' ? RU_SHORT : EN_SHORT;
  // Repeat until stable: "и до звездолётов" needs two passes.
  for (let i = 0; i < 4; i++) {
    const next = s.replace(re, (_, pre, w) => `${pre}${w}${NBSP}`);
    if (next === s) break;
    s = next;
  }
  return s;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT']);

/** Typeset one text node in the language of its element. */
function setText(t: Text, lang: string): void {
  const p = t.parentElement;
  if (!p || SKIP.has(p.tagName) || p.closest('pre, code, svg text.lbl')) return;
  if (!/["']/.test(t.data) && (t.data.length < 2 || !/\s/.test(t.data))) return;
  const l = p.closest('[lang]')?.getAttribute('lang')?.slice(0, 2) || lang;
  const next = nbsp(t.data, l);
  if (next !== t.data) t.data = next;
}

/** Apply nbsp() and quotes to every text node under root. */
export function typeset(root: Node, lang: string): void {
  // A walker never returns its own root: a text node set by textContent is handled here.
  if (root.nodeType === 3) return setText(root as Text, lang);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  nodes.forEach((t) => setText(t, lang));
}

/** Keep typesetting whatever the museum adds to the page. */
export function watchTypography(lang: string): void {
  typeset(document.body, lang);
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => (n.nodeType === 1 || n.nodeType === 3) && typeset(n, lang));
  }).observe(document.body, { childList: true, subtree: true });
}
