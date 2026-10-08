/* =========================================================
   ADVERTISING: prices, discounts, regions, direct campaigns and Google fill.
   Edit this file to change what the Anúnciate page shows and which ads run.
   ========================================================= */

export type AdSize = 'leaderboard' | 'rectangle' | 'halfpage' | 'infeed';

// ---- Prices (USD per month unless `per` says otherwise) ----
// NotiCel: every price, discount and commission below is 0 on purpose. This folder keeps no prices or deal terms
// (CLAUDE.md), and these numbers were Noticias Xtra's. NotiCel's sales team sets its own when the ads go live.
// `art`: the image sizes (width × height) the client uploads, or that we create for them.
export const FORMATS = [
  { id: 'valla', name: 'Valla digital', size: 'Banner superior, rota con otras marcas', price: 0, cpm: 0, per: 'mes', slots: ['leaderboard'] as AdSize[], where: 'Banner de arriba y de abajo en todas las páginas, rotando con otras marcas.',
    about: 'Tu anuncio rota cada 8 segundos con hasta 3 marcas más. La forma más barata de empezar.', art: [[728, 90], [320, 100]], popular: false },
  { id: 'rectangle', name: 'Rectángulo', size: '300 × 250', price: 0, cpm: 0, per: 'mes', slots: ['rectangle'] as AdSize[], where: 'Al lado de las noticias en computadora y entre el contenido en celular: portada, noticias, secciones, Deportes, juegos y foro.',
    about: 'Al lado de las noticias, Deportes y los juegos. Se ve igual en celular.', art: [[300, 250]], popular: true },
  { id: 'infeed', name: 'Entre noticias', size: '728 × 90', price: 0, cpm: 0, per: 'mes', slots: ['infeed'] as AdSize[], where: 'Entre las noticias de la portada y de las secciones, y al final de cada noticia.',
    about: 'Entre las noticias de la portada y al final de cada noticia.', art: [[728, 90], [320, 100]], popular: false },
  { id: 'leaderboard', name: 'Banner exclusivo', size: '728 × 90', price: 0, cpm: 0, per: 'mes', slots: ['leaderboard'] as AdSize[], where: 'Banner de arriba y de abajo en todas las páginas, solo tu marca.',
    about: 'El banner de arriba, solo para tu marca (sin rotar).', art: [[728, 90], [320, 100]], popular: false },
  { id: 'halfpage', name: 'Media página', size: '300 × 600', price: 0, cpm: 0, per: 'mes', slots: ['halfpage'] as AdSize[], where: 'Columna derecha de las noticias, Deportes y los juegos (solo en computadora).',
    about: 'El espacio más grande; se queda a la vista al bajar. Solo en computadora.', art: [[300, 600]], popular: false },
  { id: 'patrocinio', name: 'Patrocinio de sección', size: 'Juegos, Deportes, Clima…', price: 0, per: 'mes', slots: [] as AdSize[], where: 'Todos los espacios de anuncios, con “Presentado por” tu marca.',
    about: '“Presentado por” tu marca y todos los espacios de una sección.', art: [[300, 250], [728, 90]], popular: false },
  { id: 'takeover', name: 'Toma de portada', size: 'Todo el sitio, por días o por vistas', price: 0, per: 'día', slots: [] as AdSize[], where: 'Todos los espacios del sitio, solo tu marca: por los días que escojas o hasta cumplir las vistas.',
    about: 'Todos los espacios del sitio con tu marca: por días, o hasta cumplir un número de vistas.', art: [[300, 250], [728, 90], [300, 600]], popular: false },
];
export const DESIGN_FEE = 0; // we create the ad from the client's text and logo
export const DESIGN_FREE_FROM_MONTHS = 3; // ...free in campaigns this long or longer
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
  { id: 'prepago', pct: 0, text: 'Pago completo por adelantado' },
  { id: 'nonprofit', pct: 0, text: 'Organizaciones sin fines de lucro' },
];
export const MAX_DISCOUNT = 0; // discounts add up to this cap
// Free ads after the total spent (lifetime, per client)
export const REWARDS: Array<{ at: number; gift: string }> = []; // NotiCel sets its own (see the note on prices)
// Agencies and big brands: discount by yearly volume
export const VOLUME_TIERS = [
  { from: 1000, pct: 0 }, { from: 2500, pct: 0 }, { from: 5000, pct: 0 }, { from: 10000, pct: 0 },
];
export const AGENCY_COMMISSION = 0;

