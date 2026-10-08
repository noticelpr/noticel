// NotiCel's columnists (src/data/columnistas.json: the authors of the Opiniones stories in the WordPress export) with a URL slug, and helpers to match columns to their writer.
// A column is a story with section: opinion whose `author` is the columnist's name.
import data from '../data/columnistas.json';
import type { Story } from './site';

export type Columnist = { name: string; role?: string; bio?: string; photo?: string; demo?: boolean; slug: string };

export const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const COLUMNISTS: Columnist[] = (data as Omit<Columnist, 'slug'>[]).map((c) => ({ ...c, slug: slugify(c.name) }));
export const columnistOf = (author: string) => COLUMNISTS.find((c) => c.name === author);
export const columnsBy = (stories: Story[], c: Columnist) => stories.filter((s) => s.data.section === 'opiniones' && s.data.author === c.name);
export const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
