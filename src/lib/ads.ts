/* =========================================================
   ADVERTISING: prices, discounts, regions, direct campaigns and Google fill.
   Edit this file to change what the Anúnciate page shows and which ads run.
   ========================================================= */

export type AdSize = 'leaderboard' | 'rectangle' | 'halfpage' | 'infeed';

// ---- Prices (USD per month unless `per` says otherwise) ----
// NotiCel: every price, discount and commission below is 0 on purpose. This folder keeps no prices or deal terms
// (CLAUDE.md), and these numbers were NotiCel's. NotiCel's sales team sets its own when the ads go live.
// `art`: the image sizes (width × height) the client uploads, or that we create for them.
export const FORMATS = [
  { id: 'valla', name: 'Valla digital', size: 'Banner superior, rota con otras marcas', price: 0, cpm: 0, per: 'mes', slots: ['leaderboard'] as AdSize[], where: 'Banner de abajo en todas las páginas en computadora, rotando con otras marcas; en celular se ve como cuadrado (300 × 250).',
    about: 'Tu anuncio rota cada 8 segundos con hasta 3 marcas más. En celular se ve como cuadrado. La forma más barata de empezar.', art: [[728, 90], [300, 250]], popular: false },
  { id: 'rectangle', name: 'Rectángulo', size: '300 × 250', price: 0, cpm: 0, per: 'mes', slots: ['rectangle'] as AdSize[], where: 'Al lado de las noticias en computadora y entre el contenido en celular: portada, noticias, secciones, Deportes, juegos y foro.',
    about: 'Al lado de las noticias, Deportes y los juegos. Se ve igual en celular.', art: [[300, 250]], popular: true },
  { id: 'cuadrado', name: 'Cuadrado', size: 'Como tus posts de Instagram o Facebook', price: 0, cpm: 0, per: 'mes', slots: ['rectangle'] as AdSize[], where: 'En los espacios de rectángulo: al lado de las noticias en computadora y entre el contenido en celular, donde se ve cuadrado.',
    about: 'Sube el mismo post cuadrado de tus redes (1:1). En celular se ve completo y grande.', art: [[600, 600]], popular: false },
  { id: 'infeed', name: 'Entre noticias', size: '728 × 90', price: 0, cpm: 0, per: 'mes', slots: ['infeed'] as AdSize[], where: 'Entre las noticias de la portada y de las secciones, y al final de cada noticia; en celular se ve como cuadrado (300 × 250).',
    about: 'Entre las noticias de la portada y al final de cada noticia. En celular se ve como cuadrado.', art: [[728, 90], [300, 250]], popular: false },
  { id: 'leaderboard', name: 'Banner exclusivo', size: '728 × 90', price: 0, cpm: 0, per: 'mes', slots: ['leaderboard'] as AdSize[], where: 'Banner de arriba y de abajo en todas las páginas en computadora, solo tu marca; en celular se ve como cuadrado (300 × 250).',
    about: 'El banner de arriba, solo para tu marca (sin rotar). En celular se ve como cuadrado.', art: [[728, 90], [300, 250]], popular: false },
  { id: 'halfpage', name: 'Media página', size: '300 × 600', price: 0, cpm: 0, per: 'mes', slots: ['halfpage'] as AdSize[], where: 'Columna derecha de las noticias, Deportes y los juegos (solo en computadora).',
    about: 'El espacio más grande; se queda a la vista al bajar. Solo en computadora.', art: [[300, 600]], popular: false },
  { id: 'patrocinio', name: 'Patrocinio de sección', size: 'Juegos, Deportes, Clima…', price: 0, per: 'mes', slots: [] as AdSize[], where: 'Todos los espacios de anuncios, con “Presentado por” tu marca.',
    about: '“Presentado por” tu marca y todos los espacios de una sección.', art: [[300, 250], [728, 90]], popular: false },
  { id: 'takeover', name: 'Toma de portada', size: 'Todo el sitio, por días', price: 0, per: 'día', slots: [] as AdSize[], where: 'Todos los espacios del sitio, solo tu marca: por los días que escojas o hasta cumplir las vistas.',
    about: 'Todos los espacios del sitio con tu marca, por los días que escojas (1 a 14).', art: [[300, 250], [728, 90], [300, 600]], popular: false },
];
// What a client can buy alone on Anúnciate (user, 2026-11-03): only the square, the ad that fits phones best and
// that a business already has (its Instagram/Facebook post). Every other spot is sold by Ventas, or left to Google.
export const SELF_SERVE = ['cuadrado'];
export const DESIGN_FEE = 0; // we create the ad from the client's text and logo: always charged (user, 2026-10-31)
export const DESIGN_FREE_FROM_MONTHS = Infinity; // the design is never free anymore (was: free from 3 months)
export const UPLOAD = { maxMB: 3, types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] };

