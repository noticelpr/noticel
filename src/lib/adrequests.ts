// Ad requests: what a client sends from the Anúnciate page, and what the team reviews in the panel (Anuncios).
// With Supabase connected (src/lib/backend.ts) requests go to the `ad_requests` table and their images to the
// "solicitudes" bucket (supabase/connect-all.sql), so they reach the whole team from any device, even before online
// payments are set up. Without it, this is a PREVIEW kept in this browser (localStorage 'nc-ad-requests').
import { REQUESTS } from './ads';
import { BACKEND, hasBackend, staffApi, freshToken } from './backend';
import { serverSays } from './moderation';
import { sourceFields } from './source';

export type ArtFile = { name: string; w: number; h: number; data: string };
export type AdRequest = {
  id: string; created: string;
  status: 'revisar' | 'disenar' | 'cambios' | 'aprobada' | 'rechazada';
  paid: boolean;
  client: { name: string; business: string; email: string; phone: string; who: string; lang?: 'es' | 'en' }; // lang 'en': ordered from /en/advertise/ (emails and panel in English)
  formats: string[]; where: string; start: string; duration: string; total: number; lines: string[];
  views?: number; // paid views (display ads): the campaign ends when they are delivered
  takeoverViews?: number; // takeover bought by views: it owns every ad space until these are delivered
  art: { mode: 'upload' | 'design'; files: ArtFile[]; logo?: string; title?: string; msg?: string; cta?: string; theme?: string; notes?: string };
  link: string; note?: string;
};

const KEY = 'nc-ad-requests';
export const isPreview = () => !REQUESTS.url && !hasBackend();
export const sharedRequests = hasBackend;

// The team's list: kept in memory once loaded from the database (loadRequests), or read from this browser
let cache: AdRequest[] | null = null;
export function listRequests(): AdRequest[] {
  if (hasBackend() && cache) return cache;
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function store(list: AdRequest[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } // full or blocked
}
type Row = { id: string; created_at: string; status: AdRequest['status']; paid: boolean; client: AdRequest['client']; formats: string[]; placement: string | null;
  start: string | null; duration: string | null; total: number; lines: string[]; views: number | null; art: AdRequest['art']; link: string | null; note: string | null };
const fromRow = (r: Row): AdRequest => ({ id: r.id, created: r.created_at, status: r.status, paid: r.paid, client: r.client, formats: r.formats, where: r.placement ?? '',
  start: r.start ?? '', duration: r.duration ?? '', total: Number(r.total), lines: r.lines, views: r.views ?? undefined, art: r.art, link: r.link ?? '', note: r.note ?? undefined });

/** Staff: brings the team's requests from the database (staff login). */
export async function loadRequests(): Promise<AdRequest[]> {
  if (!hasBackend()) return listRequests();
  const r = await staffApi('ad_requests?select=*&order=created_at.desc&limit=200');
  if (r?.ok) cache = ((await r.json()) as Row[]).map(fromRow);
  return cache ?? [];
}

const base = () => BACKEND.url.replace(/\/$/, '');
/** Sends to the database through noticel.com/sb/… first (cloudflare/password-gate.js relays it), because ad
 *  blockers on phones block the database's own address; if the relay isn't there, straight to the database. */
async function relayFetch(path: string, init: RequestInit): Promise<Response> {
  if (location.hostname.endsWith('noticel.com')) {
    const r = await fetch(`${location.origin}/sb${path}`, init).catch(() => null);
    if (r && r.status !== 404 && r.status !== 405) return r;
  }
  return fetch(`${base()}${path}`, init);
}
/** An image the client chose (data URL) → uploaded to the "solicitudes" bucket; returns its address. */
async function uploadArt(reqId: string, name: string, data: string): Promise<string> {
  if (!data.startsWith('data:')) return data;
  // Decoded by hand: some phone browsers (Safari on iPhone) fail on fetch() of a long data: address
  const [head, b64 = ''] = data.split(',');
  const type = head.match(/^data:([^;]+)/)?.[1] || 'image/png';
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (!bytes.length) throw new Error('No se pudo preparar la imagen del anuncio (vacía). Intenta otra vez.');
  const blob = new Blob([bytes], { type });
  // A plain file name: ad blockers (Brave Shields, etc.) block addresses with ad sizes like "300x250" or "728x90" in
  // them, so the size isn't in the name (it's kept in the request's data)
  const ext = type === 'image/jpeg' ? 'jpg' : type.split('/')[1] || 'png';
  const path = `${reqId.toLowerCase().replace(/^nc-/, 'r-')}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const r = await relayFetch(`/storage/v1/object/solicitudes/${path}`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${BACKEND.anonKey}`, 'Content-Type': blob.type || 'image/png' }, body: blob });
  if (!r.ok) throw new Error(`No se pudo subir la imagen (${r.status}${await r.text().then((t) => (t ? `: ${t.slice(0, 120)}` : '')).catch(() => '')}).`);
  return `${base()}/storage/v1/object/public/solicitudes/${path}`;
}

