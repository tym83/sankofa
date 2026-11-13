// The listening room's subtitles: what the cluster just did, in plain words.
import { count, type Lang } from './i18n';

export type Sub =
  | { kind: 'lease'; drum: string }
  | { kind: 'call'; drum: string; ready: number; silent: number }
  | { kind: 'join'; name: string; drum: string }
  | { kind: 'leave'; name: string; drum: string }
  | { kind: 'down'; drum: string }
  | { kind: 'moved'; drum: string; n: number }
  | { kind: 'stopped'; drum: string; s: number }
  | { kind: 'late'; drum: string; late: number; s: number }
  | { kind: 'mended'; drum: string }
  | { kind: 'rebalance'; drum: string }
  | { kind: 'failed'; drum: string; n: number };

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
      // Workload names are names, not words: the sentence says what they are.
      return ru ? `Вступает новая программа ${s.name} на барабане ${s.drum}` : `A new program, ${s.name}, joins on ${s.drum}`;
    case 'leave':
      return ru ? `Программа ${s.name} уходит` : `The ${s.name} program leaves`;
    case 'down':
      return ru ? `${s.drum} замолчал и объявлен выбывшим` : `${s.drum} has fallen silent and is declared down`;
    case 'stopped':
      return ru
        ? `Вы остановили ${s.drum}. Его сердцебиение запаздывает; через ${s.s} с кластер перестанет его ждать.`
        : `You stopped ${s.drum}. Its heartbeat is late; the cluster will give up on it in ${s.s} s.`;
    case 'late':
      return ru ? `${s.drum} молчит уже ${s.late} с — кластер ждёт ещё ${s.s} с` : `${s.drum} has been silent for ${s.late} s; the cluster waits ${s.s} s more`;
    case 'mended':
      return ru ? `${s.drum} снова играет` : `${s.drum} plays again`;
    case 'rebalance':
      return ru
        ? `Kubernetes не возвращает поды сам: на ${s.drum} они попадут по мере перезапуска`
        : `Kubernetes does not move pods back by itself: they reach ${s.drum} as they restart`;
    case 'failed':
      return ru ? `Вы уронили ${count(s.n, 'program', 'ru')} на барабане ${s.drum}: на зов они не ответят` : `You failed ${count(s.n, 'program', 'en')} on ${s.drum}: they will not answer the call`;
    case 'moved':
      return ru ? `${count(s.n, 'program', 'ru')} с барабана ${s.drum} ${s.n === 1 ? 'перешла' : 'перешли'} к остальным` : `${count(s.n, 'program', 'en')} from ${s.drum} moved to the others`;
  }
}
