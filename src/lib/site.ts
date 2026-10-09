import { getCollection, type CollectionEntry } from 'astro:content';
import { league } from './leagues';
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
  // Test copy: every page asks search engines not to index it, so Google never sees a second copy
  // of NotiCel's stories. Set to false only on the day the new site replaces WordPress at noticel.com.
  testSite: true,
  // Shows the "sitio de demostración" bar at the top. Set to false when going live.
  demoMode: false,
  // Newsroom email: tips, corrections and privacy questions go here. Empty = pages say "muy pronto".
  email: '',
  // Breaking bar: chosen automatically (see src/lib/breaking.ts). Set this only to force a story by hand.
  breaking: null as
    | { text: string; id: string }
    | null,
  // Sample scores, standings, stats and game pages, labeled "DEMO" everywhere they appear.
  sportsDemo: true,
  // Turn parts of the site on (true) or off (false). Off parts are hidden everywhere. (Same parts as Noticias Xtra.)
  features: {
    videos: true, // video section and pages (VIDEOS below: NotiCel and BSN YouTube channels)
    live: true, // "En vivo" button and page
    weather: false, // town temperatures (TOWNS below are samples); a link to the official forecast shows instead
    newsletter: true, // newsletter sign-up box (demo: nothing is sent until an email service is connected)
    app: true, // "Descarga la app" link and banner
    holidayLogo: false, // holiday decoration on the logo (made for Noticias Xtra's logo; off for NotiCel's)
    ads: true, // ad placeholders ("Espacio publicitario") across the site
  },
  // Google Analytics 4 Measurement ID of NotiCel's own property. Empty = no visitor counting.
  gaId: '',
  // GIPHY key for GIF search in comments. Empty = only our own animated GIFs.
  giphyKey: '',
  // Set to true once an Anthropic API key is added for the automatic news writer (the panel's Salud tab reads it)
  aiKeyConnected: false,
  // Official National Weather Service forecast for Puerto Rico
  forecastUrl: 'https://www.weather.gov/sju/',
};


/* NotiCel's sections: the menu and the section pages. Each id is one of NotiCel's WordPress categories
   (src/data/categories.json), so its page lives at the same address as today (/category/<path>/). */
