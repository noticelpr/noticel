// Reader notifications: someone tagged you (@name), liked or replied to your comment, you earned a badge or level,
// or the newsroom decided on a comment of yours. Shown as a dot on the profile icon, in the profile menu and on /perfil.
// Kept in this browser (localStorage 'nc-notifs'). With reader accounts (Supabase), notifications from other readers
// (replies, mentions, likes, the newsroom's decisions) come from the `notifications` table: syncNotifs() merges them in
// as 'db-<id>' and marking them read updates the table. In preview mode other readers' are examples (EJEMPLO).
import { api, loggedIn, accountsOn, myId } from './account';

export type NotifKind = 'mention' | 'reply' | 'like' | 'badge' | 'mod';
export type Notif = { id: string; at: number; kind: NotifKind; who?: string; text: string; quote?: string; url?: string; read?: boolean; demo?: boolean };

export const KINDS: Array<{ id: NotifKind; name: string; desc: string }> = [
  { id: 'mention', name: 'Menciones', desc: 'Cuando alguien escribe @tu_nombre en un comentario.' },
  { id: 'reply', name: 'Respuestas', desc: 'Cuando alguien responde a tu comentario.' },
  { id: 'like', name: 'Me gusta', desc: 'Cuando a alguien le gusta tu comentario.' },
  { id: 'badge', name: 'Insignias y niveles', desc: 'Cuando subes de nivel en comentarios o en Juegos NotiCel.' },
  { id: 'mod', name: 'Moderación', desc: 'Cuando la redacción revisa un comentario tuyo.' },
];

const KEY = 'nc-notifs', PREFS = 'nc-notif-prefs';
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export const getNotifs = (): Notif[] => read<Notif[]>(KEY, []).sort((a, b) => b.at - a.at);
export const unreadCount = () => getNotifs().filter((n) => !n.read).length;
export const getPrefs = (): Record<NotifKind, boolean> => ({ mention: true, reply: true, like: true, badge: true, mod: true, ...read(PREFS, {}) });
export const setPrefs = (p: Record<NotifKind, boolean>) => {
  write(PREFS, p);
  // With an account the choice is saved there, and the server stops creating the kinds turned off (wants() in SQL)
  if (accountsOn() && loggedIn()) void api(`profiles?id=eq.${myId()}`, { method: 'PATCH', body: JSON.stringify({ notif_prefs: p }) });
};

const changed = (added?: Notif) => dispatchEvent(new CustomEvent('nc-notifs', { detail: { added } }));

/** Adds a notification unless the reader turned that kind off, or the same id already exists. */
export function notify(n: Omit<Notif, 'at'> & { at?: number }) {
  if (!getPrefs()[n.kind]) return;
  const list = getNotifs();
  if (list.some((x) => x.id === n.id)) return;
  const full: Notif = { at: Date.now(), ...n };
  write(KEY, [full, ...list].slice(0, 60));
  changed(full);
}
export function markRead(id?: string) {
  write(KEY, getNotifs().map((n) => (!id || n.id === id ? { ...n, read: true } : n)));
  changed();
  if (accountsOn() && loggedIn() && (!id || id.startsWith('db-'))) {
    void api(id ? `notifications?id=eq.${id.slice(3)}` : 'notifications?read=eq.false', { method: 'PATCH', body: JSON.stringify({ read: true }) });
  }
}

/** Brings in the logged-in reader's notifications from the server (newest 40). */
export async function syncNotifs() {
  if (!accountsOn()) return;
  if (!loggedIn()) { write(KEY, getNotifs().filter((n) => !n.id.startsWith('db-'))); changed(); return; }
  // The account's notification settings (any device), then its notifications
  const pr = await api(`profiles?id=eq.${myId()}&select=notif_prefs`);
  if (pr?.ok) { const row = (await pr.json())[0]; if (row?.notif_prefs && Object.keys(row.notif_prefs).length) write(PREFS, row.notif_prefs); }
  const r = await api('notifications?select=id,kind,actor,text,quote,url,read,created_at&order=created_at.desc&limit=40');
  if (!r?.ok) return;
  const rows: Array<{ id: number; kind: NotifKind; actor: string | null; text: string; quote: string | null; url: string | null; read: boolean; created_at: string }> = await r.json();
  const prefs = getPrefs();
  const local = getNotifs().filter((n) => !n.id.startsWith('db-') && !n.demo);
  const known = new Set(getNotifs().map((n) => n.id));
  const fresh = rows.filter((x) => prefs[x.kind]).map((x): Notif => ({ id: `db-${x.id}`, at: Date.parse(x.created_at), kind: x.kind, who: x.actor ?? undefined, text: x.text, quote: x.quote ?? undefined, url: x.url ?? undefined, read: x.read }));
  write(KEY, [...fresh, ...local].sort((a, b) => b.at - a.at).slice(0, 60));
  const added = fresh.find((n) => !known.has(n.id) && !n.read);
  changed(added);
}
export function clearNotifs() { write(KEY, []); changed(); }

/** Example notifications from other readers, added once so the preview shows what they look like. */
export function seedExamples(storyUrl: string, gameUrl: string) {
  try { if (localStorage.getItem('nc-notif-seeded')) return; localStorage.setItem('nc-notif-seeded', '1'); } catch { return; }
  let me = 'tú'; try { me = JSON.parse(localStorage.getItem('nc-profile') || '{}').name || me; } catch { /* storage blocked */ }
  const now = Date.now();
  [
    { id: 'ej-like', kind: 'like', who: 'lectora_bayamon', text: 'y 4 más les gustó tu comentario.', quote: 'Esto hay que seguirlo de cerca…', url: storyUrl, at: now - 40 * 60000 },
    { id: 'ej-mention', kind: 'mention', who: 'jose.boricua', text: 'te mencionó en un comentario.', quote: `@${me} tienes toda la razón, hay que pedir vistas públicas.`, url: storyUrl, at: now - 3 * 36e5 },
    { id: 'ej-reply', kind: 'reply', who: 'tito_domino', text: 'respondió a tu comentario en Dominó.', quote: '¡Te reto a una partida hoy!', url: gameUrl, at: now - 26 * 36e5 },
  ].forEach((n) => notify({ ...(n as Notif), demo: true }));
}

/** "hace 5 min" style time. */
export const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
