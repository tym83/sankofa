import { h } from '../lib/dom';

let tip: HTMLElement | null = null;

export function showTip(ev: MouseEvent, small: string, title: string, text: string): void {
  if (!tip) {
    tip = h('div.tip', { 'aria-hidden': 'true' });
    document.body.append(tip);
  }
  tip.replaceChildren(h('small', {}, small), h('b', {}, title), h('span', {}, text));
  const x = Math.min(window.innerWidth - 300, ev.clientX + 14);
  const y = ev.clientY + 16 + 120 > window.innerHeight ? ev.clientY - 130 : ev.clientY + 16;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.classList.add('on');
}

export function hideTip(): void {
  tip?.classList.remove('on');
}