export const SECTIONS = [
  { id: 'noticias', name: 'Noticias', color: '#0B0B0B' },
  { id: 'gobierno', name: 'Gobierno', color: '#06476B' },
  { id: 'legislatura', name: 'Legislatura', color: '#0A5A86' },
  { id: 'tribunales', name: 'Tribunales', color: '#1B3A4B' },
  { id: 'policiacas', name: 'Policíacas', color: '#2A2A2A' },
  { id: 'politica', name: 'Política', color: '#08547F' },
  { id: 'economia', name: 'Economía', color: '#0E6E8C' },
  { id: 'deportes', name: 'Deportes', color: '#007BB6' },
  { id: 'entretenimiento', name: 'Entretenimiento', color: '#3D5A80' },
  { id: 'opiniones', name: 'Opiniones', color: '#1F1F1F' },
  { id: 'vida-y-bienestar', name: 'Vida y Bienestar', color: '#4E7A12' },
  { id: 'el-tiempo', name: 'El Tiempo', color: '#0F7FA6' },
  { id: 'mundo', name: 'Mundo', color: '#24577A' },
  { id: 'estados-unidos', name: 'Estados Unidos', color: '#1B3A7A' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/* The menu bar: main sections, and small drop-downs for subsections. `children` are category slugs (any NotiCel
   category, src/data/categories.json) that open from a ▾ next to the item; an item without an `id` is a drop-down only
   ("Más"). Every section and subsection keeps its own page either way. Noticias' list follows WordPress (noticias/…). */
export const NAV: Array<{ id?: SectionId; label?: string; children?: string[] }> = [
  { id: 'noticias', children: ['educacion', 'energia', 'estados-unidos', 'gobierno', 'judicatura', 'la-calle', 'legislatura', 'mundo', 'politica', 'tribunales'] },
  { id: 'gobierno', children: ['politica'] },
  { id: 'legislatura' },
  { id: 'tribunales' },
  { id: 'policiacas' },
  { id: 'economia' },
  { id: 'deportes' },
  { id: 'opiniones' },
  { id: 'el-tiempo' },
  { id: 'mundo' },
  { id: 'estados-unidos' },
  { label: 'Más', children: ['entretenimiento', 'vida-y-bienestar'] },
];
/** Subsections a section page shows as buttons: its WordPress subcategories plus its drop-down in the menu. */
export const subsectionsOf = (slug: string) => [...new Set([...childrenOf(slug), ...(NAV.find((n) => n.id === slug)?.children ?? [])])].filter((c) => c !== slug);

/* Default photo for each section, used when a story has no image of its own.
   All are free to use (public domain or Creative Commons) and must keep their credit. */
type Photo = { src: string; caption: string; credit: string; creditUrl: string };
const commons = (file: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
export const SECTION_IMAGES: Record<SectionId, Photo> = {
  'noticias': { src: 'images/pr-desde-el-aire-2.jpg', caption: 'Puerto Rico visto desde el espacio.', credit: 'Foto: NASA (dominio público)', creditUrl: commons('Puerto Rico From Above (154856 - 36 lrg).jpg') },
  'gobierno': { src: 'images/la-fortaleza.jpg', caption: 'La Fortaleza, sede del Gobierno de Puerto Rico, en el Viejo San Juan.', credit: 'Foto: vxla, CC BY 2.0, vía Wikimedia Commons', creditUrl: commons('La Fortaleza in San Juan, Puerto Rico.jpg') },
  'legislatura': { src: 'images/capitolio-pr.jpg', caption: 'El Capitolio de Puerto Rico, en San Juan.', credit: 'Foto: Brad Clinesmith, CC BY-SA 2.0, vía Wikimedia Commons', creditUrl: commons('Capitolio de Puerto Rico (28755163211) (cropped).jpg') },
  'tribunales': { src: 'images/capitolio-pr.jpg', caption: 'El Capitolio de Puerto Rico, en San Juan.', credit: 'Foto: Brad Clinesmith, CC BY-SA 2.0, vía Wikimedia Commons', creditUrl: commons('Capitolio de Puerto Rico (28755163211) (cropped).jpg') },
  'policiacas': { src: 'images/pr-desde-el-aire.jpg', caption: 'La costa norte de Puerto Rico vista desde el espacio.', credit: 'Foto: NASA (dominio público)', creditUrl: commons('Puerto Rico From Above (154856 - 42 lrg).jpg') },
  'politica': { src: 'images/capitolio-pr.jpg', caption: 'El Capitolio de Puerto Rico, en San Juan.', credit: 'Foto: Brad Clinesmith, CC BY-SA 2.0, vía Wikimedia Commons', creditUrl: commons('Capitolio de Puerto Rico (28755163211) (cropped).jpg') },
  'economia': { src: 'images/milla-de-oro.jpg', caption: 'La Milla de Oro, centro financiero en Hato Rey.', credit: 'Foto: Jose A. Perez, CC BY 2.0, vía Wikimedia Commons', creditUrl: commons('Rain clouds over Milla de Oro in Hato Rey, Puerto Rico.jpg') },
  'deportes': { src: 'images/estadio-hiram-bithorn.jpg', caption: 'Estadio Hiram Bithorn, en San Juan.', credit: 'Foto: Servicio de Parques Nacionales (dominio público)', creditUrl: commons('Hiram Bithorn Stadium in Puerto Rico in 2013 (exterior).jpg') },
  'entretenimiento': { src: 'images/bellas-artes.jpg', caption: 'Centro de Bellas Artes Luis A. Ferré, en Santurce.', credit: 'Foto: Nortegawiki, CC0, vía Wikimedia Commons', creditUrl: commons('Fachada Centro de Bellas Artes Luis A. Ferré.jpg') },
  'opiniones': { src: 'images/periodicos.jpg', caption: 'Imagen de referencia.', credit: 'Foto: Babak Farrokhi, CC BY 2.0, vía Wikimedia Commons', creditUrl: commons('Newspaper Stack (8582618448).jpg') },
  'vida-y-bienestar': { src: 'images/estetoscopio.jpg', caption: 'Imagen de referencia.', credit: 'Foto: Jacek Halicki, CC BY-SA 4.0, vía Wikimedia Commons', creditUrl: commons('2023 Stetoskop.jpg') },
  'el-tiempo': { src: 'images/pr-desde-el-aire.jpg', caption: 'La costa norte de Puerto Rico vista desde el espacio.', credit: 'Foto: NASA (dominio público)', creditUrl: commons('Puerto Rico From Above (154856 - 42 lrg).jpg') },
  'mundo': { src: 'images/tierra.jpg', caption: 'La Tierra vista desde el espacio.', credit: 'Imagen: NASA (dominio público)', creditUrl: commons('Blue Marble Western Hemisphere.jpg') },
  'estados-unidos': { src: 'images/casa-blanca.jpg', caption: 'La Casa Blanca, en Washington D.C.', credit: 'Foto: Nishkid64 (dominio público), vía Wikimedia Commons', creditUrl: commons('North Façade White House.JPG') },
};


/* Sports photos by sport, so a basketball story doesn't get the baseball stadium */
const SPORT_IMAGES: Record<'basketball' | 'baseball' | 'volleyball' | 'boxing' | 'tennis' | 'football', Photo> = {
  basketball: { src: 'images/canasto-baloncesto.jpg', caption: 'Imagen de referencia.', credit: 'Foto: J.smith, CC BY-SA 4.0, vía Wikimedia Commons', creditUrl: commons('Basketball net.jpg') },
  baseball: SECTION_IMAGES.deportes,
  volleyball: { src: 'images/voleibol-balon.jpg', caption: 'Imagen de referencia.', credit: 'Foto: Sami Mlouhi, CC BY-SA 4.0, vía Wikimedia Commons', creditUrl: commons('Volleyball ball - le ballon de volley-ball - كرة الكرة الطائرة Espérance sportive de Tunis photo1.jpg') },
  boxing: { src: 'images/ring-boxeo.jpg', caption: 'Imagen de referencia.', credit: 'Foto: Micheal Kaluba, CC BY-SA 4.0, vía Wikimedia Commons', creditUrl: commons('Set-up of a boxing Ring.jpg') },
  football: { src: 'images/futbol-americano.svg', caption: 'Imagen de referencia.', credit: 'Ilustración: Noticias Xtra', creditUrl: '' },
  tennis: { src: 'images/pelota-tenis.jpg', caption: 'Imagen de referencia.', credit: 'Foto: Santeri Viinamäki, CC BY-SA 4.0, vía Wikimedia Commons', creditUrl: commons('Tennis ball on tennis court 20170619.jpg') },
};

/** Default photo for a story without its own: by league (sports) or by section. */
export function defaultPhoto(sectionId: SectionId, leagueId?: string): Photo {
  const sport = league(leagueId)?.photo;
  return sport ? SPORT_IMAGES[sport] : SECTION_IMAGES[sectionId];
}

export const ICONS: Record<SectionId, string> = {
  'noticias': '<path d="M3 15c3-1 4-4 7-4s4 2 7 1 3-2 4-2M5 19h14"/><circle cx="17" cy="6" r="2"/>',
  'gobierno': '<path d="M5 21V8l7-5 7 5v13M9 21v-6h6v6M3 21h18"/>',
  'legislatura': '<path d="M4 20h16M6 20v-8M10 20v-8M14 20v-8M18 20v-8M3 12l9-7 9 7z"/>',
  'tribunales': '<path d="M12 3v18M5 21h14M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
  'policiacas': '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  'politica': '<path d="M4 20h16M6 20v-8M10 20v-8M14 20v-8M18 20v-8M3 12l9-7 9 7z"/>',
  'economia': '<path d="M4 19V5M4 19h16M7 15l4-4 3 3 5-6"/>',
  'deportes': '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>',
  'entretenimiento': '<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  'opiniones': '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  'vida-y-bienestar': '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/><path d="M9 11h6M12 8v6"/>',
  'el-tiempo': '<path d="M7 17h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 17zM9 20l-1 2M13 20l-1 2M17 20l-1 2"/>',
  'mundo': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  'estados-unidos': '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
};


/* Sample videos. Later these can come from YouTube or a video host. */
/* Videos: the official YouTube channels of NotiCel and of the BSN (Baloncesto Superior Nacional),
   shown with YouTube's own embedded player (allowed by YouTube; nothing is downloaded). Each video page
   credits its source and links to the video on YouTube. Titles are our Spanish summaries.
   To add one: copy the 11-character code after "watch?v=" into `yt` and pick its `src`. */
export const VIDEO_SOURCES = {
  noticel: { name: 'NotiCel', short: 'NotiCel', url: 'https://www.youtube.com/noticeloficial', channel: 'UC7rGX_tpwX0S4rCgWTXBeIQ' },
  bsn: { name: 'Baloncesto Superior Nacional (BSN)', short: 'BSN', url: 'https://www.youtube.com/@BaloncestoSuperiorNacionalPR', channel: 'UCZOFf3DbBqAMSwmzYl8RPnA' },
} as const;
export const VIDEOS = [
  // NotiCel (latest first)
  { id: 'noticel-gobernadora-ramon-luis-rivera', yt: '8KITO1HogJ4', src: 'noticel', section: 'gobierno', title: 'La gobernadora recuerda el legado de Ramón Luis Rivera', duration: '6:56' },
  { id: 'noticel-pj-sin-suela-10-anos', yt: 'Ps_OE5Q-G80', src: 'noticel', section: 'entretenimiento', title: 'Rapero y médico: PJ Sin Suela repasa 10 años de trayectoria', duration: '8:43' },
  { id: 'noticel-dalvin-seis-sold-outs', yt: '29f4hmLJgBI', src: 'noticel', section: 'entretenimiento', title: 'Dalvin “La Melodía” en concierto: seis llenos en Puerto Rico', duration: '15:00' },
  { id: 'noticel-montaner-ultimo-regreso', yt: 'm6Tyg16Fg24', src: 'noticel', section: 'entretenimiento', title: 'Ricardo Montaner en su “Último Regreso” a San Juan', duration: '9:04' },
  { id: 'noticel-torres-montalvo-tribunal', yt: 'CJ5RRB4SLG8', src: 'noticel', section: 'politica', title: 'Hiram Torres Montalvo defiende su candidatura a Cataño en el tribunal', duration: '4:43' },
  { id: 'noticel-trauma-severo', yt: 'X3-0incEkUY', src: 'noticel', section: 'vida-y-bienestar', title: '¿Está Puerto Rico preparado para atender un trauma severo?', duration: '25:00' },
  { id: 'noticel-beto-cuevas-la-ley', yt: 'dYSaZ6MuBvc', src: 'noticel', section: 'entretenimiento', title: 'Beto Cuevas rinde homenaje a La Ley en el Music Hall', duration: '4:43' },
  { id: 'noticel-centro-tecnologico-comunidades', yt: '7qXhgcxWu7U', src: 'noticel', section: 'noticias', title: 'Inauguran un centro tecnológico para dar voz a comunidades vulnerables', duration: '3:45' },
  // BSN
  { id: 'bsn-celebracion-bayamon-2026', yt: '7vcPJaj3vGA', src: 'bsn', section: 'deportes', title: 'Desde la cancha en Bayamón: así celebraron los Vaqueros el campeonato 2026', duration: '11:43' },
  { id: 'bsn-bayamon-repite-campeon', yt: 'elqiQDkvjVk', src: 'bsn', section: 'deportes', title: 'Bayamón repite como campeón del BSN', duration: '2:12' },
  { id: 'bsn-vaqueros-santeros-resumen-final', yt: 'KHbE8xipLcI', src: 'bsn', section: 'deportes', title: 'Vaqueros vs. Santeros: resumen del juego que coronó a Bayamón', duration: '14:11' },
  { id: 'bsn-vaqueros-santeros-mejores-jugadas', yt: 'wLYomIbSvqk', src: 'bsn', section: 'deportes', title: 'Vaqueros vs. Santeros: las mejores jugadas', duration: '3:29' },
  { id: 'bsn-final-juego-5', yt: 'mBpcnM4pnLE', src: 'bsn', section: 'deportes', title: 'Santeros vs. Vaqueros: resumen del Juego 5 de la Final', duration: '14:51' },
  { id: 'bsn-final-juego-3', yt: 'zhSGVmdknZI', src: 'bsn', section: 'deportes', title: 'Santeros vs. Vaqueros: resumen del Juego 3 de la Final', duration: '16:13' },
  { id: 'bsn-bayamon-gana-juego-1', yt: 'ze3yvdAUW4k', src: 'bsn', section: 'deportes', title: '¡Bayamón se lleva el primero de La Final Brava!', duration: '1:22' },
  { id: 'bsn-final-juego-1', yt: '2VMwFuhnQWk', src: 'bsn', section: 'deportes', title: 'Santeros vs. Vaqueros: resumen del Juego 1 de la Final', duration: '13:26' },
  { id: 'bsn-capitulo-final-2026', yt: 'kqHEowKdtIs', src: 'bsn', section: 'deportes', title: 'Llega el capítulo final de la temporada 2026', duration: '1:49' },
] as const satisfies ReadonlyArray<{ id: string; yt: string; src: keyof typeof VIDEO_SOURCES; section: SectionId; title: string; duration: string }>;

export type Video = (typeof VIDEOS)[number];

/* Sample weather. Later this can be fetched from the National Weather Service during each build. */
export const TOWNS = [
  { name: 'San Juan', temp: 31, sky: 'Parcialmente nublado' },
  { name: 'Bayamón', temp: 32, sky: 'Soleado' },
  { name: 'Caguas', temp: 29, sky: 'Aguaceros' },
  { name: 'Ponce', temp: 33, sky: 'Soleado' },
  { name: 'Mayagüez', temp: 30, sky: 'Tormentas aisladas' },
  { name: 'Fajardo', temp: 28, sky: 'Lluvia' },
];

// "En vivo" page (src/pages/en-vivo.astro): live YouTube channels in order of priority. Each time the site
// rebuilds (every 15 minutes), the first one that is live plays; if none is live, NotiCel's newest video plays.
export const LIVE_SOURCES = [
  { id: 'senado', name: 'Senado de Puerto Rico', channel: 'UC4B_LPWngCxJS9bUzFVf0gA', url: 'https://www.youtube.com/channel/UC4B_LPWngCxJS9bUzFVf0gA' },
  { id: 'camara', name: 'Cámara de Representantes', channel: 'UCm0SWjunIA5PDT9l4qW59Kw', url: 'https://www.youtube.com/channel/UCm0SWjunIA5PDT9l4qW59Kw' },
  { id: 'gobierno', name: 'Gobierno de Puerto Rico', channel: 'UCU4E9onNJk_vMOq22EisoCQ', url: 'https://www.youtube.com/@GobiernodePR' },
  { id: 'casa-blanca', name: 'Casa Blanca (EE. UU.)', channel: 'UCYxRlFDqcWM4y7FfpiAN3KQ', url: 'https://www.youtube.com/@WhiteHouse' },
  { id: 'noticel', name: 'NotiCel', channel: VIDEO_SOURCES.noticel.channel, url: VIDEO_SOURCES.noticel.url },
  { id: 'nasa', name: 'NASA', channel: 'UCLA_DiR1FfKNvjuUpBHmylQ', url: 'https://www.youtube.com/@NASA' },
];
// Section pages with a live video box at the top of the right column (ids from LIVE_SOURCES)
export const SECTION_LIVE: Record<string, string> = { gobierno: 'gobierno', legislatura: 'camara', 'estados-unidos': 'casa-blanca' };

/* =========================================================
   Helpers
   ========================================================= */

/** Builds a link that works with the GitHub Pages base path, e.g. url('noticia/abc') */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.replace(/^\//, '');
  return clean ? `${base}/${clean}${clean.includes('.') || clean.endsWith('/') ? '' : '/'}` : `${base}/`;
}

export function section(id: string) {
  return SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
}

/** A section's page: the category page at noticel.com's address (/category/<path>/). */
export const sectionUrl = (id: string) => categoryUrl(id);
/** A story's page: its exact old WordPress address. */
export const storyUrl = (s: { data: { path: string } }) => url(s.data.path);

export function formatDate(d: Date): string {
  return d.toLocaleDateString('es-PR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Puerto_Rico' });
}

type Entry = CollectionEntry<'noticias'>;
/** A NotiCel story with the fields Noticias Xtra's pages read: its section, and topStory as `featured`. */
export type Story = Entry & { data: Entry['data'] & { section: SectionId; featured: boolean } };

const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));
const BROAD = ['noticias', 'ultima-hora', 'uncategorized'];
/** The story's section: its most specific category that has a section, or that category's nearest parent section. */
export function sectionOf(categories: string[]): SectionId {
  if (categories.includes('opiniones')) return 'opiniones';
  let best: string | undefined, depth = -1;
  for (const c of categories) {
    if (BROAD.includes(c)) continue;
    for (let k: string | undefined = c; k; k = parentOf(k)) {
      if (!SECTION_IDS.has(k)) continue;
      const d = CATEGORY_INFO[k].path.split('/').length;
      if (d > depth) { best = k; depth = d; }
      break;
    }
  }
  return (best ?? 'noticias') as SectionId;
}
const shape = (e: Entry): Story => ({ ...e, data: { ...e.data, section: sectionOf(e.data.categories), featured: e.data.topStory } });