// ---- Where the ads show ----
// Share of the full price for each audience choice
export const REGIONS = [
  { id: 'oeste', name: 'Oeste', towns: 'Aguadilla, Mayagüez, Cabo Rojo, Rincón…' },
  { id: 'norte', name: 'Norte', towns: 'Arecibo, Manatí, Vega Baja, Hatillo…' },
  { id: 'metro', name: 'Metro', towns: 'San Juan, Bayamón, Carolina, Guaynabo…' },
  { id: 'centro', name: 'Centro', towns: 'Caguas, Cayey, Utuado, Barranquitas…' },
  { id: 'sur', name: 'Sur', towns: 'Ponce, Guayama, Yauco, Salinas…' },
  { id: 'este', name: 'Este', towns: 'Fajardo, Humacao, Río Grande, Yabucoa…' },
  { id: 'islas', name: 'Vieques y Culebra', towns: 'Las islas municipio' },
];
export const AUDIENCE = { all: 1, island: 0.85, diaspora: 0.5, perRegion: 0.25 }; // regions add up, capped at `island`

// ---- Discounts ----
export const LAUNCH_DISCOUNT = { pct: 0, months: 3, text: '' };
export const DURATION_DISCOUNTS = [ // months → % off
  { months: 3, pct: 0 }, { months: 6, pct: 0 }, { months: 12, pct: 0 },
];
export const OTHER_DISCOUNTS = [
  { id: 'combo', pct: 0, text: '2 formatos o más en la misma campaña' },
  { id: 'prepago', pct: 0, text: 'Pago completo por adelantado' }, // agency proposals only (panel → Ventas), not self-service
  { id: 'nonprofit', pct: 0, text: 'Organizaciones sin fines de lucro' },
];
export const MAX_DISCOUNT = 0; // discounts add up to this cap
// Free ads after the total spent (lifetime, per client)
export const REWARDS: Array<{ at: number; gift: string }> = []; // NotiCel sets its own
// ---- English, for advertisers who don't speak Spanish (/en/advertise/, the advertiser panel and the client emails).
// Same ids as above: change a price or a discount above and the English pages follow; change a name or a text above
// and update it here too.
export type Lang = 'es' | 'en';
export const FORMATS_EN: Record<string, { name: string; size: string; about: string }> = {
  valla: { name: 'Digital billboard', size: 'Top banner, rotates with other brands', about: 'Your ad rotates every 8 seconds with up to 3 other brands. On phones it shows as a square. The cheapest way to start.' },
  rectangle: { name: 'Rectangle', size: '300 × 250', about: 'Next to the news, Sports and the games. Looks the same on phones.' },
  cuadrado: { name: 'Square', size: 'Like your Instagram or Facebook posts', about: 'Upload the same square post from your social media (1:1). On phones it shows full and large.' },
  infeed: { name: 'Between stories', size: '728 × 90', about: 'Between the stories on the home page and at the end of every story. On phones it shows as a square.' },
  leaderboard: { name: 'Exclusive banner', size: '728 × 90', about: 'The top banner, only for your brand (no rotation). On phones it shows as a square.' },
  halfpage: { name: 'Half page', size: '300 × 600', about: 'The largest space; stays in view while scrolling. Computers only.' },
  patrocinio: { name: 'Section sponsorship', size: 'Games, Sports, Weather…', about: '“Presented by” your brand, and every ad space in one section.' },
  takeover: { name: 'Home page takeover', size: 'The whole site, by the day', about: 'Every ad space on the site with your brand, for the days you choose (1 to 14).' },
};
export const REGIONS_EN: Record<string, { name: string; towns: string }> = {
  oeste: { name: 'West', towns: 'Aguadilla, Mayagüez, Cabo Rojo, Rincón…' }, norte: { name: 'North', towns: 'Arecibo, Manatí, Vega Baja, Hatillo…' },
  metro: { name: 'Metro', towns: 'San Juan, Bayamón, Carolina, Guaynabo…' }, centro: { name: 'Central', towns: 'Caguas, Cayey, Utuado, Barranquitas…' },
  sur: { name: 'South', towns: 'Ponce, Guayama, Yauco, Salinas…' }, este: { name: 'East', towns: 'Fajardo, Humacao, Río Grande, Yabucoa…' },
  islas: { name: 'Vieques and Culebra', towns: 'The island municipalities' },
};
export const OTHER_DISCOUNTS_EN: Record<string, string> = { combo: '2 or more formats in the same campaign', prepago: 'Full payment up front', nonprofit: 'Nonprofit organizations' };
export const REWARDS_EN: Record<number, string> = {};
/** A format's name in the client's language. */
export const formatName = (id: string, lang: Lang = 'es') => (id === 'comunicado' ? (lang === 'en' ? 'Paid press release' : 'Comunicado de prensa') : undefined) ?? (lang === 'en' ? FORMATS_EN[id]?.name : undefined) ?? FORMATS.find((f) => f.id === id)?.name ?? id;

