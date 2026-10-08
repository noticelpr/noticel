import { getCollection, type CollectionEntry } from 'astro:content';

/* =========================================================
   SITE SETTINGS: edit these to change the whole site
   ========================================================= */
export const SITE = {
  name: 'NotiCel',
  tagline: 'La verdad como es',
  subtitle: 'Noticias de Puerto Rico',
  description: 'NotiCel: noticias de Puerto Rico. La verdad como es.',
  timeZone: 'America/Puerto_Rico',
};

/* NotiCel's categories, exactly as WordPress has them (slug: name), so every old category address keeps working.
   Taken from the WordPress export of 2026-10-03; the full site may have a few more. */
export const CATEGORIES: Record<string, string> = {
  agricultura: 'Agricultura', atletismo: 'Atletismo', auto: 'Auto', baloncesto: 'Baloncesto', beisbol: 'Béisbol',
  boxeo: 'Boxeo', ciencia: 'Ciencia', cine: 'Cine', clima: 'Clima', comercio: 'Comercio', cultura: 'Cultura',
  deportes: 'Deportes', economia: 'Economía', educacion: 'Educación', 'el-tiempo': 'El Tiempo', elecciones: 'Elecciones',
  empresarismo: 'Empresarismo', energia: 'Energía', entretenimiento: 'Entretenimiento', 'estados-unidos': 'Estados Unidos',
  fama: 'Fama', 'finanzas-y-banca': 'Finanzas y Banca', fotos: 'Fotos', futbol: 'Fútbol', gobierno: 'Gobierno',
  hipismo: 'Hipismo', huracanes: 'Huracanes', judicatura: 'Judicatura', 'la-calle': 'La Calle', legislatura: 'Legislatura',
  'lucha-libre': 'Lucha Libre', 'mas-deportes': 'Más Deportes', mundo: 'Mundo', musica: 'Música', nfl: 'NFL',
  noticias: 'Noticias', opiniones: 'Opiniones', policiacas: 'Policíacas', politica: 'Política', softbol: 'Sóftbol',
  tecnologia: 'Tecnología', television: 'Televisión', tenis: 'Tenis', tribunales: 'Tribunales', turismo: 'Turismo',
  'ultima-hora': 'Última Hora', uncategorized: 'Uncategorized', 'vida-y-bienestar': 'Vida y Bienestar',
  'videos-y-fotos': 'Videos y Fotos', voleibol: 'Voleibol',
};

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

/** Category page address. Placeholder until we confirm noticel.com's category URLs; change only here. */
export const categoryUrl = (slug: string) => url(`categoria/${slug}`);

export type Story = CollectionEntry<'noticias'>;

export async function allStories(): Promise<Story[]> {
  return (await getCollection('noticias', (s) => !s.data.draft)).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

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
