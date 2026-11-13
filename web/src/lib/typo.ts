// Small typographic care: non-breaking spaces where a short word would be left
// hanging at the end of a line, and inside names that must not split.

const NBSP = ' ';

const RU_SHORT = /(^|[\s(«„"—–-])(а|в|во|и|к|ко|о|об|обо|с|со|у|я|не|ни|но|на|за|из|от|до|по|под|над|при|без|для|же|ли|бы|как|что|это|его|её|их|он|она|они|мы|вы|ты)[ \t\n]+(?=\S)/giu;
const EN_SHORT = /(^|[\s(“"—–])(a|an|the|of|to|in|on|at|by|for|and|or|as|is|I)[ \t\n]+(?=\S)/gu;
const NAMES = /(Sun|Сан) (Ra|Ра)(?![\p{L}])/gu;

export function nbsp(text: string, lang: string): string {
  let s = text.replace(NAMES, `$1${NBSP}$2`);
  // A dash belongs to the word before it.
  s = s.replace(/ (—)/g, `${NBSP}$1`);
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

/** Apply nbsp() to every text node under root. */
export function typeset(root: Node, lang: string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && (SKIP.has(n.parentElement.tagName) || n.parentElement.closest('pre, code, svg text.lbl')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (t.data.length < 3 || !/\s/.test(t.data)) continue;
    const next = nbsp(t.data, lang);
    if (next !== t.data) t.data = next;
  }
}

/** Keep typesetting whatever the museum adds to the page. */
export function watchTypography(lang: string): void {
  typeset(document.body, lang);
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => (n.nodeType === 1 || n.nodeType === 3) && typeset(n, lang));
  }).observe(document.body, { childList: true, subtree: true });
}
