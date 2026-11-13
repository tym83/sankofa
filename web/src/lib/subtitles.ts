// The listening room's subtitles: what the cluster just did, in plain words.
import { count, type Lang } from './i18n';

export type Sub =
  | { kind: 'lease'; drum: string }
  | { kind: 'call'; drum: string; ready: number; silent: number }
  | { kind: 'join'; name: string; drum: string }
  | { kind: 'leave'; name: string; drum: string }
  | { kind: 'down'; drum: string }
  | { kind: 'moved'; drum: string; n: number };

export function subtitle(s: Sub, l: Lang): string {
  const ru = l === 'ru';
  switch (s.kind) {
    case 'lease':
      return ru ? `${s.drum} отметился: жив` : `${s.drum} checked in: alive`;
    case 'call': {
      if (!s.ready) return ru ? `Кластер зовёт ${s.drum} — никто не отвечает` : `The cluster calls ${s.drum}: no one answers`;
      const answer = ru ? `${count(s.ready, 'program', 'ru')} ${s.ready % 10 === 1 && s.ready % 100 !== 11 ? 'отвечает' : 'отвечают'}` : `${count(s.ready, 'program', 'en')} ${s.ready === 1 ? 'answers' : 'answer'}`;
      const quiet = s.silent ? (ru ? `, ${count(s.silent, 'program', 'ru')} ${s.silent % 10 === 1 && s.silent % 100 !== 11 ? 'молчит' : 'молчат'}` : `, ${s.silent} silent`) : '';
      return ru ? `Кластер зовёт ${s.drum} — ${answer}${quiet}` : `The cluster calls ${s.drum}: ${answer}${quiet}`;
    }
    case 'join':
      return ru ? `Вступает новый голос: ${s.name} на барабане ${s.drum}` : `A new voice joins: ${s.name} on ${s.drum}`;
    case 'leave':
      return ru ? `${s.name} уходит` : `${s.name} leaves`;
    case 'down':
      return ru ? `${s.drum} замолчал и объявлен выбывшим` : `${s.drum} has fallen silent and is declared down`;
    case 'moved':
      return ru ? `${count(s.n, 'program', 'ru')} с барабана ${s.drum} ${s.n === 1 ? 'перешла' : 'перешли'} к остальным` : `${count(s.n, 'program', 'en')} from ${s.drum} moved to the others`;
  }
}