// Agencies and big brands: discount by yearly volume
export const VOLUME_TIERS = [
  { from: 1000, pct: 0 }, { from: 2500, pct: 0 }, { from: 5000, pct: 0 }, { from: 10000, pct: 0 },
];
export const AGENCY_COMMISSION = 0;

// ---- Direct campaigns (paid by our clients). They always show before Google ads. ----
// One entry per campaign. `regions`: 'all' | 'island' (readers in Puerto Rico) | 'diaspora'.
// `takeover: true` gives that campaign every ad space while it runs (and `skin`, an optional page background).
// Images go in public/anuncios/. Several creatives in one campaign rotate like a billboard.
export type Creative = { img: string; url: string; alt: string; w?: number; h?: number; video?: string }; // w/h: the image size (also read from names like ...-300x250.png)
// video: an optional MP4 or WebM (up to ~30 seconds, a few MB). It plays muted when on screen, the reader can turn the
// sound on, and `img` is the still picture shown before it loads. Animated images (GIF or animated SVG) also work in `img`.
export type Campaign = {
  id: string; client: string; sizes: AdSize[]; start: string; end: string;
  regions?: 'all' | 'island' | 'diaspora'; creatives: Creative[]; weight?: number; takeover?: boolean; skin?: string;
  views?: number; // paid views: the campaign stops by itself once this many views are delivered (counted in the backend)
};

// ---- Fair share (user, 2026-11-06). While we sell by the month and traffic grows, we don't promise a number of views. ----
// Fairness comes from: (1) at most MAX_PER_SPACE ads rotate in each space, so each one gets at least 1 of every
// MAX_PER_SPACE views (when a space is full, Anúnciate offers the next date it opens); (2) equal turns through the day:
// the ad with the fewest views today is the likeliest to show first (AdSlot.astro, `today_views` from
// supabase/vistas-justas.sql); (3) an honest estimate on Anúnciate, from our own read counter, instead of a promise;
// (4) Ventas → Campañas warns when an ad gets less than half its estimate, to give it free days.
// Later, with ~100,000 page views a month, switch SELL_BY_VIEWS on and sell guaranteed views.
export const MAX_PER_SPACE = 6;
export const MIN_READS_FOR_ESTIMATE = 3000; // story reads in 30 days before Anúnciate shows an estimate
/** Ad views each space gets per story read (phones show squares, about 2 per story; desktops the rest). Rough, on purpose. */
export const SPACE_VIEWS_PER_READ: Record<AdSize, number> = { rectangle: 2, infeed: 1, leaderboard: 1, halfpage: 0.2 };
/** The space a campaign competes in (its first size; the takeover has none: it takes them all). */
export const spaceOf = (sizes: readonly string[]): AdSize | null => (sizes[0] as AdSize) ?? null;
type Busy = { sizes: string[]; start: string; end: string; takeover?: boolean };
/** How many campaigns share `space` on `day`. */
export const adsOn = (busy: Busy[], space: AdSize, day: string) => busy.filter((b) => !b.takeover && b.sizes.includes(space) && b.start <= day && day <= b.end).length;
/** The first day from `from` on with a free place in `space`. */
export function nextOpen(busy: Busy[], space: AdSize, from: string): string {
  const days = [from, ...busy.map((b) => { const d = new Date(`${b.end}T12:00:00`); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })].filter((d) => d >= from).sort();
  return days.find((d) => adsOn(busy, space, d) < MAX_PER_SPACE) ?? from;
}
/** Views a month for one ad in `space`, as a range (an estimate, never a promise). `others`: ads already sharing it. */
export function estimateViews(reads30: number, space: AdSize, others: number): [number, number] | null {
  if (reads30 < MIN_READS_FOR_ESTIMATE) return null; // too few reads yet (new counter, password gate): no number rather than a silly one
  const v = (reads30 * SPACE_VIEWS_PER_READ[space]) / Math.min(MAX_PER_SPACE, others + 1);
  const r = (n: number) => Math.max(100, Math.round(n / 100) * 100);
  return [r(v * 0.7), r(v * 1.3)];
}

