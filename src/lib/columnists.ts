// NotiCel's columnists, with a URL slug, and helpers to match columns to their writer.
// A column is a story with section: opinion whose `author` is the columnist's name.
// Where the list comes from (2026-10-29): the "columnists" table in NotiCel's Supabase, which the staff edit in the
// panel (Columnistas tab, supabase/columnistas.sql). Only the profiles that are switched on come back, so a columnist
// turned off leaves the site at the next build. If the table isn't set up yet (or can't be reached while building),
// the site uses src/data/columnistas.json (the authors of the Opiniones stories in the WordPress export).
// Server/build only: never import this from a page's <script>.
import data from '../data/columnistas.json';
import { BACKEND } from './backend';
import type { Story } from './site';

export type Columnist = {
  name: string; role?: string; bio?: string; photo?: string; demo?: boolean; slug: string;
  email?: string; x?: string; instagram?: string; facebook?: string; website?: string;
};

export const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fromFile: Columnist[] = (data as Omit<Columnist, 'slug'>[]).map((c) => ({ ...c, slug: slugify(c.name) }));

async function fromDatabase(): Promise<Columnist[] | null> {
  if (!BACKEND.url || !BACKEND.anonKey) return null;
  try {
    const r = await fetch(`${BACKEND.url.replace(/\/$/, '')}/rest/v1/columnists?select=*&active=eq.true&order=sort.asc,name.asc`, {
      headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${BACKEND.anonKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null; // table not created yet: use the file
    const rows: Array<Record<string, string | null>> = await r.json();
    const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : undefined);
    return rows.map((c) => ({
      slug: c.slug!, name: c.name!, role: clean(c.role), bio: clean(c.bio), photo: clean(c.photo), email: clean(c.email),
      x: clean(c.x), instagram: clean(c.instagram), facebook: clean(c.facebook), website: clean(c.website),
    }));
  } catch { return null; }
}

export const COLUMNISTS: Columnist[] = (await fromDatabase()) ?? fromFile;
export const columnistOf = (author: string) => COLUMNISTS.find((c) => c.name === author);
export const columnsBy = (stories: Story[], c: Columnist) => stories.filter((s) => s.data.section === 'opiniones' && s.data.author === c.name);
export const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
/** A photo address for <img>: uploaded photos are full addresses; older ones are paths inside the site. */
export const photoSrc = (p: string, base = import.meta.env.BASE_URL) => (/^https?:\/\//.test(p) ? p : `${base.replace(/\/?$/, '/')}${p.replace(/^\//, '')}`);
