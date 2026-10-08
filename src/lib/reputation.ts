// Commenter reputation (separate from Juegos Xtra points). Hard to farm on purpose:
//  - only comments with real text count (40+ characters, stickers/short replies don't), and only 5 a day
//  - likes from OTHER readers count most; an editor's "Destacado" counts a lot; reports cost points
//  - each level needs points AND time AND likes; Top comentarista also needs no reports in 90 days
// With reader accounts (Supabase) the server counts it from real comments and likes (reputation() in
// supabase/connect-all.sql, same rules) and syncRep() mirrors it in 'nc-rep'; without accounts it's a preview
// kept in this browser.

export type Rep = {
  points: number;
  comments: number;
  likes: number; // likes received from other readers
  featured: number; // comments marked "Destacado" by the newsroom
  days: string[]; // days with a counted comment (YYYY-MM-DD, Puerto Rico)
  daily: Record<string, number>; // counted comments per day
  awarded: Record<string, number>; // comment id → points given (so deleting takes them back)
  reports: number[]; // times a comment was reported and hidden
};

export const RULES = {
  minChars: 40, perDay: 5, comment: 2, reply: 3, like: 5, featured: 50, report: -30,
};
export const LEVELS = [
  { id: 'nuevo', name: 'Nuevo', points: 0, days: 0, likes: 0 },
  { id: 'comentarista', name: 'Comentarista', points: 150, days: 7, likes: 0 },
  { id: 'voz', name: 'Voz de la comunidad', points: 500, days: 30, likes: 25 },
  { id: 'top', name: 'Top comentarista', points: 1500, days: 60, likes: 100, cleanDays: 90 },
  { id: 'diamante', name: 'Diamante', points: 5000, days: 150, likes: 300, cleanDays: 180 },
] as const;
export type LevelId = (typeof LEVELS)[number]['id'];

const KEY = 'nc-rep';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' });
const empty = (): Rep => ({ points: 0, comments: 0, likes: 0, featured: 0, days: [], daily: {}, awarded: {}, reports: [] });

export function getRep(): Rep {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return empty(); }
}
function save(r: Rep) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage blocked */ } dispatchEvent(new CustomEvent('nc-rep')); }

/** Letters only (no emoji, spaces or @mentions) decide if a comment has real text. */
const realChars = (text: string) => text.replace(/@\S+/g, '').replace(/[^\p{L}\p{N}]/gu, '').length;

/** Points for a new comment (0 if too short or over today's limit). */
export function addComment(id: string, text: string, isReply: boolean): { pts: number; why: string } {
  const r = getRep();
  r.comments++;
  const d = today();
  let pts = 0, why = '';
  if (realChars(text) < RULES.minChars * 0.75) why = `Escribe al menos ${RULES.minChars} caracteres para sumar puntos.`;
  else if ((r.daily[d] ?? 0) >= RULES.perDay) why = `Ya sumaste puntos por ${RULES.perDay} comentarios hoy.`;
  else {
    pts = isReply ? RULES.reply : RULES.comment;
    r.daily = { [d]: (r.daily[d] ?? 0) + 1 }; // keep only today
    if (!r.days.includes(d)) r.days = [...r.days, d].slice(-400);
    r.awarded[id] = pts; r.points += pts;
    why = `+${pts} de reputación`;
  }
  save(r);
  return { pts, why };
}
/** Deleting your own comment takes its points back. */
export function removeComment(id: string) {
  const r = getRep();
  if (r.awarded[id]) { r.points = Math.max(0, r.points - r.awarded[id]); delete r.awarded[id]; }
  r.comments = Math.max(0, r.comments - 1);
  save(r);
}

/** A comment of yours was hidden for breaking the rules: −30 and a report on record (Top/Diamante need none). */
export function penalize(id: string) {
  const r = getRep();
  r.points = Math.max(0, r.points + RULES.report - (r.awarded[id] ?? 0)); delete r.awarded[id];
  r.reports = [...r.reports, Date.now()];
  save(r);
}