let cache: Story[] | null = null;
/** All published stories, newest first. */
export async function getStories(): Promise<Story[]> {
  if (cache) return cache;
  // Scheduled stories (date in the future) stay hidden until then; the site rebuilds every 15 minutes
  const now = Date.now() + 5 * 60e3;
  const all = await getCollection('noticias', ({ data }) => !data.draft && data.date.valueOf() <= now);
  cache = all.map(shape).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  return cache;
}
/** Same as getStories (the name NotiCel's first pages used). */
export const allStories = getStories;

// Puerto Rico's 78 municipalities (the editor's "Lugar" list; isLocal() compares them without accents).
export const PR_MUNICIPIOS = ['Adjuntas', 'Aguada', 'Aguadilla', 'Aguas Buenas', 'Aibonito', 'Añasco', 'Arecibo', 'Arroyo', 'Barceloneta', 'Barranquitas',
  'Bayamón', 'Cabo Rojo', 'Caguas', 'Camuy', 'Canóvanas', 'Carolina', 'Cataño', 'Cayey', 'Ceiba', 'Ciales', 'Cidra', 'Coamo', 'Comerío', 'Corozal',
  'Culebra', 'Dorado', 'Fajardo', 'Florida', 'Guánica', 'Guayama', 'Guayanilla', 'Guaynabo', 'Gurabo', 'Hatillo', 'Hormigueros', 'Humacao', 'Isabela',
  'Jayuya', 'Juana Díaz', 'Juncos', 'Lajas', 'Lares', 'Las Marías', 'Las Piedras', 'Loíza', 'Luquillo', 'Manatí', 'Maricao', 'Maunabo', 'Mayagüez',
  'Moca', 'Morovis', 'Naguabo', 'Naranjito', 'Orocovis', 'Patillas', 'Peñuelas', 'Ponce', 'Quebradillas', 'Rincón', 'Río Grande', 'Sabana Grande',
  'Salinas', 'San Germán', 'San Juan', 'San Lorenzo', 'San Sebastián', 'Santa Isabel', 'Toa Alta', 'Toa Baja', 'Trujillo Alto', 'Utuado',
  'Vega Alta', 'Vega Baja', 'Vieques', 'Villalba', 'Yabucoa', 'Yauco'];
