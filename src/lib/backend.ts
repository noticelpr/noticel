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
  // NotiCel's OWN Supabase project goes here once it exists (never NotiCel's: each site keeps its own accounts).
  // Empty = preview mode (VISTA PREVIA): the panel works on this device only.
  url: 'https://tadrjmankkictvqzuibu.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZHJqbWFua2tpY3R2cXp1aWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODU2MDEsImV4cCI6MjEwNzA2MTYwMX0.xzUXK192CWpDDU-OoWh8DEfxiL5vwXYvJ1AJ_JB6BzM',
};
// Demo mode (src/lib/demo.ts) works like the preview: sample data only, never the real database
export const hasBackend = () => !!(BACKEND.url && BACKEND.anonKey) && !isDemo();

const SESSION = 'nc-staff-session'; // staff login token (only when the backend exists)
const head = (token?: string) => ({ apikey: BACKEND.anonKey, Authorization: `Bearer ${token || BACKEND.anonKey}`, 'Content-Type': 'application/json' });
const rest = (path: string) => `${BACKEND.url.replace(/\/$/, '')}/rest/v1/${path}`;
export type LiveCampaign = Campaign & { delivered: number; today_views?: number }; // today_views: views today (supabase/vistas-justas.sql)

/** Campaigns running right now for every reader (dates current and paid views not yet delivered). */
export async function liveCampaigns(): Promise<LiveCampaign[]> {
  if (!hasBackend()) return [];
  try {
    const r = await fetch(rest('ad_campaigns_live?select=*'), { headers: head() });
    if (!r.ok) return [];
    return (await r.json()).map((c: any) => ({ ...c, end: c.end_date, start: c.start_date, delivered: c.delivered ?? 0 }));
  } catch { return []; }
}
/** What Anúnciate and Ventas need for fair share: story reads in the last 30 days and the campaigns booked from today on
 *  (supabase/vistas-justas.sql). Null when it can't be read (no backend, SQL not run yet). */