export const CAMPAIGNS: Campaign[] = [
  // Example (copy, fill in and remove the // to run it):
  // { id: 'panaderia-oct', client: 'Panadería La Esquina', sizes: ['rectangle'], start: '2026-10-01', end: '2026-10-31', regions: 'island',
  //   creatives: [{ img: 'anuncios/panaderia-1.jpg', url: 'https://example.com', alt: 'Pan sobao recién hecho' }] },
];

// ---- Sample ads for demo mode only (src/lib/demo.ts): made-up businesses, each image says "ANUNCIO DE EJEMPLO" ----
// They link to the Anúnciate page and are never counted as views or clicks.
const demoAd = (id: string, client: string, alt: string): Campaign => ({
  id: `demo-${id}`, client, sizes: ['leaderboard', 'infeed', 'rectangle', 'halfpage'], start: '2000-01-01', end: '2099-12-31', regions: 'all',
  creatives: ([[728, 90], [320, 100], [300, 250], [300, 600]] as const).map(([w, h]) => ({ img: `demo-anuncios/${id}-${w}x${h}.svg`, url: '/publicidad/', alt: `Anuncio de ejemplo: ${alt}`, w, h })),
});
export const DEMO_CAMPAIGNS: Campaign[] = [
  demoAd('panaderia', 'Panadería La Esquina', 'Panadería La Esquina, pan sobao caliente'),
  demoAd('ferreteria', 'Ferretería El Martillo', 'Ferretería El Martillo'),
  demoAd('dental', 'Clínica Dental Sonrisa', 'Clínica Dental Sonrisa'),
  demoAd('gimnasio', 'Gimnasio Fuerza', 'Gimnasio Fuerza, primer mes gratis'),
  demoAd('cafe', 'Café del Barrio', 'Café del Barrio, anuncio animado'), // animated sample (moving SVG)
];

// ---- Google fill: shows only where no direct campaign is running ----
// Paste the AdSense publisher id (ca-pub-…) and one ad-unit id per size once the account is approved.
export const GOOGLE = {
  client: '',
  slots: { leaderboard: '', rectangle: '', halfpage: '', infeed: '' } as Record<AdSize, string>,
};

export const ROTATE_SECONDS = 8;

// ---- Online payment and ad requests ----
// Fill these in once the accounts exist. While empty, the Anúnciate page works as a preview: nothing is charged
// or sent, and it tells the visitor to write to us.
//  - stripe: true once the "pagos" Edge Function and its Stripe secrets are set up (supabase/functions/pagos):
//    the client pays the request's exact amount on Stripe's page (card, Apple Pay, Google Pay), and Stripe itself
//    confirms the payment to the database. Test mode (sk_test_ key) until the account is verified.
//  - athMovilToken: the PUBLIC token from ATH Business (Settings → API Keys). Never put the private token here.
//  - requestsUrl: where requests (with the uploaded files) are saved for the employee who approves them.
// stripeTest: true while the secret key in Supabase is a test key (sk_test_): the page says it's a test and no money moves
export const PAYMENTS = { stripe: true, stripeTest: true, athMovilToken: '' };
export const REQUESTS = { url: '', key: '' };
export const APPROVAL_HOURS = 24; // promise shown to clients

