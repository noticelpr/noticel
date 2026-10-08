// Shared database (Supabase) for ads: automatic publishing and paid views.
// While BACKEND is empty the site works as a PREVIEW (approved ads and view counts stay on one device).
// Setup (once, when the Supabase account exists):
//   1. Create a project at supabase.com and run supabase/schema.sql in its SQL editor.
//   2. Paste the project URL and the PUBLIC "anon" key below (never the "service_role" key).
//   3. Add each staff member in Supabase → Authentication → Users, and their role in the `staff` table.
import type { Campaign } from './ads';
import { isDemo } from './demo';

// Public values (safe in a website): project URL and the "anon" key. Never put the secret/service_role key here.
export const BACKEND = {
  // NotiCel's OWN Supabase project goes here once it exists (never Noticias Xtra's: each site keeps its own accounts).
  // Empty = preview mode (VISTA PREVIA): the panel works on this device only.
  url: 'https://tadrjmankkictvqzuibu.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZHJqbWFua2tpY3R2cXp1aWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODU2MDEsImV4cCI6MjEwNzA2MTYwMX0.xzUXK192CWpDDU-OoWh8DEfxiL5vwXYvJ1AJ_JB6BzM',
};
// Demo mode (src/lib/demo.ts) works like the preview: sample data only, never the real database
export const hasBackend = () => !!(BACKEND.url && BACKEND.anonKey) && !isDemo();

const SESSION = 'nc-staff-session'; // staff login token (only when the backend exists)
const head = (token?: string) => ({ apikey: BACKEND.anonKey, Authorization: `Bearer ${token || BACKEND.anonKey}`, 'Content-Type': 'application/json' });
const rest = (path: string) => `${BACKEND.url.replace(/\/$/, '')}/rest/v1/${path}`;
export type LiveCampaign = Campaign & { delivered: number };

/** Campaigns running right now for every reader (dates current and paid views not yet delivered). */
export async function liveCampaigns(): Promise<LiveCampaign[]> {
  if (!hasBackend()) return [];
  try {
    const r = await fetch(rest('ad_campaigns_live?select=*'), { headers: head() });
    if (!r.ok) return [];
    return (await r.json()).map((c: any) => ({ ...c, end: c.end_date, start: c.start_date, delivered: c.delivered ?? 0 }));
  } catch { return []; }
}
/** One view or one click of a campaign (counted for everyone). */
export const countView = (id: string) => hasBackend() && fetch(rest('rpc/ad_view'), { method: 'POST', headers: head(), body: JSON.stringify({ cid: id }), keepalive: true }).catch(() => {});
export const countClick = (id: string) => hasBackend() && fetch(rest('rpc/ad_click'), { method: 'POST', headers: head(), body: JSON.stringify({ cid: id }), keepalive: true }).catch(() => {});
/** Delivered views and clicks for some campaigns (staff panel, advertiser panel). */
export async function campaignStats(ids: string[]): Promise<Record<string, { views: number; clicks: number }>> {
  if (!hasBackend() || !ids.length) return {};
  try {
    const r = await fetch(rest(`ad_stats?campaign_id=in.(${ids.map((i) => `"${i}"`).join(',')})`), { headers: head() });
    return Object.fromEntries((await r.json()).map((x: any) => [x.campaign_id, { views: x.views, clicks: x.clicks }]));
  } catch { return {}; }
}

// ---- Staff login and publishing ----
export const staffToken = () => { try { return JSON.parse(localStorage.getItem(SESSION) || 'null')?.access_token as string | undefined; } catch { return undefined; } };
/** The login token, renewed first when it's about to expire (Supabase tokens last one hour; the refresh token keeps staff signed in). */
export async function freshToken(): Promise<string | undefined> {
  let s: any = null;
  try { s = JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch { /* storage blocked */ }
  if (!s?.access_token) return undefined;
  if (!s.expires_at || s.expires_at * 1000 > Date.now() + 60_000 || !s.refresh_token) return s.access_token;
  const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: head(), body: JSON.stringify({ refresh_token: s.refresh_token }) }).catch(() => null);
  if (!r?.ok) return s.access_token;
  const next = await r.json();
  try { localStorage.setItem(SESSION, JSON.stringify(next)); } catch { /* storage blocked */ }
  return next.access_token;
}
export async function staffLogin(email: string, password: string): Promise<boolean> {
  const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, { method: 'POST', headers: head(), body: JSON.stringify({ email, password }) });
  if (!r.ok) return false;
  try { localStorage.setItem(SESSION, JSON.stringify(await r.json())); } catch { /* storage blocked */ }
  return true;
}
/** Name and role of the logged-in staff member (from the `staff` table), or null if they're not on the team. */
export async function staffProfile(): Promise<{ name: string; role: string } | null> {
  const token = await freshToken(); if (!token) return null;
  try {
    const r = await fetch(rest('staff?select=name,role'), { headers: head(token) });
    const row = (await r.json())[0];
    return row ? { name: row.name || 'Equipo', role: row.role } : null;
  } catch { return null; }
}
export const staffLogout = () => { try { localStorage.removeItem(SESSION); } catch { /* storage blocked */ } };