export type AdInventory = { reads30: number; busy: Array<{ id: string; sizes: string[]; start: string; end: string; takeover: boolean }> };
export async function adInventory(): Promise<AdInventory | null> {
  if (!hasBackend()) return null;
  try {
    const r = await fetch(rest('rpc/ad_inventario'), { method: 'POST', headers: head(), body: '{}' });
    if (!r.ok) return null;
    const j = await r.json();
    return { reads30: Number(j.reads30) || 0, busy: (j.busy ?? []).map((b: any) => ({ id: b.id, sizes: b.sizes ?? [], start: b.start_date, end: b.end_date, takeover: !!b.takeover })) };
  } catch { return null; }
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
  try {
    localStorage.setItem(SESSION, JSON.stringify(next));
    // The site may be using this same sign-in (lib/account.ts adoptPanel): keep it renewed too
    const site = JSON.parse(localStorage.getItem('nc-session') || 'null');
    if (site?.refresh_token && site.refresh_token === s.refresh_token) localStorage.setItem('nc-session', JSON.stringify(next));
  } catch { /* storage blocked */ }
  return next.access_token;
}
export async function staffLogin(email: string, password: string): Promise<boolean> {
  const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, { method: 'POST', headers: head(), body: JSON.stringify({ email, password }) });
  if (!r.ok) return false;
  try { localStorage.setItem(SESSION, JSON.stringify(await r.json())); } catch { /* storage blocked */ }
  return true;
}
/** Name and role of the logged-in staff member (from the `staff` table), or null if they're not on the team. */
export async function staffProfile(): Promise<{ name: string; role: string; canPhotos?: boolean } | null> {
  const token = await freshToken(); if (!token) return null;
  try {
    // my_staff (supabase/fotos-v2.sql) also says whether a reporter may upload photos; older setups: the staff row
    const m = await fetch(rest('rpc/my_staff'), { method: 'POST', headers: head(token), body: '{}' });
    if (m.ok) { const row = (await m.json())[0]; return row ? { name: row.name || 'Equipo', role: row.role, canPhotos: !!row.can_upload_photos } : null; }
    // Only this person's own row (every team member may read the whole team list)
    const id = tokenInfo(token).id; if (!id) return null;
    const r = await fetch(rest(`staff?select=name,role&user_id=eq.${id}`), { headers: head(token) });
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
/** Uploads one ad image for an order that waits for approval ("Anuncio vendido" by a salesperson). Its address, or null. */
export async function uploadAdImage(name: string, dataUrl: string): Promise<string | null> {
  const token = await freshToken(); if (!hasBackend() || !token) return null;
  try { return await uploadImage(name, dataUrl, token); } catch { return null; }
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
  status: 'active' | 'paused' | 'ended'; delivered: number; clicks: number; created: string;
  creatives?: Array<{ img: string; w?: number; h?: number; video?: string }> }; // the ad's images, for the preview in Campañas en el aire
export async function allCampaigns(): Promise<CampaignRow[] | null> {
  if (!hasBackend()) return null;
  try {
    const [c, s] = await Promise.all([fetch(rest('ad_campaigns?select=id,client,sizes,start_date,end_date,regions,takeover,views,status,created_at,creatives&order=start_date.desc'), { headers: head() }), fetch(rest('ad_stats?select=*'), { headers: head() })]);
    if (!c.ok) return null;
    const stats = new Map<string, { views: number; clicks: number }>((s.ok ? await s.json() : []).map((x: any) => [x.campaign_id, x]));
    return (await c.json()).map((x: any) => ({ id: x.id, client: x.client, sizes: x.sizes ?? [], start: x.start_date, end: x.end_date, regions: x.regions, takeover: !!x.takeover,
      views: x.views ?? null, status: x.status, delivered: stats.get(x.id)?.views ?? 0, clicks: stats.get(x.id)?.clicks ?? 0, created: x.created_at, creatives: x.creatives ?? [] }));
  } catch { return null; }
}
/** Pause or end a campaign early (staff). */
export async function setCampaignStatus(id: string, status: 'active' | 'paused' | 'ended') {
  const token = await freshToken(); if (!hasBackend() || !token) return false;
  const r = await fetch(rest(`ad_campaigns?id=eq.${encodeURIComponent(id)}`), { method: 'PATCH', headers: head(token), body: JSON.stringify({ status }) });
  return r.ok;
}

/** Admin only: deletes ended campaigns for good, with their counts (supabase/borrar-campanas.sql). */
export async function deleteCampaigns(ids: string[]): Promise<boolean> {
  const token = await freshToken(); if (!hasBackend() || !token || !ids.length) return false;
  const r = await fetch(rest(`ad_campaigns?id=in.(${ids.map((i) => `"${encodeURIComponent(i)}"`).join(',')})&status=eq.ended`), { method: 'DELETE', headers: { ...head(token), Prefer: 'return=representation' } });
  return r.ok && (await r.json()).length === ids.length;
}
/** Start a scheduled campaign today instead of on its date (staff): e.g. the client paid and wants to start now. */
export async function startCampaignToday(id: string) {
  const token = await freshToken(); if (!hasBackend() || !token) return false;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' });
  const r = await fetch(rest(`ad_campaigns?id=eq.${encodeURIComponent(id)}`), { method: 'PATCH', headers: head(token), body: JSON.stringify({ start_date: today, status: 'active' }) });
  return r.ok;
}

// ---- Staff articles (panel → Escribir): drafts shared by the team; publishing goes through the "publicar" Edge Function ----
export type ArticleRow = { id: string; status: 'draft' | 'review' | 'scheduled' | 'published'; doc: any; slug: string | null; published_by: string | null; updated_at: string; owner?: string | null };
/** Articles this person may see (reporters: their own; editors and admins: everyone's). null = couldn't reach the database. */
export async function listArticles(): Promise<ArticleRow[] | null> {
  const token = await freshToken(); if (!token) return null;
  try {
    const r = await fetch(rest('articles?select=id,status,doc,slug,published_by,updated_at,owner&order=updated_at.desc'), { headers: head(token) });
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

/** Files in a private storage folder (Documentos: "personal", supabase/memos-documentos.sql). Upload returns the path. */
export async function uploadPrivate(bucket: string, path: string, file: Blob): Promise<string | null> {
  const token = await freshToken(); if (!token) return null;
  const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': file.type || 'application/octet-stream' }, body: file }).catch(() => null);
  return r?.ok ? path : null;
}
/** Downloads a private file as the signed-in team member (it never has a public address). */
export async function downloadPrivate(bucket: string, path: string): Promise<Blob | null> {
  const token = await freshToken(); if (!token) return null;
  const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/storage/v1/object/authenticated/${bucket}/${path}`, { headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${token}` } }).catch(() => null);
  return r?.ok ? r.blob() : null;
}
export async function removePrivate(bucket: string, path: string): Promise<boolean> {
  const token = await freshToken(); if (!token) return false;
  const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/storage/v1/object/${bucket}/${path}`, { method: 'DELETE', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${token}` } }).catch(() => null);
  return !!r?.ok;
}

