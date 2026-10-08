// Ad requests: what a client sends from the Anúnciate page, and what the team reviews in the panel (Anuncios).
// With Supabase connected (src/lib/backend.ts) requests go to the `ad_requests` table and their images to the
// "solicitudes" bucket (supabase/connect-all.sql), so they reach the whole team from any device, even before online
// payments are set up. Without it, this is a PREVIEW kept in this browser (localStorage 'nc-ad-requests').
import { REQUESTS } from './ads';
import { BACKEND, hasBackend, staffApi } from './backend';
import { serverSays } from './moderation';

export type ArtFile = { name: string; w: number; h: number; data: string };
export type AdRequest = {
  id: string; created: string;
  status: 'revisar' | 'disenar' | 'cambios' | 'aprobada' | 'rechazada';
  paid: boolean;
  client: { name: string; business: string; email: string; phone: string; who: string };
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
/** An image the client chose (data URL) → uploaded to the "solicitudes" bucket; returns its address. */
async function uploadArt(reqId: string, name: string, data: string): Promise<string> {
  if (!data.startsWith('data:')) return data;
  const blob = await (await fetch(data)).blob();
  const path = `${reqId.toLowerCase()}/${Date.now().toString(36)}-${name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`;
  const r = await fetch(`${base()}/storage/v1/object/solicitudes/${path}`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${BACKEND.anonKey}`, 'Content-Type': blob.type || 'image/png' }, body: blob });
  if (!r.ok) throw new Error('upload');
  return `${base()}/storage/v1/object/public/solicitudes/${path}`;
}

/** Saves a new request (anyone can send one; only the team can read them). A string is the server's reason for saying no. */
export async function saveRequest(r: AdRequest): Promise<boolean | string> {
  if (!hasBackend()) return store([r, ...listRequests()].slice(0, 20));
  try {
    const files = await Promise.all(r.art.files.map(async (f) => ({ ...f, data: await uploadArt(r.id, f.name, f.data) })));
    const logo = r.art.logo ? await uploadArt(r.id, 'logo.png', r.art.logo) : undefined;
    const row = { id: r.id, status: r.status, paid: false, client: r.client, formats: r.formats, placement: r.where, start: r.start, duration: r.duration,
      total: r.total, lines: r.lines, views: r.views ?? null, art: { ...r.art, files, ...(logo ? { logo } : {}) }, link: r.link || null };
    const res = await fetch(`${base()}/rest/v1/ad_requests`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${BACKEND.anonKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    return res.ok || (await serverSays(res, '')) || false;
  } catch { return false; }
}
/** Team changes a request (status, note). */
export function updateRequest(id: string, patch: Partial<AdRequest>) {
  if (!hasBackend()) { store(listRequests().map((r) => (r.id === id ? { ...r, ...patch } : r))); return; }
  if (cache) cache = cache.map((r) => (r.id === id ? { ...r, ...patch } : r));
  const { where, ...rest } = patch;
  void staffApi(`ad_requests?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...rest, ...(where !== undefined ? { placement: where } : {}) }) });
}
/** The client's page, after paying online: marks the request paid (the team still checks the payment). */
export async function markPaid(id: string) {
  if (!hasBackend()) { updateRequest(id, { paid: true }); return; }
  await fetch(`${base()}/rest/v1/rpc/mark_request_paid`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${BACKEND.anonKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rid: id }) }).catch(() => {});
}

/** Shrinks an image to at most `max` px and returns it as a data URL (keeps preview storage small). */
export function shrink(img: HTMLImageElement, max = 900, type = 'image/png'): string {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.85);
}