const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
// "Florida" is left out: on its own it almost always means the U.S. state.
const PR_TOWNS = new Set(PR_MUNICIPIOS.filter((t) => t !== 'Florida').map(plain));

/** A Puerto Rico story: a local section, a local league, a Puerto Rico place, or Puerto Rico in the headline. */
export function isLocal(s: Story): boolean {
  const d = s.data;
  if (d.section === 'opiniones') return false; // columns are not news; they never take the top spots this way
  if (['noticias', 'gobierno', 'legislatura', 'tribunales', 'policiacas', 'politica'].includes(d.section)) return true;
  if (d.league) return league(d.league)?.local ?? false;
  const place = plain(d.place ?? '');
  if (place.includes('puerto rico') || PR_TOWNS.has(place.split(',')[0].trim())) return true;
  return /puerto rico|boricua|puertorrique/i.test(`${d.title} ${d.description}`);
}
/** Big enough to lead even if it isn't local: breaking, live, an editor's pick or marked "trending". */
export const isTrending = (s: Story) => s.data.trending || s.data.breaking || s.data.live || s.data.featured;

/** Order for the top spots of every page: among the last `hours` hours, trending first, then Puerto Rico,
 *  then the rest; older stories after, newest first. Chronological lists ("Últimas noticias") don't use it. */