/** Uploads an ad image (data URL) to the public "anuncios" bucket and returns its public address. */
async function uploadImage(name: string, dataUrl: string, token: string) {
  const blob = await (await fetch(dataUrl)).blob();
  const base = BACKEND.url.replace(/\/$/, '');
  const r = await fetch(`${base}/storage/v1/object/anuncios/${name}`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${token}`, 'x-upsert': 'true', 'Content-Type': blob.type }, body: blob });
  if (!r.ok) throw new Error('upload');
  return `${base}/storage/v1/object/public/anuncios/${name}`;
}
/** Automatic publishing: approving an ad puts it live for every reader (no code, no rebuild). */
export async function publishCampaign(c: Campaign): Promise<boolean> {
  const token = await freshToken(); if (!hasBackend() || !token) return false;
  const creatives = await Promise.all(c.creatives.map(async (cr, i) => (/^data:/.test(cr.img) ? { ...cr, img: await uploadImage(`${c.id.toLowerCase()}-${cr.w}x${cr.h}-${i}.png`, cr.img, token) } : cr)));
  const row = { id: c.id, client: c.client, sizes: c.sizes, start_date: c.start, end_date: c.end, regions: c.regions ?? 'all', takeover: !!c.takeover, skin: c.skin ?? null,
    creatives, views: c.views ?? null, weight: c.weight ?? 1, status: 'active' };
  const r = await fetch(rest('ad_campaigns'), { method: 'POST', headers: { ...head(token), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(row) });
  return r.ok;
}
/** Every campaign (live, scheduled, paused or ended) with its views and clicks so far, for Ventas → Campañas. */
export type CampaignRow = { id: string; client: string; sizes: string[]; start: string; end: string; regions: string; takeover: boolean; views: number | null;
  status: 'active' | 'paused' | 'ended'; delivered: number; clicks: number; created: string };
export async function allCampaigns(): Promise<CampaignRow[] | null> {
  if (!hasBackend()) return null;
  try {
    const [c, s] = await Promise.all([fetch(rest('ad_campaigns?select=id,client,sizes,start_date,end_date,regions,takeover,views,status,created_at&order=start_date.desc'), { headers: head() }), fetch(rest('ad_stats?select=*'), { headers: head() })]);
    if (!c.ok) return null;
    const stats = new Map<string, { views: number; clicks: number }>((s.ok ? await s.json() : []).map((x: any) => [x.campaign_id, x]));
    return (await c.json()).map((x: any) => ({ id: x.id, client: x.client, sizes: x.sizes ?? [], start: x.start_date, end: x.end_date, regions: x.regions, takeover: !!x.takeover,
      views: x.views ?? null, status: x.status, delivered: stats.get(x.id)?.views ?? 0, clicks: stats.get(x.id)?.clicks ?? 0, created: x.created_at }));
  } catch { return null; }
}
/** Pause or end a campaign early (staff). */
export async function setCampaignStatus(id: string, status: 'active' | 'paused' | 'ended') {
  const token = await freshToken(); if (!hasBackend() || !token) return false;
  const r = await fetch(rest(`ad_campaigns?id=eq.${encodeURIComponent(id)}`), { method: 'PATCH', headers: head(token), body: JSON.stringify({ status }) });
  return r.ok;
}

// ---- Staff articles (panel → Escribir): drafts shared by the team; publishing goes through the "publicar" Edge Function ----
export type ArticleRow = { id: string; status: 'draft' | 'review' | 'scheduled' | 'published'; doc: any; slug: string | null; published_by: string | null; updated_at: string };
/** Articles this person may see (reporters: their own; editors and admins: everyone's). null = couldn't reach the database. */
export async function listArticles(): Promise<ArticleRow[] | null> {
  const token = await freshToken(); if (!token) return null;
  try {
    const r = await fetch(rest('articles?select=id,status,doc,slug,published_by,updated_at&order=updated_at.desc'), { headers: head(token) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
/** Saves an article (updates it, or creates it the first time). When it fails, lastSaveError says why (in Spanish). */
export let lastSaveError = '';
const why = async (r: Response) => {
  const e = await r.json().catch(() => ({})) as { message?: string; code?: string };
  if (r.status === 401 || /JWT/i.test(e.message ?? '')) return 'Tu sesión venció: sal del panel y vuelve a entrar.';
  if (e.code === '23505') return 'Esta noticia ya está guardada en el panel: búscala en la lista y ábrela desde ahí.';
  if (e.code === '42501' || r.status === 403) return 'Tu cuenta no tiene permiso para guardar esta noticia.';
  return `Error ${r.status}${e.message ? `: ${e.message}` : ''}`;
};
export async function putArticle(id: string, status: string, doc: unknown, slug?: string): Promise<boolean> {
  lastSaveError = '';
  const token = await freshToken(); if (!token) { lastSaveError = 'No has entrado al panel en esta dirección: sal y vuelve a entrar.'; return false; }
  const body = JSON.stringify({ status, doc, updated_at: new Date().toISOString() });
  try {
    const up = await fetch(rest(`articles?id=eq.${encodeURIComponent(id)}`), { method: 'PATCH', headers: { ...head(token), Prefer: 'return=representation' }, body });
    if (!up.ok) { lastSaveError = await why(up); return false; }
    if ((await up.json()).length) return true;
    // New row; `slug` links it to a story already on the site, so publishing updates that same file
    const add = await fetch(rest('articles'), { method: 'POST', headers: head(token), body: JSON.stringify({ id, status, doc, ...(slug ? { slug } : {}) }) });
    if (!add.ok) lastSaveError = await why(add);
    return add.ok;
  } catch { lastSaveError = 'No hay conexión.'; return false; }
}
// ---- Visitor numbers from Google Analytics (Edge Function "analitica"; supabase/functions/analitica) ----
export type Analytics = {
  days: number; now: number; at: string;
  totals: { users: number; views: number; sessions: number; avgSeconds: number; newUsers: number };
  series: { at: string; users: number; views: number }[];
  pages: { path: string; views: number; users: number }[];
  channels: { name: string; sessions: number }[];
  devices: { name: string; users: number }[];
  countries: { name: string; users: number }[];
};
const analyticsCache = new Map<string, Promise<Analytics | { error: string }>>();
/** Visits for the last `days` (1, 7 or 28) and the `top` most-viewed pages. Shared by the Analítica tab and Escribir. */
export function getAnalytics(days: 1 | 7 | 28, top = 20, fresh = false): Promise<Analytics | { error: string }> {
  const key = `${days}:${top}`;
  if (!fresh && analyticsCache.has(key)) return analyticsCache.get(key)!;
  const p = (async () => {
    const token = await freshToken(); if (!token) return { error: 'Tu sesión venció. Sal y vuelve a entrar al panel.' };
    try {
      const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/functions/v1/analitica`, { method: 'POST', headers: head(token), body: JSON.stringify({ days, top }) });
      if (r.status === 404) return { error: 'Falta instalar la función "analitica" en Supabase.' };
      const out = await r.json().catch(() => ({}));
      return r.ok ? out : { error: out.error || `Error ${r.status}` };
    } catch { return { error: 'No hay conexión con el servidor. Intenta otra vez.' }; }
  })();
  analyticsCache.set(key, p); p.then((x) => { if ('error' in x) analyticsCache.delete(key); });
  return p;
}