// ---- Price quote: one place for the math, used by the Anúnciate page and the sales desk (/redaccion/ → Ventas) ----
// How a campaign is priced (the "rate card"):
//  - Monthly formats: a campaign of `days` days. Shorter than a month is billed by the week: each week costs
//    WEEK_SHARE of the monthly price, and from 3 weeks on you pay the month. A month or longer is prorated by day.
//  - Per-day formats (takeover): price × days of takeover; or, bought by views, TAKEOVER_CPM per 1,000 views
//    (it owns every ad space from its start date until the views are delivered, then ends by itself).
//  - Discounts: length (DURATION_DISCOUNTS) or, for a first-time client, the launch discount on the first 3 months
//    (never both on the same months); plus combo, prepaid, nonprofit; agencies get the agency commission plus volume.
//    Together they never pass MAX_DISCOUNT.
//  - Sales desk only: special requests (`custom` lines, each with its own discount) and a negotiated extra discount
//    (% and/or $). Sales can give up to SALES_DISCOUNT_LIMIT % on their own; above that the admin approves.
export const WEEK_SHARE = 0.4;
// Monthly subscription (user, 2026-11-06): the card is charged every month until the client cancels (anytime; the
// ad runs to the end of the paid month). 15% off the monthly formats, instead of the first-time and length discounts.
export const SUBSCRIPTION_DISCOUNT = 0;
export const RENEWS = { es: '1 mes · se renueva cada mes', en: '1 month · renews every month' };
export const isRecurring = (duration: string) => /se renueva cada mes|renews every month/.test(duration || '');
// ---- Paying by views (the main way to buy display ads) ----
// Each display format has a price per 1,000 views (`cpm`). The client buys a number of views; the ad shows until they
// are delivered (a view = the ad was at least half on screen), then it stops by itself. Takeover and section
// sponsorship stay by time (they own the space for a day or a month).
// Launch (user, 2026-11-01): sell by TIME (weekly/monthly) while there's no traffic data, so we never promise views we
// can't deliver yet. Turn this on again once a month or two of real views shows how fast packages are delivered.
export const SELL_BY_VIEWS = false;
export const VIEW_PACKS = [5000, 10000, 25000, 50000, 100000];
// Takeover bought by views ("Toma total por vistas"): price per 1,000 views. A view is counted each time one of the
// brand's ads is on screen in any space, so the price sits between a single space (Rectángulo) and the exclusive spaces
// (Banner exclusivo, Media página), plus a premium for having no other brand anywhere on the site.
export const TAKEOVER_CPM = 0;
export const TAKEOVER_VIEW_PACKS = [25000, 50000, 100000, 250000];
export const VIEW_DISCOUNTS = [{ from: 25000, pct: 0 }, { from: 50000, pct: 0 }, { from: 100000, pct: 0 }];
export const LAUNCH_VIEWS = 10000; // the first-time discount covers the first 10,000 views
export const isViewFormat = (id: string) => FORMATS.some((f) => f.id === id && 'cpm' in f);
export const SALES_DISCOUNT_LIMIT = 0;
// "+ Anuncio vendido" (direct sales, user 2026-11-02): the volume discount follows VOLUME_TIERS by the sale's price,
// 5% more only when the client pays everything up front, and both together never pass DIRECT_MAX_DISCOUNT.
export const PREPAY_DISCOUNT = 0;
// Comunicados de prensa pagados (user, 2026-11-02; launch prices, "affordable for now"): published in their topic's
// section with a "Comunicado pagado" label, never as news (src/lib/comunicados.ts).
//   ready: the client sends it written (we review and format it) · written: our team writes it from their facts
export const COMUNICADO_PRICES = { ready: 0, written: 0 };
export const DIRECT_MAX_DISCOUNT = 0;
export const SPECIALS = [ // suggested prices for things clients and agencies ask for (sales can change them)
  { name: 'Artículo patrocinado (escrito por la redacción, identificado como patrocinado)', price: 0 },
  { name: 'Mención en el boletín', price: 0 },
  { name: 'Publicación en nuestras redes sociales', price: 0 },
  { name: 'Video patrocinado corto', price: 0 },
  { name: 'Cobertura de un evento', price: 0 },
  { name: 'Encuesta o concurso patrocinado', price: 0 },
  { name: 'Diseño de campaña (varias piezas)', price: 0 },
];
export type CustomLine = { name: string; qty: number; price: number; pct: number };
export type QuoteInput = {
  formats: string[]; days: number; takeoverDays: number; // days: campaign length (time-priced formats); takeoverDays: 1–14
  takeoverViews?: number; // takeover bought by views instead of days (0 or empty: by days)
  views?: number; // when set: display formats are priced by views (cpm) instead of by time
  aud: 'all' | 'island' | 'diaspora' | 'regions'; regions: number; // number of regions picked when aud = 'regions'
  who: 'retail' | 'agency' | 'nonprofit'; prepay: boolean; founder: boolean; design: boolean;
  custom?: CustomLine[]; extraPct?: number; extraAmt?: number; // sales desk only
  lang?: Lang; // labels in English for /en/advertise/
  recurring?: boolean; // monthly subscription: priced for one month, renewed by itself (SUBSCRIPTION_DISCOUNT)
};
export type Quote = {
  lines: Array<[string, number]>; discounts: Array<[string, number]>; // [label, amount]
  subtotal: number; off: number; capped: number; design: number | null; custom: Array<[string, number]>; customTotal: number;
  extra: number; extraPct: number; needsApproval: boolean; total: number; monthly: number; factor: number; months: number;
};
/** Human label for a campaign length, e.g. "2 semanas", "1 mes", "45 días". */
export function lengthLabel(days: number, lang: Lang = 'es') {
  const en = lang === 'en';
  if (days % 7 === 0 && days < 28) return days === 7 ? (en ? '1 week' : '1 semana') : `${days / 7} ${en ? 'weeks' : 'semanas'}`;
  const m = Math.round(days / 30);
  if (Math.abs(days - m * 30) <= 1 && m >= 1) return m === 1 ? (en ? '1 month' : '1 mes') : `${m} ${en ? 'months' : 'meses'}`;
  return `${days} ${en ? 'days' : 'días'}`;
}
/** Price of a monthly format for a campaign of `days` days. */
export const periodCost = (monthPrice: number, days: number) =>
  days < 30 ? monthPrice * Math.min(1, Math.ceil(Math.max(1, days) / 7) * WEEK_SHARE) : monthPrice * (days / 30);