// ---- Direct campaigns (paid by our clients). They always show before Google ads. ----
// One entry per campaign. `regions`: 'all' | 'island' (readers in Puerto Rico) | 'diaspora'.
// `takeover: true` gives that campaign every ad space while it runs (and `skin`, an optional page background).
// Images go in public/anuncios/. Several creatives in one campaign rotate like a billboard.
export type Creative = { img: string; url: string; alt: string; w?: number; h?: number }; // w/h: the image size (also read from names like ...-300x250.png)
export type Campaign = {
  id: string; client: string; sizes: AdSize[]; start: string; end: string;
  regions?: 'all' | 'island' | 'diaspora'; creatives: Creative[]; weight?: number; takeover?: boolean; skin?: string;
  views?: number; // paid views: the campaign stops by itself once this many views are delivered (counted in the backend)
};
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
//  - stripeLink: a Stripe Payment Link (https://buy.stripe.com/…) made with "Customers choose what to pay"
//    (cards, Apple Pay, Google Pay). In its "After payment" settings, choose "Don't show confirmation page" and
//    redirect to https://noticel.com/publicidad/?pagado=1
//  - athMovilToken: the PUBLIC token from ATH Business (Settings → API Keys). Never put the private token here.
//  - requestsUrl: where requests (with the uploaded files) are saved for the employee who approves them.
export const PAYMENTS = { stripeLink: '', athMovilToken: '' };
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
// ---- Paying by views (the main way to buy display ads) ----
// Each display format has a price per 1,000 views (`cpm`). The client buys a number of views; the ad shows until they
// are delivered (a view = the ad was at least half on screen), then it stops by itself. Takeover and section
// sponsorship stay by time (they own the space for a day or a month).
export const VIEW_PACKS = [5000, 10000, 25000, 50000, 100000];
export const TAKEOVER_CPM = 0; // takeover bought by views: price per 1,000 views (every ad space is theirs)
export const TAKEOVER_VIEW_PACKS = [25000, 50000, 100000, 250000];
export const VIEW_DISCOUNTS = [{ from: 25000, pct: 0 }, { from: 50000, pct: 0 }, { from: 100000, pct: 0 }];
export const LAUNCH_VIEWS = 10000; // the first-time discount covers the first 10,000 views
export const isViewFormat = (id: string) => FORMATS.some((f) => f.id === id && 'cpm' in f);
export const SALES_DISCOUNT_LIMIT = 0;
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
};
export type Quote = {
  lines: Array<[string, number]>; discounts: Array<[string, number]>; // [label, amount]
  subtotal: number; off: number; capped: number; design: number | null; custom: Array<[string, number]>; customTotal: number;
  extra: number; extraPct: number; needsApproval: boolean; total: number; monthly: number; factor: number; months: number;
};
/** Human label for a campaign length, e.g. "2 semanas", "1 mes", "45 días". */
export function lengthLabel(days: number) {
  if (days % 7 === 0 && days < 28) return days === 7 ? '1 semana' : `${days / 7} semanas`;
  const m = Math.round(days / 30);
  if (Math.abs(days - m * 30) <= 1 && m >= 1) return m === 1 ? '1 mes' : `${m} meses`;
  return `${days} días`;
}
/** Price of a monthly format for a campaign of `days` days. */
export const periodCost = (monthPrice: number, days: number) =>
  days < 30 ? monthPrice * Math.min(1, Math.ceil(Math.max(1, days) / 7) * WEEK_SHARE) : monthPrice * (days / 30);

