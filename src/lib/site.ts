import { getCollection, type CollectionEntry } from 'astro:content';
import categoryData from '../data/categories.json';

/* =========================================================
   SITE SETTINGS: edit these to change the whole site
   ========================================================= */
export const SITE = {
  name: 'NotiCel',
  tagline: 'La verdad como es',
  subtitle: 'Noticias de Puerto Rico',
  description: 'NotiCel: noticias de Puerto Rico. La verdad como es.',
  timeZone: 'America/Puerto_Rico',
  // Test copy (Cloudflare Pages, password page in functions/_middleware.js): every page asks search engines not to index it, so Google never sees a second copy
  // of NotiCel's stories. Set to false only on the day the new site replaces WordPress at noticel.com.
  testSite: true,
  // Set to true once an Anthropic API key is added for the automatic news writer (the panel's Salud tab reads it)
  aiKeyConnected: false,
};

/* NotiCel's categories, exactly as WordPress has them, so every old category address keeps working.
   src/data/categories.json: slug -> { name, path }. `path` is the full WordPress path under /category/
   (e.g. policiacas -> noticias/la-calle/policiacas), read from noticel.com on 2026-10-08. */
export const CATEGORY_INFO: Record<string, { name: string; path: string }> = categoryData;
export const CATEGORIES: Record<string, string> = Object.fromEntries(Object.entries(CATEGORY_INFO).map(([slug, c]) => [slug, c.name]));

// Main menu: the same one noticel.com has today
export const MENU = ['noticias', 'economia', 'opiniones', 'deportes', 'entretenimiento', 'vida-y-bienestar', 'el-tiempo'];

// Broad categories never shown as the small label over a headline (same rule as the WordPress theme)
const SKIP_KICKER = ['noticias', 'ultima-hora', 'uncategorized'];

/** Internal link that works if the site's base path ever changes (same helper as Noticias Xtra). */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.replace(/^\//, '');
  return clean ? `${base}/${clean}${clean.includes('.') || clean.endsWith('/') ? '' : '/'}` : `${base}/`;
}

/** Category page address, the same as WordPress: /category/deportes/beisbol/ */
export const categoryUrl = (slug: string) => url(`category/${CATEGORY_INFO[slug]?.path ?? slug}`);

/** Slugs of a category and all its subcategories (a WordPress category page also lists its subcategories' stories). */
export const withChildren = (slug: string) => {
  const path = CATEGORY_INFO[slug]?.path ?? slug;
  return Object.keys(CATEGORY_INFO).filter((s) => s === slug || CATEGORY_INFO[s].path.startsWith(`${path}/`));
};
/** Direct subcategories, for the chips on a category page */
export const childrenOf = (slug: string) => {
  const path = CATEGORY_INFO[slug]?.path ?? slug;
  return Object.keys(CATEGORY_INFO).filter((s) => CATEGORY_INFO[s].path.replace(/\/[^/]+$/, '') === path && s !== slug);
};
/** Parent category, for breadcrumbs */
export const parentOf = (slug: string) => {
  const parentPath = CATEGORY_INFO[slug]?.path.split('/').slice(0, -1).join('/');
  return parentPath ? Object.keys(CATEGORY_INFO).find((s) => CATEGORY_INFO[s].path === parentPath) : undefined;
};

export type Story = CollectionEntry<'noticias'>;

export async function allStories(): Promise<Story[]> {
  return (await getCollection('noticias', (s) => !s.data.draft)).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** Same as allStories (the name the staff panel files use, from Noticias Xtra). */
export const getStories = allStories;

/** A story's main category: its most specific one (also the panel's "Sección"). */
export const mainCategory = (s: Story) => kicker(s)?.slug ?? 'noticias';

/* The staff panel (copied from Noticias Xtra) lists "sections"; on NotiCel those are the categories. */
export const SECTIONS = Object.entries(CATEGORY_INFO)
  .filter(([slug]) => slug !== 'uncategorized')
  .map(([id, c]) => ({ id, name: c.path.includes('/') ? `${CATEGORY_INFO[c.path.split('/')[0]]?.name ?? ''} › ${c.name}` : c.name, short: c.name, path: c.path }))
  .sort((a, b) => a.path.localeCompare(b.path));

export const inCategory = (s: Story, slug: string) => s.data.categories.includes(slug);

/** Label over a headline: the story's most specific category. */
export function kicker(s: Story): { slug: string; name: string } | null {
  const slug = s.data.categories.find((c) => !SKIP_KICKER.includes(c)) ?? s.data.categories[0];
  return slug ? { slug, name: CATEGORIES[slug] ?? slug } : null;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-PR', { timeZone: SITE.timeZone, ...opts });
/** "30 sep · 8:45 p. m." */
export const shortDate = (d: Date) => `${fmt({ day: 'numeric', month: 'short' }).format(d).replace('.', '')} · ${fmt({ hour: 'numeric', minute: '2-digit' }).format(d)}`;
export const timeOnly = (d: Date) => fmt({ hour: 'numeric', minute: '2-digit' }).format(d);
export const longDate = (d: Date) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);

const DAY = 864e5;
/** Lo más leído: most views in the 7 days before the newest story (60 days if there are too few). Same rule as the WordPress theme. */
export function mostRead(all: Story[], n = 5): Story[] {
  const newest = all[0]?.data.date.valueOf() ?? 0;
  const within = (days: number) => all.filter((s) => s.data.date.valueOf() > newest - days * DAY).sort((a, b) => b.data.views - a.data.views);
  return (within(7).length >= n ? within(7) : within(60)).slice(0, n);
}

/** Stories per category page (/category/deportes/page/2/ ...) */
export const CATEGORY_PAGE_SIZE = 20;

/** Puerto Rico's 78 towns (staff panel: the "Lugar" list). Same list as Noticias Xtra. */
export const PR_MUNICIPIOS = ['Adjuntas', 'Aguada', 'Aguadilla', 'Aguas Buenas', 'Aibonito', 'Añasco', 'Arecibo', 'Arroyo', 'Barceloneta', 'Barranquitas',
  'Bayamón', 'Cabo Rojo', 'Caguas', 'Camuy', 'Canóvanas', 'Carolina', 'Cataño', 'Cayey', 'Ceiba', 'Ciales', 'Cidra', 'Coamo', 'Comerío', 'Corozal',
  'Culebra', 'Dorado', 'Fajardo', 'Florida', 'Guánica', 'Guayama', 'Guayanilla', 'Guaynabo', 'Gurabo', 'Hatillo', 'Hormigueros', 'Humacao', 'Isabela',
  'Jayuya', 'Juana Díaz', 'Juncos', 'Lajas', 'Lares', 'Las Marías', 'Las Piedras', 'Loíza', 'Luquillo', 'Manatí', 'Maricao', 'Maunabo', 'Mayagüez',
  'Moca', 'Morovis', 'Naguabo', 'Naranjito', 'Orocovis', 'Patillas', 'Peñuelas', 'Ponce', 'Quebradillas', 'Rincón', 'Río Grande', 'Sabana Grande',
  'Salinas', 'San Germán', 'San Juan', 'San Lorenzo', 'San Sebastián', 'Santa Isabel', 'Toa Alta', 'Toa Baja', 'Trujillo Alto', 'Utuado',
  'Vega Alta', 'Vega Baja', 'Vieques', 'Villalba', 'Yabucoa', 'Yauco'];