export function quote(q: QuoteInput): Quote {
  const fmts = FORMATS.filter((f) => q.formats.includes(f.id));
  const en = q.lang === 'en', T = (es: string, eng: string) => (en ? eng : es), nm = (f: (typeof FORMATS)[number]) => formatName(f.id, q.lang);
  const days = q.recurring ? 30 : Math.max(1, Math.round(q.days)), months = days / 30, tDays = Math.max(1, Math.min(14, q.takeoverDays || 1));
  const factor = q.aud === 'all' ? AUDIENCE.all : q.aud === 'island' ? AUDIENCE.island : q.aud === 'diaspora' ? AUDIENCE.diaspora : Math.min(AUDIENCE.island, q.regions * AUDIENCE.perRegion);
  const lines: Array<[string, number]> = [];
  let monthly = 0, subtotal = 0, monthlyCost = 0; // monthlyCost: what the monthly formats cost over the whole campaign
  const views = Math.max(0, Math.round(q.views || 0));
  let viewCost = 0, cpmSum = 0; // views mode: display formats priced per 1,000 views
  for (const f of fmts) {
    if (views && 'cpm' in f) {
      const cost = (views / 1000) * (f.cpm as number);
      viewCost += cost; cpmSum += f.cpm as number;
      lines.push([`${nm(f)} · ${views.toLocaleString('en-US')} ${T('vistas', 'views')}`, Math.round(cost * 100) / 100]); subtotal += cost;
      continue;
    }
    if (f.id === 'takeover' && (q.takeoverViews ?? 0) > 0) {
      const tv = Math.round(q.takeoverViews!), cost = (tv / 1000) * TAKEOVER_CPM;
      lines.push([`${nm(f)} · ${tv.toLocaleString('en-US')} ${T('vistas', 'views')}`, Math.round(cost * 100) / 100]); subtotal += cost;
      continue;
    }
    const wide = f.per === 'día' || f.id === 'patrocinio'; // site-wide formats are not split by region
    const month = f.price * (wide ? 1 : factor);
    const cost = f.per === 'día' ? f.price * tDays : periodCost(month, days);
    if (f.per !== 'día') { monthly += month; monthlyCost += cost; }
    lines.push([`${nm(f)} · ${f.per === 'día' ? `${tDays} ${T('día', 'day')}${tDays > 1 ? 's' : ''}` : lengthLabel(days, q.lang)}`, Math.round(cost * 100) / 100]); subtotal += cost;
  }
  const discounts: Array<[string, number]> = [];
  // First time: 40% on the first 3 months of the monthly formats; the length discount covers the rest
  const launchTime = q.founder && !q.recurring ? monthlyCost * Math.min(1, LAUNCH_DISCOUNT.months / months) : 0;
  const launchViews = q.founder && views ? (Math.min(views, LAUNCH_VIEWS) / 1000) * cpmSum : 0;
  if (launchTime + launchViews) discounts.push([`${T('Primera vez', 'First time')} (${LAUNCH_DISCOUNT.pct}%)`, (launchTime + launchViews) * LAUNCH_DISCOUNT.pct / 100]);
  if (q.recurring && monthlyCost > 0) discounts.push([`${T('Suscripción mensual', 'Monthly subscription')} (${SUBSCRIPTION_DISCOUNT}%)`, monthlyCost * SUBSCRIPTION_DISCOUNT / 100]);
  const dur = q.recurring ? undefined : [...DURATION_DISCOUNTS].reverse().find((x) => days >= x.months * 30 - 2);
  if (dur && monthlyCost - launchTime > 0) discounts.push([`${dur.months} ${T('meses', 'months')} (${dur.pct}%)`, (monthlyCost - launchTime) * dur.pct / 100]);
  const vd = [...VIEW_DISCOUNTS].reverse().find((x) => views >= x.from);
  if (vd && viewCost - launchViews > 0) discounts.push([`${views.toLocaleString('en-US')} ${T('vistas', 'views')} (${vd.pct}%)`, (viewCost - launchViews) * vd.pct / 100]);
  const pct = (label: string, p: number) => discounts.push([`${label} (${p}%)`, subtotal * p / 100]);
  if (fmts.length >= 2) pct(T('Más de un anuncio', 'More than one ad'), OTHER_DISCOUNTS.find((x) => x.id === 'combo')!.pct);
  if (q.prepay) pct(T('Pago completo', 'Full payment'), OTHER_DISCOUNTS.find((x) => x.id === 'prepago')!.pct);
  if (q.who === 'nonprofit') pct(T('Sin fines de lucro', 'Nonprofit'), OTHER_DISCOUNTS.find((x) => x.id === 'nonprofit')!.pct);
  if (q.who === 'agency') {
    pct(T('Comisión de agencia', 'Agency commission'), AGENCY_COMMISSION);
    const v = [...VOLUME_TIERS].reverse().find((x) => subtotal >= x.from); if (v) pct(T('Volumen', 'Volume'), v.pct);
  }
  const want = discounts.reduce((a, [, x]) => a + x, 0);
  const off = Math.min(subtotal * MAX_DISCOUNT / 100, want);
  const design = q.design && fmts.length ? DESIGN_FEE : null; // always charged when we design it
  const standard = Math.max(0, subtotal - off + (design ?? 0));
  // Sales desk: special requests and a negotiated discount
  const custom: Array<[string, number]> = (q.custom ?? []).filter((c) => c.name && c.qty > 0).map((c) => [`${c.name}${c.qty > 1 ? ` × ${c.qty}` : ''}${c.pct ? ` (−${c.pct}%)` : ''}`, c.qty * c.price * (1 - Math.min(100, c.pct || 0) / 100)]);
  const customTotal = custom.reduce((a, [, x]) => a + x, 0);
  const extraPct = Math.max(0, Math.min(100, q.extraPct || 0));
  const extra = Math.min(standard + customTotal, (standard + customTotal) * extraPct / 100 + Math.max(0, q.extraAmt || 0));
  const total = Math.max(0, standard + customTotal - extra);
  const listPrice = subtotal + (design ?? 0) + (q.custom ?? []).reduce((a, c) => a + c.qty * c.price, 0);
  const negotiated = listPrice ? ((listPrice - total) - off) / listPrice * 100 : 0; // what sales gave on top of the standard discounts
  return { lines, discounts, subtotal, off, capped: want - off, design, custom, customTotal, extra, extraPct, needsApproval: negotiated > SALES_DISCOUNT_LIMIT + 0.01,
    total: Math.round(total * 100) / 100, monthly, factor, months };
}