export function quote(q: QuoteInput): Quote {
  const fmts = FORMATS.filter((f) => q.formats.includes(f.id));
  const days = Math.max(1, Math.round(q.days)), months = days / 30, tDays = Math.max(1, Math.min(14, q.takeoverDays || 1));
  const factor = q.aud === 'all' ? AUDIENCE.all : q.aud === 'island' ? AUDIENCE.island : q.aud === 'diaspora' ? AUDIENCE.diaspora : Math.min(AUDIENCE.island, q.regions * AUDIENCE.perRegion);
  const lines: Array<[string, number]> = [];
  let monthly = 0, subtotal = 0, monthlyCost = 0; // monthlyCost: what the monthly formats cost over the whole campaign
  const views = Math.max(0, Math.round(q.views || 0));
  let viewCost = 0, cpmSum = 0; // views mode: display formats priced per 1,000 views
  for (const f of fmts) {
    if (views && 'cpm' in f) {
      const cost = (views / 1000) * (f.cpm as number);
      viewCost += cost; cpmSum += f.cpm as number;
      lines.push([`${f.name} · ${views.toLocaleString('en-US')} vistas`, Math.round(cost * 100) / 100]); subtotal += cost;
      continue;
    }
    if (f.id === 'takeover' && (q.takeoverViews ?? 0) > 0) {
      const tv = Math.round(q.takeoverViews!), cost = (tv / 1000) * TAKEOVER_CPM;
      lines.push([`${f.name} · ${tv.toLocaleString('en-US')} vistas`, Math.round(cost * 100) / 100]); subtotal += cost;
      continue;
    }
    const wide = f.per === 'día' || f.id === 'patrocinio'; // site-wide formats are not split by region
    const month = f.price * (wide ? 1 : factor);
    const cost = f.per === 'día' ? f.price * tDays : periodCost(month, days);
    if (f.per !== 'día') { monthly += month; monthlyCost += cost; }
    lines.push([`${f.name} · ${f.per === 'día' ? `${tDays} día${tDays > 1 ? 's' : ''}` : lengthLabel(days)}`, Math.round(cost * 100) / 100]); subtotal += cost;
  }
  const discounts: Array<[string, number]> = [];
  // First time: 40% on the first 3 months of the monthly formats; the length discount covers the rest
  const launchTime = q.founder ? monthlyCost * Math.min(1, LAUNCH_DISCOUNT.months / months) : 0;
  const launchViews = q.founder && views ? (Math.min(views, LAUNCH_VIEWS) / 1000) * cpmSum : 0;
  if (launchTime + launchViews) discounts.push([`Primera vez (${LAUNCH_DISCOUNT.pct}%)`, (launchTime + launchViews) * LAUNCH_DISCOUNT.pct / 100]);
  const dur = [...DURATION_DISCOUNTS].reverse().find((x) => days >= x.months * 30 - 2);
  if (dur && monthlyCost - launchTime > 0) discounts.push([`${dur.months} meses (${dur.pct}%)`, (monthlyCost - launchTime) * dur.pct / 100]);
  const vd = [...VIEW_DISCOUNTS].reverse().find((x) => views >= x.from);
  if (vd && viewCost - launchViews > 0) discounts.push([`${views.toLocaleString('en-US')} vistas (${vd.pct}%)`, (viewCost - launchViews) * vd.pct / 100]);
  const pct = (label: string, p: number) => discounts.push([`${label} (${p}%)`, subtotal * p / 100]);
  if (fmts.length >= 2) pct('Más de un anuncio', OTHER_DISCOUNTS.find((x) => x.id === 'combo')!.pct);
  if (q.prepay) pct('Pago completo', OTHER_DISCOUNTS.find((x) => x.id === 'prepago')!.pct);
  if (q.who === 'nonprofit') pct('Sin fines de lucro', OTHER_DISCOUNTS.find((x) => x.id === 'nonprofit')!.pct);
  if (q.who === 'agency') {
    pct('Comisión de agencia', AGENCY_COMMISSION);
    const v = [...VOLUME_TIERS].reverse().find((x) => subtotal >= x.from); if (v) pct('Volumen', v.pct);
  }
  const want = discounts.reduce((a, [, x]) => a + x, 0);
  const off = Math.min(subtotal * MAX_DISCOUNT / 100, want);
  const design = q.design && fmts.length ? (months >= DESIGN_FREE_FROM_MONTHS - 0.05 || views >= 25000 ? 0 : DESIGN_FEE) : null;
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