/** Redes sociales: asks the Edge Function "redes" to post a story to Instagram and/or Facebook, now or at `due`.
 *  Returns a note for the editor (e.g. accounts not connected yet) or an error. */
export async function queueSocial(p: { id: string; slug: string; due: string; ig?: { image: string; caption: string }; fb?: { message: string; link: string } }): Promise<{ note?: string; error?: string }> {
  if (!p.ig && !p.fb) return {};
  const token = await freshToken(); if (!token) return { error: 'Tu sesión venció. Sal y vuelve a entrar al panel.' };
  try {
    const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/functions/v1/redes`, { method: 'POST', headers: head(token), body: JSON.stringify({ action: 'queue', ...p }) });
    if (r.status === 404) return { error: 'Falta instalar la función "redes" en Supabase.' };
    const out = await r.json().catch(() => ({}));
    return r.ok ? { note: out.note } : { error: out.error || `Error ${r.status}` };
  } catch { return { error: 'No hay conexión con el servidor.' }; }
}

/** Notes a failed publish, schedule or take-down for Salud del sitio (supabase/salud.sql). Never blocks the panel. */
export async function logPanelError(who: string, what: string, detail: string): Promise<void> {
  await staffApi('panel_errors', { method: 'POST', body: JSON.stringify({ who: who.slice(0, 60), what: what.slice(0, 200), detail: detail.slice(0, 500) }) }).catch(() => null);
}
export async function deleteArticle(id: string): Promise<boolean> {
  const token = await freshToken(); if (!token) return false;
  const r = await fetch(rest(`articles?id=eq.${encodeURIComponent(id)}`), { method: 'DELETE', headers: head(token) }).catch(() => null);
  return !!r?.ok;
}
/** Uploads a photo or PDF (data URL or file) to the public "noticias" bucket and returns its address, or null. */
export async function uploadStoryFile(name: string, data: string | Blob): Promise<string | null> {
  const token = await freshToken(); if (!token) return null;
  const blob = typeof data === 'string' ? await (await fetch(data)).blob() : data;
  const base = BACKEND.url.replace(/\/$/, '');
  // Names are unique (timestamped), so no overwrite ("x-upsert"), which would also need read permission on storage
  const r = await fetch(`${base}/storage/v1/object/noticias/${name}`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }).catch(() => null);
  return r?.ok ? `${base}/storage/v1/object/public/noticias/${name}` : null;
}
/** Publishes (or schedules) an article: the Edge Function saves the story file in GitHub and the site rebuilds in about 2 minutes. */
export async function publishArticle(a: { id: string; slug: string; file: string; title: string; scheduled: boolean }): Promise<{ ok?: boolean; slug?: string; error?: string }> {
  const token = await freshToken(); if (!token) return { error: 'Tu sesión venció. Sal y vuelve a entrar al panel.' };
  try {
    const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/functions/v1/publicar`, { method: 'POST', headers: head(token), body: JSON.stringify(a) });
    const out = await r.json().catch(() => ({}));
    if (r.status === 404) return { error: 'Falta instalar la función "publicar" en Supabase.' };
    return r.ok ? out : { error: out.error || out.message || `Error ${r.status}` };
  } catch { return { error: 'No hay conexión. Intenta otra vez.' }; }
}