export function topOrder(stories: Story[], hours = 36): Story[] {
  const now = Date.now();
  const rank = (s: Story) => (now - s.data.date.valueOf() > hours * 36e5 ? 3 : isTrending(s) ? 0 : isLocal(s) ? 1 : 2);
  return [...stories].sort((a, b) => rank(a) - rank(b) || b.data.date.valueOf() - a.data.date.valueOf());
}

/** Editors' picks (homeLead or sectionLead, set in the panel's editor) go first, newest first, in the top spots.
 *  A pick counts for `hours` hours after the story's date, so it never stays on top for days. Use after topOrder. */
export function pinFirst(stories: Story[], key: 'homeLead' | 'sectionLead', hours = 48): Story[] {
  const now = Date.now();
  const picks = stories.filter((s) => s.data[key] && now - s.data.date.valueOf() < hours * 36e5).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  return [...picks, ...stories.filter((s) => !picks.includes(s))];
}

/** Home page order: a pinned story (📌, newest pin wins) keeps the main spot with no time limit; the editor's
 *  "Principal de la Portada" pick comes next (or first, when nothing is pinned). Use after topOrder. */
export function pinTop(stories: Story[]): Story[] {
  const pin = stories.filter((s) => s.data.pinned).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())[0];
  const rest = pinFirst(stories.filter((s) => s !== pin), 'homeLead');
  return pin ? [pin, ...rest] : rest;
}

