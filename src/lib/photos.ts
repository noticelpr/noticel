// Photo library (panel → Fotos, and "Elegir de la biblioteca" in Escribir). Two sources:
//   · Biblioteca: the team's photos, in the `photos` table (supabase/fotos.sql) with their files in storage.
//   · Publicadas: photos already used in stories on the site (/fotos-publicadas.json, made at build time).
// Where the files live is decided by STORAGE below. Today: the Supabase "noticias" bucket. To move to Cloudflare R2,
// Cloudinary or another service later, write another storage with the same two functions (put, remove); the
// table, the search and the screens stay the same.
import { BACKEND, freshToken, staffApi } from './backend';

export type Photo = {
  id?: string; src: string; thumb: string; width?: number | null; height?: number | null;
  caption: string; credit: string; credit_url?: string; place?: string; people?: string; tags?: string; taken_on?: string | null;
  storage?: string; path?: string | null; uploaded_by_name?: string | null; created_at?: string;
  // only for photos from published stories
  story?: string; storyUrl?: string; section?: string; date?: string;
};
export type Meta = Pick<Photo, 'caption' | 'credit' | 'credit_url' | 'place' | 'people' | 'tags' | 'taken_on'>;

// ---------- storage (swappable) ----------
type Storage = { name: string; put(path: string, blob: Blob): Promise<string | null>; remove(path: string): Promise<boolean> };
const base = () => BACKEND.url.replace(/\/$/, '');
const supabaseStorage: Storage = {
  name: 'supabase',
  async put(path, blob) {
    const token = await freshToken(); if (!token) return null;
    const r = await fetch(`${base()}/storage/v1/object/noticias/${path}`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': blob.type }, body: blob }).catch(() => null);
    return r?.ok ? `${base()}/storage/v1/object/public/noticias/${path}` : null;
  },
  async remove(path) {
    const token = await freshToken(); if (!token) return false;
    const r = await fetch(`${base()}/storage/v1/object/noticias`, { method: 'DELETE', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path, path.replace(/\.jpg$/, '-t.jpg')] }) }).catch(() => null);
    return !!r?.ok;
  },
};
const STORAGE: Storage = supabaseStorage;

// ---------- search ----------
/** Lowercase, no accents: the same shape as the table's `search` column. */
export const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
export const PAGE = 48;
/** One page of the team's library, newest first; every word must appear (caption, credit, place, people or tags).
 *  null = the table isn't there yet (supabase/fotos.sql not run) or there's no connection. */
export async function searchLibrary(q: string, page = 0): Promise<{ rows: Photo[]; total: number } | null> {
  const words = plain(q).split(/\s+/).filter((w) => w.length > 1).slice(0, 6).map((w) => w.replace(/[(),*%]/g, ''));
  const filter = words.length ? `&and=(${words.map((w) => `search.ilike.*${encodeURIComponent(w)}*`).join(',')})` : '';
  const r = await staffApi(`photos?select=*${filter}&order=created_at.desc&limit=${PAGE}&offset=${page * PAGE}`, { headers: { Prefer: 'count=exact' } });
  if (!r?.ok) return null;
  const total = Number(r.headers.get('content-range')?.split('/')[1]) || 0;
  return { rows: await r.json(), total };
}
let published: Photo[] | null = null;
/** Photos from published stories that match the words (all of them, small list). */
export async function searchPublished(q: string): Promise<Photo[]> {
  published ??= await fetch(`${document.body.dataset.base ?? '/'}fotos-publicadas.json`.replace(/\/\//g, '/')).then((r) => r.json())
    .then((l: Photo[]) => l.map((p) => ({ ...p, thumb: p.src }))).catch(() => []);
  const words = plain(q).split(/\s+/).filter((w) => w.length > 1);
  return published!.filter((p) => { const t = plain(`${p.caption} ${p.credit} ${p.story} ${p.section}`); return words.every((w) => t.includes(w)); });
}

// ---------- adding photos ----------
/** A picture file → a web version (longest side 2000 px) and a thumbnail (480 px), both JPEG. */
async function versions(file: File) {
  const bmp = await createImageBitmap(file);
  const make = async (max: number, q: number) => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('jpeg'))), 'image/jpeg', q));
  };
  const out = { web: await make(2000, 0.85), thumb: await make(480, 0.78), width: Math.min(bmp.width, Math.round(bmp.width * Math.min(1, 2000 / Math.max(bmp.width, bmp.height)))), height: Math.min(bmp.height, Math.round(bmp.height * Math.min(1, 2000 / Math.max(bmp.width, bmp.height)))) };
  bmp.close(); return out;
}
/** Uploads one photo with its details. Returns the saved photo, or an error in Spanish. */
export async function addPhoto(file: File, meta: Meta, who: string): Promise<{ photo?: Photo; error?: string }> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) return { error: `${file.name}: no es una foto (JPG, PNG o WEBP).` };
  let v; try { v = await versions(file); } catch { return { error: `${file.name}: no pudimos leer esta foto. Prueba en JPG.` }; }
  const d = new Date(); const id = `${d.getTime().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const path = `biblioteca/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${id}.jpg`;
  const src = await STORAGE.put(path, v.web); if (!src) return { error: `${file.name}: no se pudo subir. Revisa la conexión.` };
  const thumb = await STORAGE.put(path.replace(/\.jpg$/, '-t.jpg'), v.thumb) ?? src;
  const row = { src, thumb, width: v.width, height: v.height, storage: STORAGE.name, path, uploaded_by_name: who, ...clean(meta) };
  const r = await staffApi('photos', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
  if (!r?.ok) { await STORAGE.remove(path); return { error: r?.status === 404 ? 'Falta crear la biblioteca en Supabase (supabase/fotos.sql).' : `${file.name}: no se pudo guardar en la biblioteca.` }; }
  return { photo: (await r.json())[0] };
}
const clean = (m: Meta) => ({ caption: (m.caption ?? '').trim().slice(0, 300), credit: (m.credit ?? '').trim().slice(0, 160), credit_url: (m.credit_url ?? '').trim().slice(0, 500),
  place: (m.place ?? '').trim().slice(0, 120), people: (m.people ?? '').trim().slice(0, 200), tags: (m.tags ?? '').trim().slice(0, 300), taken_on: m.taken_on || null });
export async function updatePhoto(id: string, meta: Meta): Promise<boolean> {
  const r = await staffApi(`photos?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(clean(meta)) });
  return !!r?.ok && (await r.json()).length > 0;
}
export async function deletePhoto(p: Photo): Promise<boolean> {
  const r = await staffApi(`photos?id=eq.${p.id}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  if (!r?.ok || !(await r.json()).length) return false;
  if (p.path && p.storage === STORAGE.name) await STORAGE.remove(p.path);
  return true;
}