/** Panel → Ajustes: saves the site's details (administrator; Edge Function "publicar", action "settings"). */
export async function saveSettings(settings: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  const token = await freshToken(); if (!token) return { error: 'Tu sesión venció. Sal y vuelve a entrar al panel.' };
  try {
    const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/functions/v1/publicar`, { method: 'POST', headers: head(token), body: JSON.stringify({ action: 'settings', settings }) });
    const out = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { error: out.error || `Error ${r.status}` };
  } catch { return { error: 'No hay conexión. Intenta otra vez.' }; }
}

/** Registro de actividad (supabase/permisos-equipo.sql, activity_log): who did what in the panel. Never blocks the
 *  action: if it can't be written (no database, or the table isn't there yet), nothing happens. Only the admin reads it. */
export function logActivity(action: string, detail = ''): void {
  if (!hasBackend()) return;
  let who = ''; try { who = JSON.parse(localStorage.getItem('nc-staff') || '{}').name ?? ''; } catch { /* storage blocked */ }
  void staffApi('activity_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ who: who || 'Equipo', action: action.slice(0, 60), detail: detail.slice(0, 300) }) });
}

/** «Borrar para siempre» (administrator only, Edge Function "publicar"): the story leaves the site and the panel. */
export async function deleteStoryForever(slug: string, id?: string): Promise<{ ok?: boolean; error?: string }> {
  const token = await freshToken(); if (!token) return { error: 'Tu sesión venció. Sal y vuelve a entrar al panel.' };
  try {
    const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/functions/v1/publicar`, { method: 'POST', headers: head(token), body: JSON.stringify({ action: 'delete', slug, id }) });
    const out = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { error: out.error || `Error ${r.status}` };
  } catch { return { error: 'No hay conexión. Intenta otra vez.' }; }
}

/** The site's code on GitHub (private repository), read through the staff-only Edge Function "repo"
 *  (supabase/functions/repo): the automatic writer's waiting stories, open pull requests, or one story's file. */
export async function repoRead(what: 'pending' | 'pulls'): Promise<any[]>;
export async function repoRead(what: 'story', id: string): Promise<string | null>;
export async function repoRead(what: 'health'): Promise<{ dep: any; ai: any; prs: any[]; iss: any[]; sc: any } | null>;
export async function repoRead(what: 'pending' | 'pulls' | 'story' | 'health', id?: string): Promise<any> {
  const none = what === 'story' || what === 'health' ? null : [];
  const token = await freshToken(); if (!hasBackend() || !token) return none;
  try {
    const r = await fetch(`${BACKEND.url}/functions/v1/repo`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: BACKEND.anonKey, Authorization: `Bearer ${token}` }, body: JSON.stringify({ what, id }) }).catch(() => null);
    if (!r || r.status === 404) return none; // the "repo" function is missing (the code is private: GitHub can't be read directly)
    const d = r.ok ? await r.json() : {};
    if (what === 'health') return r.ok ? d : null;
    return what === 'story' ? d.text ?? null : Array.isArray(d.list) ? d.list : [];
  } catch { return none; }
}
/** Staff request to any table (the newsroom's comment queue): uses the staff login, renewed as needed. */
export async function staffApi(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = await freshToken(); if (!hasBackend() || !token) return null;
  return fetch(rest(path), { ...init, headers: { ...head(token), ...(init.headers || {}) } }).catch(() => null);
}