/** Section page order: a story pinned to its section (📌, newest pin wins) keeps the top spot with no time limit;
 *  the editor's "Principal de su sección" picks come next. Use after topOrder, on one section's stories. */
export function sectionTop(stories: Story[]): Story[] {
  const pin = stories.filter((s) => s.data.sectionPinned).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())[0];
  const rest = pinFirst(stories.filter((s) => s !== pin), 'sectionLead');
  return pin ? [pin, ...rest] : rest;
}

const DAY = 864e5;
/** Lo más leído: most views (WordPress post_views_count) in the 7 days before the newest story (60 if too few). */
export function mostRead(stories: Story[], n = 5): Story[] {
  const newest = stories[0]?.data.date.valueOf() ?? 0;
  const within = (days: number) => stories.filter((s) => s.data.date.valueOf() > newest - days * DAY).sort((a, b) => b.data.views - a.data.views);
  return (within(7).length >= n ? within(7) : within(60)).slice(0, n);
}

/* =========================================================
   NotiCel: categories and old WordPress addresses
   ========================================================= */
/* NotiCel's categories, exactly as WordPress has them, so every old category address keeps working.
   src/data/categories.json: slug -> { name, path }. `path` is the full WordPress path under /category/
   (e.g. policiacas -> noticias/la-calle/policiacas), read from noticel.com on 2026-10-08. */
export const CATEGORY_INFO: Record<string, { name: string; path: string }> = categoryData;
export const CATEGORIES: Record<string, string> = Object.fromEntries(Object.entries(CATEGORY_INFO).map(([slug, c]) => [slug, c.name]));

// Broad categories never shown as the small label over a headline (same rule as the WordPress theme)
const SKIP_KICKER = ['noticias', 'ultima-hora', 'uncategorized'];


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


/** Stories per category page (/category/deportes/page/2/ ...) */
export const CATEGORY_PAGE_SIZE = 20;


/** A story's main category: its most specific one (the label over the headline). */
export const mainCategory = (s: Story) => kicker(s)?.slug ?? 'noticias';

/* Every category, for the staff panel's "Sección" list (Escribir) and its filters. */
export const CATEGORY_OPTIONS = Object.entries(CATEGORY_INFO)
  .filter(([slug]) => slug !== 'uncategorized')
  .map(([id, c]) => ({ id, name: c.path.includes('/') ? `${CATEGORY_INFO[c.path.split('/')[0]]?.name ?? ''} › ${c.name}` : c.name, short: c.name, path: c.path }))
  .sort((a, b) => a.path.localeCompare(b.path));