const cleanFor = (r: Rep, days: number) => !r.reports.some((t) => Date.now() - t < days * 864e5);
/** The highest level whose requirements are all met. */
export function levelOf(r: Rep) {
  let i = 0;
  LEVELS.forEach((l, k) => {
    const ok = r.points >= l.points && r.days.length >= l.days && r.likes >= l.likes && (!('cleanDays' in l) || cleanFor(r, l.cleanDays));
    if (ok && k === i + 1) i = k;
  });
  return { ...LEVELS[i], index: i, next: LEVELS[i + 1] };
}
/** Requirements for a level, each with progress (for the "¿Cómo subo?" panel). */
export function needs(r: Rep, l: (typeof LEVELS)[number]) {
  const list = [
    { label: `${l.points.toLocaleString('es-PR')} puntos`, have: r.points, need: l.points },
    ...(l.days ? [{ label: `Comentar en ${l.days} días distintos`, have: r.days.length, need: l.days }] : []),
    ...(l.likes ? [{ label: `${l.likes} Me gusta de otros lectores`, have: r.likes, need: l.likes }] : []),
  ];
  return 'cleanDays' in l ? [...list, { label: `Sin reportes en ${l.cleanDays} días`, have: cleanFor(r, l.cleanDays) ? 1 : 0, need: 1 }] : list;
}

// ---- Badges: the 4 levels (one at a time, shown next to the name) and 3 special badges (collected, shown in the panel) ----
export const LEVEL_INFO: Record<string, { means: string; how: string }> = {
  comentarista: { means: 'Comenta seguido y con sustancia.', how: '150 puntos y comentarios en 7 días distintos.' },
  voz: { means: 'La comunidad valora lo que dice.', how: '500 puntos, 25 Me gusta de otros lectores y comentarios en 30 días distintos.' },
  top: { means: 'De los comentaristas más respetados de NotiCel.', how: '1,500 puntos, 100 Me gusta de otros, comentarios en 60 días distintos y ningún reporte en 90 días. Un reporte lo quita.' },
  diamante: { means: 'Lo más alto: una voz ejemplar de la comunidad, por encima de Top comentarista.', how: '5,000 puntos, 300 Me gusta de otros lectores, comentarios en 150 días distintos y ningún reporte en 180 días. Un reporte lo quita.' },
};
export const SPECIALS = [
  { id: 'primero', name: 'Primer comentario', means: 'Se estrenó en la conversación.', how: 'Publica tu primer comentario con texto real (40 caracteres o más).' },
  { id: 'constante', name: 'Constante 7 días', means: 'Comenta todos los días.', how: 'Comenta (con texto real) 7 días seguidos.' },
  { id: 'limpio', name: 'Sin reportes 90 días', means: 'Comenta con respeto.', how: 'Comenta durante 90 días sin que te reporten ni oculten un comentario.' },
] as const;

/** Longest run of consecutive days in a list of YYYY-MM-DD dates. */
const longestRun = (days: string[]) => {
  const set = [...new Set(days)].sort(); let best = 0, run = 0, prev = 0;
  for (const d of set) { const t = Date.parse(`${d}T12:00:00Z`); run = prev && t - prev === 864e5 ? run + 1 : 1; best = Math.max(best, run); prev = t; }
  return best;
};
/** Which special badges this reader has earned. */
export function specialsOf(r: Rep): Record<string, boolean> {
  const first = r.days.length ? Date.parse(`${[...r.days].sort()[0]}T12:00:00Z`) : 0;
  return {
    primero: r.days.length > 0,
    constante: longestRun(r.days) >= 7,
    limpio: !!first && Date.now() - first >= 90 * 864e5 && cleanFor(r, 90),
  };
}

// ---- Server reputation (reader accounts) ----
import { accountsOn, loggedIn, api, myId } from './account';
const toRep = (j: any): Rep => ({ ...empty(), points: j.points ?? 0, comments: j.comments ?? 0, likes: j.likes ?? 0, featured: j.featured ?? 0, days: j.days ?? [], reports: j.reports ?? [] });
/** Brings the logged-in reader's reputation from the server and keeps it in 'nc-rep' (for the panels and badges). */
export async function syncRep(): Promise<Rep | null> {
  if (!accountsOn() || !loggedIn()) return null;
  const r = await api('rpc/reputation', { method: 'POST', body: JSON.stringify({ uid: myId() }) });
  if (!r?.ok) return null;
  const rep = toRep(await r.json());
  save(rep);
  return rep;
}
/** Reputation of several readers at once (the badges next to their names). */
export async function repsOf(ids: string[]): Promise<Record<string, Rep>> {
  if (!ids.length) return {};
  const r = await api('rpc/reputations', { method: 'POST', body: JSON.stringify({ uids: ids }) }, false);
  if (!r?.ok) return {};
  return Object.fromEntries((await r.json()).map((x: { user_id: string; rep: unknown }) => [x.user_id, toRep(x.rep)]));
}
/** True when the server keeps the reputation (accounts on): the device no longer adds or removes points itself. */
export const serverRep = () => accountsOn();