/** Saves a new request (anyone can send one; only the team can read them). A string is the server's reason for saying no. */
export async function saveRequest(r: AdRequest, userToken?: string): Promise<boolean | string> {
  if (!hasBackend()) return store([r, ...listRequests()].slice(0, 20));
  let step = 'preparar';
  try {
    // One image at a time, so an error says which step failed
    const files: typeof r.art.files = [];
    for (const [i, f] of r.art.files.entries()) { step = `subir la imagen ${i + 1} de ${r.art.files.length}`; files.push({ ...f, data: await uploadArt(r.id, f.name, f.data) }); }
    step = 'subir el logo';
    const logo = r.art.logo ? await uploadArt(r.id, 'logo.png', r.art.logo) : undefined;
    step = 'guardar la solicitud';
    const row = { id: r.id, status: r.status, paid: false, client: { ...sourceFields(), ...r.client }, formats: r.formats, placement: r.where, start: r.start, duration: r.duration,
      total: r.total, lines: r.lines, views: r.views ?? null, art: { ...r.art, files, ...(logo ? { logo } : {}) }, link: r.link || null };
    // The client's own sign-in when they claim the first-time discount (the database checks it: supabase/primera-vez.sql)
    const head = { apikey: BACKEND.anonKey, Authorization: `Bearer ${userToken || BACKEND.anonKey}`, 'Content-Type': 'application/json' };
    // Through enviar_solicitud() (supabase/enviar-solicitud.sql): ad blockers block addresses with "ad_" in them.
    // Until that function exists (404), the table's own address is used as before.
    let res = await relayFetch('/rest/v1/rpc/enviar_solicitud', { method: 'POST', headers: head, body: JSON.stringify({ r: row }) }).catch(() => null);
    if (!res || res.status === 404) res = await relayFetch('/rest/v1/ad_requests', { method: 'POST', headers: { ...head, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    if (res.ok) { kickEmails(); return true; } // "Recibimos tu solicitud" + a heads-up to the team
    // Say exactly what the server answered, so a failed request can be fixed (not just "check your connection")
    const body = await res.clone().json().catch(() => ({})) as { code?: string; message?: string; details?: string };
    return (await serverSays(res, '')) || `No se pudo guardar la solicitud (${res.status}${body.code ? ` · ${body.code}` : ''}${body.message ? `: ${body.message}` : ''}).`;
  } catch (e) {
    const m = (e as Error)?.message || String(e);
    if (m.startsWith('No se pudo')) return m;
    // The browser itself stopped the connection: usually an ad blocker (Brave Shields, AdGuard…) or no internet
    if ((e as Error)?.name === 'TypeError') return `No pudimos enviar tu solicitud: parece que un bloqueador de anuncios o tu conexión la detuvo (al ${step}). Pausa el bloqueador solo para noticel.com e intenta otra vez, o usa “Prefiero hablar con alguien” más abajo.`;
    return `No se pudo enviar la solicitud al ${step} (${(e as Error)?.name || 'Error'}: ${m.slice(0, 140)}). Intenta otra vez.`;
  }
}
/** Asks the "correos" Edge Function to send any emails that are now due (supabase/functions/correos). It decides
 *  by itself from the database and never sends one twice; it also runs every 10 minutes, so a blocked call is fine. */
export function kickEmails(delayMs = 0) {
  if (!hasBackend()) return;
  setTimeout(() => { void fetch(`${base()}/functions/v1/correos`, { method: 'POST', keepalive: true, headers: { Authorization: `Bearer ${BACKEND.anonKey}`, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); }, delayMs);
}
/** Changes the panel's copy only (the database already has it, e.g. the refund line the "pagos" function wrote). */
export function updateRequestLocal(id: string, patch: Partial<AdRequest>) {
  if (cache) cache = cache.map((r) => (r.id === id ? { ...r, ...patch } : r));
}
/** Team changes a request (status, note). */
export function updateRequest(id: string, patch: Partial<AdRequest>) {
  if (!hasBackend()) { store(listRequests().map((r) => (r.id === id ? { ...r, ...patch } : r))); return; }
  if (cache) cache = cache.map((r) => (r.id === id ? { ...r, ...patch } : r));
  const { where, ...rest } = patch;
  void staffApi(`ad_requests?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...rest, ...(where !== undefined ? { placement: where } : {}) }) })
    .then(() => { if (patch.status) kickEmails(4000); }); // approved / changes / rejected: email the client (after the campaign is published)
}
/** Admin only: deletes requests for good (the database also only lets the admin delete). A campaign already on the
 *  site isn't affected: approving copied it to the campaigns. Returns false if it couldn't. */
export async function deleteRequests(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  if (!hasBackend()) return store(listRequests().filter((r) => !ids.includes(r.id)));
  const r = await staffApi(`ad_requests?id=in.(${ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  if (!r?.ok) return false;
  const gone: Array<{ id: string }> = await r.json().catch(() => []);
  if (cache) cache = cache.filter((x) => !gone.some((g) => g.id === x.id));
  return gone.length === ids.length;
}
/** The client's page, after paying online: marks the request paid (the team still checks the payment). */
export async function markPaid(id: string) {
  if (!hasBackend()) { updateRequest(id, { paid: true }); return; }
  await fetch(`${base()}/rest/v1/rpc/mark_request_paid`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${BACKEND.anonKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rid: id }) }).catch(() => {});
}

/** "Rechazar y reembolsar" (user, 2026-11-07): the "pagos" Edge Function refunds a card payment in full in Stripe
 *  (and cancels a monthly subscription). ATH Móvil and other payments come back as `manual`: the team does those. */
export async function refundRequest(id: string): Promise<{ ok?: boolean; refunded?: number; manual?: boolean; unpaid?: boolean; already?: boolean; error?: string }> {
  if (!hasBackend()) return { ok: true, manual: true };
  const token = await freshToken(); if (!token) return { error: 'Tu sesión venció. Entra otra vez.' };
  const r = await fetch(`${base()}/functions/v1/pagos`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reembolsar', id }) }).catch(() => null);
  if (!r) return { error: 'No hubo conexión.' };
  return r.json().catch(() => ({ error: `Error ${r.status}` }));
}

/** Opens Stripe's payment page for a saved request (Edge Function "pagos": the amount comes from the database).
 *  Returns the page's address, or the reason it couldn't open. */
export async function cardPayment(id: string): Promise<{ url?: string; error?: string }> {
  const r = await relayFetch('/functions/v1/pagos', { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${BACKEND.anonKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'checkout', id }) }).catch(() => null);
  if (!r) return { error: '' };
  return r.json().catch(() => ({ error: '' }));
}

/** Shrinks an image to at most `max` px and returns it as a data URL (keeps preview storage small). */
export function shrink(img: HTMLImageElement, max = 900, type = 'image/png'): string {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.85);
}

/** "Prefiero hablar con alguien" (Anúnciate): the visitor's message goes to the panel's Ventas as a new client, marked to
 *  follow up today (supabase/ventas-formulario.sql lets visitors add it, never read the list). Returns true or an error. */
export async function sendContact(c: { name: string; business: string; email: string; phone: string; message: string }): Promise<boolean | string> {
  if (!hasBackend()) return 'preview';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' });
  const id = `web-${Date.now().toString(36)}`;
  const data = {
    id, created: Date.now(), business: c.business.slice(0, 120), contact: c.name.slice(0, 120), phone: c.phone.slice(0, 40), email: c.email.slice(0, 160),
    who: 'retail', channel: 'Formulario web', fmt: [], start: '', end: '', days: 0, aud: 'all', reg: [], design: false, prepay: false, founder: false,
    requests: c.message.slice(0, 2000), budget: '', follow: today, stage: 'new', extra: 0, extraAmt: 0, custom: [], ...sourceFields(), // Instagram, Facebook… (src/lib/source.ts)
    notes: c.message ? [{ at: Date.now(), text: `Mensaje del formulario: ${c.message.slice(0, 2000)}` }] : [], total: 0,
  };
  try {
    const res = await relayFetch('/rest/v1/sales_leads', { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${BACKEND.anonKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }) });
    if (res.ok) kickEmails();
    return res.ok || (await serverSays(res, '')) || false;
  } catch { return false; }
}