// ---- The staff team (panel → Equipo); supabase/connect-all.sql: staff_list, staff_add ----
export type Member = { id: string; name: string; mail: string; role: string; editor?: string; canPhotos?: boolean }; // canPhotos: a reporter allowed to upload photos (supabase/fotos-v2.sql); editor: a periodista's editor (supabase/editores.sql)
/** The team from the database, also kept in 'nc-staff-team' so the tasks board can assign to them. null = couldn't load. */
export async function syncTeam(): Promise<Member[] | null> {
  const r = await staffApi('rpc/staff_list', { method: 'POST', body: '{}' });
  if (!r?.ok) return null;
  const team: Member[] = (await r.json()).map((m: any) => ({ id: m.user_id, name: m.name || m.username || 'Equipo', mail: m.email || (m.username ? `@${m.username}` : ''), role: m.role, canPhotos: !!m.can_upload_photos, ...(m.editor_id ? { editor: m.editor_id } : {}) }));
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

// ---- Columnist profiles (panel → Columnistas); supabase/columnistas.sql: table "columnists", folder "columnistas" ----
export type ColumnistRow = {
  slug: string; name: string; role: string; bio?: string | null; photo?: string | null; email?: string | null;
  x?: string | null; instagram?: string | null; facebook?: string | null; website?: string | null; active: boolean; sort: number;
  kind?: 'columnista' | 'periodista'; owner?: string | null; // supabase/perfiles.sql
  videos?: string[] | null; // video links shown on the profile page (supabase/columnistas-noticel.sql)
};
/** The signed-in team member's own public profile (by their name as author), or null. */
export async function myProfile(name: string): Promise<ColumnistRow | null> {
  const r = await staffApi(`columnists?select=*&name=eq.${encodeURIComponent(name)}`);
  return r?.ok ? ((await r.json())[0] ?? null) : null;
}
/** Every profile, on and off (admins and editors). 'missing' = supabase/columnistas.sql hasn't been run yet. */
export async function listColumnists(): Promise<ColumnistRow[] | 'missing' | null> {
  const r = await staffApi('columnists?select=*&order=sort.asc,name.asc');
  if (!r) return null;
  if (r.status === 404 || r.status === 400) return 'missing';
  return r.ok ? r.json() : null;
}
/** Creates or updates a profile (by its slug). Returns an error message, or '' when it was saved. */
export async function saveColumnist(c: ColumnistRow): Promise<string> {
  const r = await staffApi('columnists?on_conflict=slug', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ ...c, updated_at: new Date().toISOString() }) });
  if (!r) return 'Tu sesión venció o no hay conexión. Sal y vuelve a entrar al panel.';
  if (r.ok) return '';
  return r.status === 401 || r.status === 403 ? 'Solo un administrador o editor puede cambiar columnistas.' : `No se pudo guardar (error ${r.status}).`;
}
/** Switches a profile on (shows on the site) or off (hidden). */
export async function setColumnistActive(slug: string, active: boolean): Promise<boolean> {
  const r = await staffApi(`columnists?slug=eq.${encodeURIComponent(slug)}`, { method: 'PATCH', body: JSON.stringify({ active, updated_at: new Date().toISOString() }) });
  return !!r?.ok;
}
/** Uploads a columnist's photo to the public "columnistas" folder and returns its address, or null. */
export async function uploadColumnistPhoto(name: string, file: Blob): Promise<string | null> {
  const token = await freshToken(); if (!token) return null;
  const base = BACKEND.url.replace(/\/$/, '');
  const r = await fetch(`${base}/storage/v1/object/columnistas/${name}`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': file.type || 'image/jpeg' }, body: file }).catch(() => null);
  return r?.ok ? `${base}/storage/v1/object/public/columnistas/${name}` : null;
}

/** Admin: lets a reporter upload photos to the library, or stops it (supabase/fotos-v2.sql). Returns 'ok' or a reason. */
export async function setTeamPhotos(id: string, allow: boolean): Promise<string> {
  const r = await staffApi('rpc/staff_set_photos', { method: 'POST', body: JSON.stringify({ member: id, allow }) });
  return r?.ok ? await r.json() : 'No se pudo. Revisa tu conexión.';
}

// ---- Staff account security (panel): two-step verification, invitations and passwords ----
// Every staff member signs in with password + a 6-digit code sent by email (Edge Function "codigo"). The database only
// gives staff powers to a sign-in that typed its code (supabase/seguridad.sql: sesion_verificada()).
const AUTH = () => `${BACKEND.url.replace(/\/$/, '')}/auth/v1`;
const saveSession = (s: unknown) => { try { localStorage.setItem(SESSION, JSON.stringify(s)); } catch { /* storage blocked */ } };
/** What the login token says: the email and the account id (and Supabase's own security level, unused now). */
export function tokenInfo(token = staffToken()): { aal: string; email: string; id: string } {
  try { const p = JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return { aal: p.aal ?? 'aal1', email: p.email ?? '', id: p.sub ?? '' }; } catch { return { aal: '', email: '', id: '' }; }
}
/** Is the signed-in account on the team? (yes/no, before the second step; supabase/seguridad.sql) */
export async function onTeam(): Promise<boolean> {
  const r = await staffApi('rpc/soy_equipo', { method: 'POST', body: '{}' });
  if (r?.status === 404) return !!(await staffProfile()); // before seguridad.sql: the old check
  return r?.ok ? (await r.json()) === true : false;
}
/** The sign-in's id (each sign-in gets its own code). */
const sessionId = () => { try { return JSON.parse(atob(String(staffToken()).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id ?? ''; } catch { return ''; } };
const VERIFIED = 'nc-staff-verified'; // { session, at }: this sign-in already typed its code (checked again by the database)
/** This sign-in typed its email code in the last 24 hours (remembered on this device; the database checks too). */
export function codeOk(): boolean {
  try { const v = JSON.parse(localStorage.getItem(VERIFIED) || 'null'); return !!v && v.session === sessionId() && Date.now() - v.at < 23.5 * 36e5; } catch { return false; }
}
const markOk = () => { try { localStorage.setItem(VERIFIED, JSON.stringify({ session: sessionId(), at: Date.now() })); } catch { /* storage blocked */ } };
/** Asks the database whether this sign-in is verified. 'off' = the email code isn't set up yet (seguridad.sql). */
export async function codeCheck(): Promise<boolean | 'off'> {
  const r = await staffApi('rpc/sesion_verificada', { method: 'POST', body: '{}' });
  if (r?.status === 404) return 'off';
  const ok = r?.ok ? (await r.json()) === true : false;
  if (ok) markOk();
  return ok;
}
const codeFn = async (action: 'send' | 'verify' | 'trust' | 'forget', extra: Record<string, unknown> = {}) => {
  const token = await freshToken(); if (!token) return { error: 'Tu sesión venció. Entra otra vez.' };
  const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/functions/v1/codigo`, { method: 'POST', headers: head(token), body: JSON.stringify({ action, ...extra }) }).catch(() => null);
  if (!r) return { error: 'No hay conexión.' };
  if (r.status === 404) return { error: 'Falta instalar la función «codigo» en Supabase.' };
  return r.json().catch(() => ({ error: `Error ${r.status}` }));
};
/** Emails a 6-digit code to the signed-in team member. Returns { ok, to } (the address, partly hidden) or { error }. */
export const codeSend = () => codeFn('send') as Promise<{ ok?: boolean; to?: string; error?: string }>;
/** Checks the code; on success this sign-in counts as verified. */
export async function codeVerify(code: string, remember = false): Promise<{ ok?: boolean; error?: string }> {
  const r = await codeFn('verify', { code, remember, label: deviceLabel() });
  if (r?.ok) markOk();
  if (r?.device) saveDevice(tokenInfo().id, r.device);
  return r;
}
// ---- "Recordar este dispositivo por 30 días" (Edge Function codigo, supabase/recordar.sql) ----
// The device's key stays on this device, one per account; the database keeps only its hash.
const deviceSlot = (userId: string) => `nc-device-${userId}`;
export const saveDevice = (userId: string, key: string) => { try { localStorage.setItem(deviceSlot(userId), key); } catch { /* storage blocked */ } };
export const deviceKey = (userId: string) => { try { return localStorage.getItem(deviceSlot(userId)) ?? ''; } catch { return ''; } };
export const dropDevice = (userId: string) => { try { localStorage.removeItem(deviceSlot(userId)); } catch { /* storage blocked */ } };
/** A short name for this device (shown nowhere yet; kept with the remembered device). */
export const deviceLabel = () => `${/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone/iPad' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.userAgent) ? 'Mac' : /Windows/.test(navigator.userAgent) ? 'Windows' : 'Otro'} · ${/Edg\//.test(navigator.userAgent) ? 'Edge' : /Chrome\//.test(navigator.userAgent) ? 'Chrome' : /Firefox\//.test(navigator.userAgent) ? 'Firefox' : 'Safari'}`;
/** This device was remembered: the sign-in counts as verified without a code. */
export async function codeTrust(): Promise<boolean> {
  const id = tokenInfo().id, key = deviceKey(id); if (!key) return false;
  const r = await codeFn('trust', { device: key });
  if (r?.ok) { markOk(); return true; }
  if (/recordado/.test(r?.error ?? '')) dropDevice(id); // expired or forgotten
  return false;
}
/** Forgets every remembered device of this account (and this one's key). */
export async function codeForget(): Promise<boolean> {
  const r = await codeFn('forget'); dropDevice(tokenInfo().id); return !!r?.ok;
}
/** Sets a new password for the signed-in person. Returns '' when done, or the reason it failed. */
export async function setPassword(password: string): Promise<string> {
  const token = await freshToken(); if (!token) return 'Tu sesión venció. Entra otra vez.';
  const r = await fetch(`${AUTH()}/user`, { method: 'PUT', headers: head(token), body: JSON.stringify({ password }) }).catch(() => null);
  if (r?.ok) return '';
  const e = await r?.json().catch(() => ({})) as { msg?: string; message?: string; error_description?: string } | undefined;
  const m = e?.msg || e?.message || e?.error_description || '';
  return /same|different/i.test(m) ? 'La contraseña nueva tiene que ser distinta a la anterior.' : /weak|short|least/i.test(m) ? 'Esa contraseña es muy débil: usa al menos 8 letras y números.' : 'No se pudo cambiar la contraseña. Intenta otra vez.';
}
/** Emails a link to choose a new password (panel login → "¿Olvidaste tu contraseña?"). */
export async function sendPasswordReset(email: string): Promise<boolean> {
  // Through "equipo", whose link survives the Cloudflare lock (see sessionFromLink); Supabase's own email if it's not there
  const f = await fetch(`${BACKEND.url.replace(/\/$/, '')}/functions/v1/equipo`, { method: 'POST', headers: head(), body: JSON.stringify({ action: 'forgot', email }) }).catch(() => null);
  if (f?.ok) return true;
  const r = await fetch(`${AUTH()}/recover?redirect_to=${encodeURIComponent(`${location.origin}/redaccion/`)}`, { method: 'POST', headers: head(), body: JSON.stringify({ email }) }).catch(() => null);
  return !!r?.ok;
}
/** An invitation or password link opened the panel: keeps that session, replacing whoever was signed in on this browser.
 *  Our links carry a one-time code after "?" (?token_hash=…&type=…, Edge Function "equipo"), because the Cloudflare lock
 *  drops what follows "#"; older Supabase links (#access_token=…&type=invite|recovery) still work. '' = no link,
 *  'expired' = the link was already used or ran out. */
export async function sessionFromLink(): Promise<'invite' | 'recovery' | 'expired' | ''> {
  const q = new URLSearchParams(location.search), p = new URLSearchParams(location.hash.slice(1));
  const hash = q.get('token_hash'), type = hash ? q.get('type') : p.get('type');
  if (!['invite', 'recovery', 'signup', 'magiclink'].includes(type ?? '')) return '';
  let s: Record<string, any> | null = null;
  if (hash) {
    const r = await fetch(`${AUTH()}/verify`, { method: 'POST', headers: head(), body: JSON.stringify({ type, token_hash: hash }) }).catch(() => null);
    s = r?.ok ? await r.json().catch(() => null) : null;
  } else if (p.get('access_token')) s = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in') };
  else return '';
  history.replaceState(null, '', location.pathname); // the one-time code leaves the address bar
  if (!s?.access_token) return 'expired';
  // A different person may have been signed in on this browser: forget their name, role, code and team list first
  ['nc-staff', 'nc-staff-team', 'nc-staff-pending', 'nc-sales-kpi', VERIFIED].forEach((k) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } });
  saveSession({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Math.floor(Date.now() / 1000) + Number(s.expires_in || 3600), token_type: 'bearer' });
  return type === 'recovery' && !q.get('bienvenida') ? 'recovery' : 'invite'; // bienvenida: an invitation sent as a password link
}
/** Admin tools for the team (Edge Function "equipo"): invite, password link, status. */
export async function teamAdmin(action: 'invite' | 'reset_password' | 'status' | 'sync_access', data: Record<string, unknown> = {}): Promise<any> {
  const token = await freshToken(); if (!token) return { error: 'Tu sesión venció. Sal y vuelve a entrar al panel.' };
  const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/functions/v1/equipo`, { method: 'POST', headers: head(token), body: JSON.stringify({ action, ...data }) }).catch(() => null);
  if (!r) return { error: 'No hay conexión.' };
  if (r.status === 404) return { error: 'Falta instalar la función "equipo" en Supabase.' };
  return r.json().catch(() => ({ error: `Error ${r.status}` }));
}
