// Juegos NotiCel points: one total for every game, kept in this browser (localStorage 'nc-points') until accounts exist.
// Games call award() when the reader wins or finishes; `once` stops the same daily puzzle from counting twice.
// The first points of each day add a daily bonus and count toward a streak of days played.

import { notify } from './notifications';

export type PointsState = {
  total: number;
  games: Record<string, number>;
  log: Array<{ t: number; game: string; pts: number; why: string }>;
  once: Record<string, 1>;
  days: string[]; // YYYY-MM-DD (Puerto Rico) days with points
  byDay: Record<string, Record<string, number>>; // day → game → points that day (last 8 days)
};

const KEY = 'nc-points';
export const DAILY_BONUS = 10;
export const LEVELS = [
  { at: 0, name: 'Novato' }, { at: 200, name: 'Jugador' }, { at: 600, name: 'Experto' },
  { at: 1500, name: 'Campeón' }, { at: 3000, name: 'Leyenda boricua' },
];
// How many points each game gives (shown on the Juegos page)
export const RULES: Record<string, string> = {
  crucigrama: '100 al completarlo (1 vez al día)',
  palabra: '50 a 100 según los intentos (1 vez al día)',
  sopa: '80 al encontrar todas (1 vez al día)',
  sudoku: '60 a 150 según el nivel',
  trivia: '30 por acertar (1 vez al día)',
  memoria: '40 a 80 según las jugadas',
  domino: '60 por ganar la partida',
  'cuatro-colores': '40 por ganar',
  ahorcado: '20 por palabra adivinada',
  '2048': '150 al llegar a 2048, más 1 por cada 200 puntos',
  'cuatro-en-linea': '30 por ganar',
};

export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' });

export function getPoints(): PointsState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s.total === 'number') return { total: s.total, games: s.games ?? {}, log: s.log ?? [], once: s.once ?? {}, days: s.days ?? [], byDay: s.byDay ?? {} };
  } catch { /* storage blocked */ }
  return { total: 0, games: {}, log: [], once: {}, days: [], byDay: {} };
}

export function levelOf(total: number) {
  let i = 0; while (i + 1 < LEVELS.length && total >= LEVELS[i + 1].at) i++;
  const next = LEVELS[i + 1];
  return { name: LEVELS[i].name, index: i, next, toNext: next ? next.at - total : 0, pct: next ? ((total - LEVELS[i].at) / (next.at - LEVELS[i].at)) * 100 : 100 };
}

/** Days in a row (ending today or yesterday) with points. */
export function streakOf(days: string[]) {
  const set = new Set(days); let n = 0;
  const d = new Date(`${today()}T12:00:00`);
  if (!set.has(today())) d.setDate(d.getDate() - 1);
  while (set.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** Adds points for a game. Returns the points added (0 if `once` was already used). */
export function award(game: string, pts: number, why: string, once?: string): number {
  pts = Math.max(0, Math.round(pts));
  const s = getPoints();
  if (!pts || (once && s.once[once])) return 0;
  if (once) s.once[once] = 1;
  let added = pts;
  const d = today();
  if (!s.days.includes(d)) { s.days = [...s.days, d].slice(-60); added += DAILY_BONUS; s.log.unshift({ t: Date.now(), game: 'bono', pts: DAILY_BONUS, why: 'Bono del día' }); }
  s.total += added;
  s.games[game] = (s.games[game] ?? 0) + pts;
  s.byDay[d] = { ...(s.byDay[d] ?? {}), [game]: (s.byDay[d]?.[game] ?? 0) + pts };
  s.byDay = Object.fromEntries(Object.entries(s.byDay).sort(([a], [b]) => b.localeCompare(a)).slice(0, 8));
  s.log.unshift({ t: Date.now(), game, pts, why });
  s.log = s.log.slice(0, 30);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { return 0; }
  dispatchEvent(new CustomEvent('nc-points', { detail: { added, total: s.total, why } }));
  const lvl = levelOf(s.total);
  if (lvl.index > levelOf(s.total - added).index) notify({ id: `pts-${lvl.index}`, kind: 'badge', text: `¡Subiste a ${lvl.name} en Juegos NotiCel! Ya tienes ${s.total.toLocaleString('es-PR')} puntos.`, url: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/perfil/` });
  return added;
}
