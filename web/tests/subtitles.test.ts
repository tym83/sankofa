import { describe, expect, it } from 'vitest';
import { subtitle } from '../src/lib/subtitles';
import { guestPitch, parsePulse } from '../src/lib/rhythm';

describe('listening room subtitles', () => {
  it('say what happened in English', () => {
    expect(subtitle({ kind: 'lease', drum: 'Atsimevu' }, 'en')).toBe('Atsimevu checked in: alive');
    expect(subtitle({ kind: 'call', drum: 'Sogo', ready: 12, silent: 0 }, 'en')).toBe('The cluster calls Sogo: 12 programs answer');
    expect(subtitle({ kind: 'call', drum: 'Sogo', ready: 1, silent: 2 }, 'en')).toBe('The cluster calls Sogo: 1 program answers, 2 silent');
    expect(subtitle({ kind: 'join', name: 'guest-drummer', drum: 'Sogo' }, 'en')).toBe('A guest drummer joins on Sogo');
    expect(subtitle({ kind: 'leave', name: 'guest-drummer', drum: 'Sogo' }, 'en')).toBe('A guest drummer leaves');
  });

  it('and in Russian with proper plurals', () => {
    expect(subtitle({ kind: 'lease', drum: 'Атсимеву' }, 'ru')).toBe('Атсимеву отметился: жив');
    expect(subtitle({ kind: 'call', drum: 'Sogo', ready: 1, silent: 0 }, 'ru')).toBe('Кластер зовёт Sogo — 1 программа отвечает');
    expect(subtitle({ kind: 'call', drum: 'Sogo', ready: 3, silent: 0 }, 'ru')).toBe('Кластер зовёт Sogo — 3 программы отвечают');
    expect(subtitle({ kind: 'call', drum: 'Sogo', ready: 12, silent: 21 }, 'ru')).toBe('Кластер зовёт Sogo — 12 программ отвечают, 21 программа молчит');
    expect(subtitle({ kind: 'call', drum: 'Sogo', ready: 0, silent: 4 }, 'ru')).toBe('Кластер зовёт Sogo — никто не отвечает');
    expect(subtitle({ kind: 'join', name: 'guest-drummer', drum: 'Sogo' }, 'ru')).toBe('Вступает приглашённый барабанщик — на барабане Sogo');
  });

  it('reads pod events from the stream', () => {
    expect(parsePulse('{"type":"pod","phase":"joined","name":"guest-drummer","node":"n1","at":"x"}')).toMatchObject({ type: 'pod', phase: 'joined', name: 'guest-drummer' });
    expect(parsePulse('{"type":"pod","phase":"weird","name":"a"}')).toBeNull();
    expect(guestPitch('guest-drummer')).toBe(guestPitch('guest-drummer'));
  });
});