/** Staff request to any table (the newsroom's comment queue): uses the staff login, renewed as needed. */
export async function staffApi(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = await freshToken(); if (!hasBackend() || !token) return null;
  return fetch(rest(path), { ...init, headers: { ...head(token), ...(init.headers || {}) } }).catch(() => null);
}

// ---- The staff team (panel → Equipo); supabase/connect-all.sql: staff_list, staff_add ----
export type Member = { id: string; name: string; mail: string; role: string };
/** The team from the database, also kept in 'nc-staff-team' so the tasks board can assign to them. null = couldn't load. */
export async function syncTeam(): Promise<Member[] | null> {
  const r = await staffApi('rpc/staff_list', { method: 'POST', body: '{}' });
  if (!r?.ok) return null;
  const team: Member[] = (await r.json()).map((m: any) => ({ id: m.user_id, name: m.name || m.username || 'Equipo', mail: m.email || (m.username ? `@${m.username}` : ''), role: m.role }));
  try { localStorage.setItem('nc-staff-team', JSON.stringify(team)); } catch { /* storage blocked */ }
  return team;
}
/** Admin: gives a role to someone who already has an account (by @username or email). Returns 'ok' or a reason. */
export async function addToTeam(handle: string, name: string, role: string): Promise<string> {
  const r = await staffApi('rpc/staff_add', { method: 'POST', body: JSON.stringify({ handle, display: name, new_role: role }) });
  return r?.ok ? await r.json() : 'No se pudo. Revisa tu conexión.';
}
/** Admin: takes someone out of the team (they keep their reader account). */
export async function removeFromTeam(id: string): Promise<boolean> {
  const r = await staffApi(`staff?user_id=eq.${id}`, { method: 'DELETE' });
  return !!r?.ok;
}
