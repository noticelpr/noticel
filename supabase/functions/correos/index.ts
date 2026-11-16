// NotiCel copy of Noticias Xtra's function (2026-11-15). NotiCel's settings come from Supabase secrets, never this
// public code: SITE_URL (the test site until switch day, then https://noticel.com), MAIL_FROM / TEAM_EMAIL (correos),
// RESEND_API_KEY, STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (pagos: NotiCel's own Stripe account).
// Supabase Edge Function "correos": the automatic emails to advertisers (and a heads-up to the sales team).
// It never trusts what the caller sends: each run reads the ad requests and campaigns from the database and sends
// only the emails that are due and haven't gone out yet (table `email_log`, supabase/correos.sql). So it's safe to
// call any time: the database runs it every 10 minutes (Cron), and the site calls it right after an order or an
// approval so those emails arrive at once.
//
// Emails: solicitud recibida · necesita cambios · aprobada · rechazada · en el aire · termina en 3 días ·
// resultados al terminar · (to the team) nueva solicitud and "quiere hablar con alguien".
// Language: client emails go in English when the request's client has `lang: 'en'` (ordered from /en/advertise/, or
// a direct sale marked English); Spanish otherwise. Team emails stay in Spanish, with a note when the client is English-speaking.
// The templates (TEMPLATES below) are also shown in the panel's preview page, /redaccion/correos/.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor → name "correos" → paste this file.
// Secret: RESEND_API_KEY (Edge Functions → Secrets), from resend.com, with the noticel.com domain verified there.
// Other secrets: SITE_URL, MAIL_FROM (sender, default below), TEAM_EMAIL (sales inbox: team emails and replies), REPLY_TO (optional).

// Settings from Supabase secrets; the site's email preview page (src/pages/redaccion/correos.astro) imports these
// templates outside Supabase, where there are no secrets: then the defaults below are used
const env = (k: string): string => (typeof Deno !== 'undefined' ? Deno.env.get(k) ?? '' : '');
const SITE = (env('SITE_URL') || 'https://noticel.com').replace(/\/$/, '');
const DEFAULT_FROM = env('MAIL_FROM') || 'NotiCel <anuncios@noticel.com>';
const DEFAULT_TEAM = env('TEAM_EMAIL') || ''; // NotiCel's sales inbox; replies go here too
// NotiCel's logo travels inside each email (an inline attachment, 280 px PNG of public/logo.png), so it shows even when
// the email app blocks outside images and before noticel.com points at the new site. The preview page swaps it for /logo.png.
const LOGO = 'cid:nc-logo';
export const LOGO_PNG_BASE64 = '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';
const PURPLE = '#000000', BLUE = '#009DE9', INK = '#16161D', MUTED = '#5C5F6E', LINE = '#E2E3EA';

export const FORMAT_NAMES: Record<string, string> = {
  valla: 'Valla digital', rectangle: 'Rectángulo', cuadrado: 'Cuadrado', infeed: 'Entre noticias', leaderboard: 'Banner exclusivo',
  halfpage: 'Media página', patrocinio: 'Patrocinio de sección', takeover: 'Toma de portada', comunicado: 'Comunicado de prensa',
};
export const FORMAT_NAMES_EN: Record<string, string> = {
  valla: 'Digital billboard', rectangle: 'Rectangle', cuadrado: 'Square', infeed: 'Between stories', leaderboard: 'Exclusive banner',
  halfpage: 'Half page', patrocinio: 'Section sponsorship', takeover: 'Home page takeover', comunicado: 'Paid press release',
};

/* ---------------- templates ---------------- */

export type Req = {
  id: string; status: string; paid: boolean; client: { name?: string; business?: string; email?: string; phone?: string; lang?: string };
  formats: string[]; placement?: string | null; start?: string | null; duration?: string | null; total: number; note?: string | null;
  lines?: string[] | null; // a direct sale (Ventas → "+ Anuncio vendido") starts with "Venta directa", then "Pago: …", "Factura: …", "Acordado: …", "Vendido por: …"
};
export type Camp = { id: string; start_date: string; end_date: string; status: string; creatives?: { img: string }[] };
export type Stats = { views: number; clicks: number };
export type Month = { n: number; from: string; to: string; views: number }; // one paid month of a monthly subscription
export type Lead = { business?: string; contact?: string; email?: string; phone?: string; requests?: string; lang?: string };
export type Mail = { subject: string; html: string };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const num = (n: number, en = false) => Number(n || 0).toLocaleString(en ? 'en-US' : 'es-PR');
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const day = (iso?: string | null) => { const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${Number(m[3])} de ${MONTHS[Number(m[2]) - 1]} de ${m[1]}` : ''; };
/** "November 2, 2026" */
const dayEn = (iso?: string | null) => { const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${MONTHS_EN[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : ''; };
/** The client reads English (requests from /en/advertise/, or a direct sale marked English). */
export const isEn = (r: { client?: { lang?: string } | null }) => r.client?.lang === 'en';
const fmts = (r: Req, en = false) => r.formats.map((f) => (en ? FORMAT_NAMES_EN : FORMAT_NAMES)[f] ?? f).join(', ');
const hi = (r: Req) => `Hola${r.client.name ? ` ${esc(r.client.name.split(' ')[0])}` : ''}:`;
const hiEn = (r: Req) => `Hi${r.client.name ? ` ${esc(r.client.name.split(' ')[0])}` : ''},`;
const PANEL = `${SITE}/publicidad/panel/`;
const PANEL_EN = `${SITE}/publicidad/panel/?lang=en`;
/** Durations and places are stored in Spanish ("1 mes", "10,000 vistas", "3 días de toma de portada"): read in English. */
const durEn = (t?: string | null) => String(t ?? '')
  .replace(/toma de portada/gi, 'home page takeover').replace(/\bde home page takeover/g, 'of home page takeover').replace(/\bhasta\b/g, 'up to')
  .replace(/\bdías(?=\W|$)/g, 'days').replace(/\bdía(?=\W|$)/g, 'day').replace(/\bsemanas\b/g, 'weeks').replace(/\bsemana\b/g, 'week')
  .replace(/\bmeses\b/g, 'months').replace(/\bmes\b/g, 'month').replace(/\bvistas\b/g, 'views');
const PLACES_EN: Record<string, string> = { 'Puerto Rico y la diáspora': 'Puerto Rico and the diaspora', 'Solo Puerto Rico': 'Puerto Rico only', 'Solo la diáspora': 'The diaspora only' };
const placeEn = (t?: string | null) => PLACES_EN[String(t ?? '')] ?? String(t ?? '');
const PAY_EN: Record<string, string> = { Pendiente: 'Pending', Tarjeta: 'Card', Transferencia: 'Bank transfer', Cheque: 'Check', Efectivo: 'Cash',
  'Factura a la agencia': 'Invoiced to the agency', 'Intercambio (canje)': 'Trade (barter)', 'Cortesía': 'Complimentary', Otra: 'Other' };
/** A direct sale's detail line ("Pago", "Factura", "Acordado", "Vendido por"), from the request's lines. */
const raw = (r: Req, k: string) => (r.lines ?? []).find((x) => x.startsWith(`${k}: `))?.slice(k.length + 2) ?? '';
const line = (r: Req, k: string) => raw(r, k).replace(/\d{4}-\d{2}-\d{2}/g, (d) => day(d)); // dates read as words
const lineEn = (r: Req, k: string) => raw(r, k).replace(/^[^·]+/, (m) => PAY_EN[m.trim()] ? `${PAY_EN[m.trim()]} ` : m).replace(/\d{4}-\d{2}-\d{2}/g, (d) => dayEn(d)).trim();
export const isDirect = (r: Req) => (r.lines ?? [])[0]?.startsWith('Venta directa') ?? false;
const when = (r: Req, c?: Camp) => (/vistas/.test(r.duration ?? '') ? [['Vistas', r.duration ?? ''], ['Desde', day(c?.start_date ?? r.start)]] : [['Desde', day(c?.start_date ?? r.start)], ['Hasta', day(c?.end_date)]]) as [string, string][];
const whenEn = (r: Req, c?: Camp) => (/vistas/.test(r.duration ?? '') ? [['Views', durEn(r.duration)], ['From', dayEn(c?.start_date ?? r.start)]] : [['From', dayEn(c?.start_date ?? r.start)], ['Until', dayEn(c?.end_date)]]) as [string, string][];

/** The shared frame: purple header with the name, white card, button, small footer. Tables and inline styles,
 *  because email apps (Gmail, Outlook, iPhone Mail) ignore most modern CSS. */
function frame(title: string, body: string, button?: { text: string; url: string }, preheader = '', en = false): string {
  const btn = button ? `<tr><td style="padding:8px 28px 28px"><a href="${esc(button.url)}" style="display:inline-block;background:${PURPLE};color:#fff;font-weight:bold;font-size:16px;padding:13px 26px;border-radius:999px;text-decoration:none">${esc(button.text)}</a></td></tr>` : '';
  return `<!doctype html><html lang="${en ? 'en' : 'es'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only}</style><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F3F3F8" bgcolor="#F3F3F8">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F3F8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:${INK}">
<tr><td style="padding:20px 28px 16px;border-bottom:4px solid ${PURPLE}"><a href="${SITE}" style="text-decoration:none"><img src="${LOGO}" width="140" height="59" alt="NotiCel" style="display:block;border:0;width:140px;height:59px;color:${PURPLE};font-size:22px;font-weight:bold"></a></td></tr>
<tr><td style="background:${BLUE};height:3px;line-height:3px;font-size:0">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 8px"><h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:${PURPLE}">${esc(title)}</h1>${body}</td></tr>
${btn}
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${LINE};font-size:12px;line-height:1.5;color:${MUTED}">${en ? 'Questions? Just reply to this email and we&rsquo;ll help.' : '¿Preguntas? Contesta este correo y te ayudamos.'}<br>NotiCel · <a href="${SITE}" style="color:${MUTED}">noticel.com</a> · <a href="${SITE}/${en ? 'en/advertiser-terms' : 'terminos-anunciantes'}/" style="color:${MUTED}">${en ? 'Advertiser terms' : 'Términos para anunciantes'}</a></td></tr>
</table></td></tr></table></body></html>`;
}
const p = (t: string) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55">${t}</p>`;
const rows = (list: [string, string][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border:1px solid ${LINE};border-radius:10px;font-size:15px">${list
  .filter(([, v]) => v).map(([k, v], i) => `<tr><td style="padding:10px 14px;color:${MUTED};${i ? `border-top:1px solid ${LINE};` : ''}width:40%">${esc(k)}</td><td style="padding:10px 14px;font-weight:bold;${i ? `border-top:1px solid ${LINE};` : ''}">${esc(v)}</td></tr>`).join('')}</table>`;
const box = (t: string) => `<div style="margin:0 0 16px;padding:12px 14px;background:#F3F3F8;border-left:4px solid ${BLUE};border-radius:6px;font-size:15px;line-height:1.5">${t}</div>`;
const pic = (c?: Camp, en = false) => (c?.creatives?.[0]?.img && /^https:/.test(c.creatives[0].img) ? `<p style="margin:0 0 16px"><img src="${esc(c.creatives[0].img)}" alt="${en ? 'Your ad' : 'Tu anuncio'}" style="max-width:100%;height:auto;border:1px solid ${LINE};border-radius:8px"></p>` : '');
const summary = (r: Req) => rows([['Negocio', r.client.business ?? ''], ['Formato', fmts(r)], ['Dónde', r.placement ?? ''], ['Empieza', day(r.start)], ['Duración', r.duration ?? ''], ['Total', money(r.total)]]);
const summaryEn = (r: Req) => rows([['Business', r.client.business ?? ''], ['Format', fmts(r, true)], ['Where', placeEn(r.placement)], ['Starts', dayEn(r.start)], ['Length', durEn(r.duration)], ['Total', money(r.total)]]);
/** Team emails: a visible note when the client reads English (their emails go in English). */
const enNote = (r: { client?: { lang?: string } | null }) => (isEn(r) ? box('<b>Cliente en inglés / English-speaking client.</b> Sus correos automáticos le llegan en inglés; contéstale en inglés.') : '');
const stat = (s: Stats, en = false) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;text-align:center"><tr>
<td style="padding:14px;background:#F3F3F8;border-radius:10px"><div style="font-size:28px;font-weight:bold;color:${PURPLE}">${num(s.views, en)}</div><div style="font-size:13px;color:${MUTED}">${en ? 'views' : 'vistas'}</div></td><td width="12"></td>
<td style="padding:14px;background:#F3F3F8;border-radius:10px"><div style="font-size:28px;font-weight:bold;color:${PURPLE}">${num(s.clicks, en)}</div><div style="font-size:13px;color:${MUTED}">${en ? 'clicks' : 'clics'}</div></td></tr></table>`;

/** The rejection email's money line: refunded already (card, "Reembolso: …" from the pagos function), on its way
 *  (paid another way: the team refunds by hand), or nothing (not paid). */
const refundLine = (r: Req, en = false) => {
  const done = raw(r, 'Reembolso');
  const amt = done.match(/\$[\d,.]+/)?.[0] ?? money(r.total), sub = /suscripción cancelada/.test(done);
  if (done) return en
    ? `We already refunded <b>${amt}</b> to your card${sub ? ' and cancelled the monthly charge' : ''}. It can take 5 to 10 business days to show on your statement.`
    : `Ya te devolvimos <b>${amt}</b> a tu tarjeta${sub ? ' y cancelamos el cobro mensual' : ''}. Puede tardar de 5 a 10 días laborables en verse en tu estado de cuenta.`;
  if (r.paid) return en ? `We will refund 100% of what you paid (${money(r.total)}); our team will contact you to do it.` : `Te devolvemos el 100 % de lo que pagaste (${money(r.total)}); nuestro equipo te escribe para hacerlo.`;
  return '';
};

const ES = {
  recibida: (r: Req): Mail => ({
    subject: 'Recibimos tu solicitud de anuncio',
    html: frame('¡Recibimos tu solicitud!', p(hi(r)) + p('Gracias por anunciarte en NotiCel. Nuestro equipo revisará tu anuncio y te contestaremos en <b>1 día laborable</b>.') + summary(r)
      + p(`Puedes ver cómo va en tu panel de anunciante. Entra con este mismo correo (${esc(r.client.email)}).`), { text: 'Ver mi panel', url: PANEL }, 'Te contestamos en 1 día laborable.'),
  }),
  cambios: (r: Req): Mail => ({
    subject: 'Tu anuncio necesita un cambio',
    html: frame('Tu anuncio necesita un cambio', p(hi(r)) + p('Revisamos tu anuncio y necesitamos un pequeño cambio antes de publicarlo:')
      + box(esc(r.note || 'Contesta este correo y te explicamos qué hace falta.')) + p('Contesta este correo con el cambio (o la imagen nueva) y lo publicamos en cuanto esté listo.'), undefined, 'Un pequeño cambio y lo publicamos.'),
  }),
  aprobada: (r: Req, c?: Camp): Mail => ({
    subject: '¡Tu anuncio fue aprobado!',
    html: frame('¡Tu anuncio fue aprobado!', p(hi(r)) + p(`Tu anuncio de <b>${esc(r.client.business)}</b> está aprobado${c && c.start_date > today() ? ` y empieza a salir el <b>${day(c.start_date)}</b>` : ' y ya sale en NotiCel'}.`)
      + pic(c) + rows([['Formato', fmts(r)], ['Desde', day(c?.start_date ?? r.start)], ['Hasta', day(c?.end_date)], ['Total', money(r.total)]])
      + (r.paid ? '' : p('Nuestro equipo te contactará para completar el pago antes de que empiece.'))
      + p('En tu panel de anunciante ves las vistas y los clics de tu campaña.'), { text: 'Ver mi campaña', url: PANEL }, 'Tu anuncio está aprobado.'),
  }),
  rechazada: (r: Req): Mail => ({
    subject: 'Sobre tu solicitud de anuncio',
    html: frame('No pudimos aprobar tu anuncio', p(hi(r)) + p('Gracias por tu interés en NotiCel. Revisamos tu solicitud y esta vez no la podemos publicar.')
      + (r.note ? box(esc(r.note)) : '') + (refundLine(r) ? p(refundLine(r)) : '') + p('Si quieres hacer cambios e intentarlo otra vez, contesta este correo y te ayudamos.'), undefined, 'Sobre tu solicitud de anuncio.'),
  }),
  aire: (r: Req, c: Camp): Mail => ({
    subject: 'Tu anuncio ya está en el aire',
    html: frame('Tu anuncio ya está en el aire', p(hi(r)) + p(`Desde hoy, tu anuncio de <b>${esc(r.client.business)}</b> sale en NotiCel hasta el <b>${day(c.end_date)}</b>.`)
      + pic(c) + p('Entra a tu panel cuando quieras para ver cuántas personas lo han visto y cuántas le han dado clic.'), { text: 'Ver mis resultados', url: PANEL }, `Sale hasta el ${day(c.end_date)}.`),
  }),
  pronto: (r: Req, c: Camp, s: Stats): Mail => ({
    subject: `Tu campaña termina el ${day(c.end_date).replace(/ de \d{4}$/, '')}`,
    html: frame('Tu campaña termina pronto', p(hi(r)) + p(`Tu anuncio de <b>${esc(r.client.business)}</b> sale hasta el <b>${day(c.end_date)}</b>. Así va hasta ahora:`)
      + stat(s) + p('¿Quieres seguir? Renueva con el mismo anuncio y no pierdes tu espacio. Contesta este correo o pide tu próxima campaña en Anúnciate.'), { text: 'Renovar mi anuncio', url: `${SITE}/publicidad/` }, 'Renueva y no pierdas tu espacio.'),
  }),
  fin: (r: Req, c: Camp, s: Stats): Mail => ({
    subject: 'Los resultados de tu campaña',
    html: frame('Los resultados de tu campaña', p(hi(r)) + p(`Tu campaña de <b>${esc(r.client.business)}</b> terminó el ${day(c.end_date)}. ¡Gracias por anunciarte con nosotros! Estos son los resultados:`)
      + stat(s) + rows([['Formato', fmts(r)], ['Desde', day(c.start_date)], ['Hasta', day(c.end_date)]])
      + p('¿Repetimos? Pide tu próxima campaña cuando quieras; tu anuncio ya está listo.'), { text: 'Repetir mi campaña', url: `${SITE}/publicidad/` }, 'Gracias por anunciarte con nosotros.'),
  }),
  // Monthly subscription (user, 2026-11-06): the numbers of each paid month, instead of "ends soon"
  mes: (r: Req, c: Camp, s: Stats, m: Month): Mail => ({
    subject: `Tu mes ${m.n} en NotiCel: ${num(m.views)} vistas`,
    html: frame(`Tu mes ${m.n} en NotiCel`, p(hi(r)) + p(`Así le fue a tu anuncio de <b>${esc(r.client.business)}</b> del ${day(m.from)} al ${day(m.to)}:`)
      + `<p style="text-align:center;margin:4px 0 6px"><span style="font-size:32px;font-weight:bold;color:${PURPLE}">${num(m.views)}</span><br><span style="font-size:13px;color:${MUTED}">vistas este mes</span></p>`
      + p('Desde que empezaste:') + stat(s)
      + p('Tu anuncio sigue saliendo y se renueva solo cada mes. Si quieres cambiar el arte o cancelar, contesta este correo.'), { text: 'Ver mis resultados', url: PANEL }, `${num(m.views)} vistas este mes.`),
  }),
  // Direct sale (Ventas → "+ Anuncio vendido"): the deal in writing, like a receipt
  venta: (r: Req, c?: Camp): Mail => ({
    subject: 'Tu campaña con NotiCel está confirmada',
    html: frame('¡Tu campaña está confirmada!', p(hi(r)) + p('Gracias por anunciarte en NotiCel. Estos son los detalles de lo que acordamos:')
      + rows([['Negocio', r.client.business ?? ''], ['Espacios', fmts(r)], ...when(r, c), ['Dónde', r.placement ?? ''], ['Total', money(r.total)], ['Pago', line(r, 'Pago') || (r.paid ? 'Recibido' : 'Pendiente')], ['Factura o recibo', line(r, 'Factura')]])
      + (line(r, 'Acordado') ? box(`<b>Lo acordado:</b> ${esc(line(r, 'Acordado'))}`) : '')
      + p(`Puedes ver las vistas y los clics de tu campaña en tu panel de anunciante. Entra con este mismo correo (${esc(r.client.email)}).`), { text: 'Ver mi campaña', url: PANEL }, 'Los detalles de tu campaña.'),
  }),
  ventaEquipo: (r: Req): Mail => ({
    subject: `Venta directa: ${r.client.business ?? ''} (${money(r.total)})${line(r, 'Vendido por') ? ` · ${line(r, 'Vendido por')}` : ''}`,
    html: frame('Venta directa registrada', p('Se publicó un anuncio vendido directamente (Ventas → Anuncio vendido). Copia para el récord:')
      + rows([['Negocio', r.client.business ?? ''], ['Contacto', r.client.name ?? ''], ['Correo', r.client.email ?? ''], ['Teléfono', r.client.phone ?? ''], ['Espacios', fmts(r)], ...when(r), ['Total', money(r.total)], ['Pago', line(r, 'Pago')], ['Factura', line(r, 'Factura')], ['Vendido por', line(r, 'Vendido por')]])
      + (line(r, 'Acordado') ? box(`<b>Lo acordado:</b> ${esc(line(r, 'Acordado'))}`) : '') + enNote(r), { text: 'Abrir Ventas', url: `${SITE}/redaccion/#ventas` }),
  }),
  // To the sales team
  equipo: (r: Req): Mail => ({
    subject: `Nueva solicitud de anuncio: ${r.client.business ?? ''} (${money(r.total)})`,
    html: frame('Nueva solicitud de anuncio', p('Llegó una solicitud nueva para revisar en el panel (Anuncios).') + enNote(r) + summary(r)
      + rows([['Contacto', r.client.name ?? ''], ['Correo', r.client.email ?? ''], ['Teléfono', r.client.phone ?? ''], ['Pagado', r.paid ? 'Sí' : 'No']]), { text: 'Revisar en el panel', url: `${SITE}/redaccion/#anuncios` }),
  }),
  lead: (l: Lead): Mail => ({
    subject: `Quiere hablar con alguien: ${l.business || l.contact || 'cliente nuevo'}`,
    html: frame('Un cliente quiere hablar con alguien', p('Alguien usó «Prefiero hablar con alguien» en Anúnciate. Está en el panel (Ventas).')
      + (l.lang === 'en' ? enNote({ client: { lang: 'en' } }) : '') + rows([['Negocio', l.business ?? ''], ['Contacto', l.contact ?? ''], ['Correo', l.email ?? ''], ['Teléfono', l.phone ?? '']]) + (l.requests ? box(esc(l.requests)) : ''), { text: 'Abrir Ventas', url: `${SITE}/redaccion/#ventas` }),
  }),
};

/** English versions of the client emails (same structure as the Spanish ones). */
const EN = {
  recibida: (r: Req): Mail => ({
    subject: 'We received your ad request',
    html: frame('We received your request!', p(hiEn(r)) + p('Thank you for advertising with NotiCel. Our team will review your ad and get back to you within <b>1 business day</b>.') + summaryEn(r)
      + p(`You can follow its progress in your advertiser dashboard. Sign in with this same email (${esc(r.client.email)}).`), { text: 'Go to my dashboard', url: PANEL_EN }, 'We will get back to you within 1 business day.', true),
  }),
  cambios: (r: Req): Mail => ({
    subject: 'Your ad needs a change',
    html: frame('Your ad needs a change', p(hiEn(r)) + p('We reviewed your ad and need one small change before we publish it:')
      + box(esc(r.note || 'Reply to this email and we will explain what is needed.')) + p('Reply to this email with the change (or the new image) and we will publish it as soon as it is ready.'), undefined, 'One small change and we will publish it.', true),
  }),
  aprobada: (r: Req, c?: Camp): Mail => ({
    subject: 'Your ad has been approved!',
    html: frame('Your ad has been approved!', p(hiEn(r)) + p(`Your ad for <b>${esc(r.client.business)}</b> is approved${c && c.start_date > today() ? ` and starts running on <b>${dayEn(c.start_date)}</b>` : ' and is now running on NotiCel'}.`)
      + pic(c, true) + rows([['Format', fmts(r, true)], ['From', dayEn(c?.start_date ?? r.start)], ['Until', dayEn(c?.end_date)], ['Total', money(r.total)]])
      + (r.paid ? '' : p('Our team will contact you to complete the payment before it starts.'))
      + p('Your advertiser dashboard shows the views and clicks of your campaign.'), { text: 'View my campaign', url: PANEL_EN }, 'Your ad is approved.', true),
  }),
  rechazada: (r: Req): Mail => ({
    subject: 'About your ad request',
    html: frame('We could not approve your ad', p(hiEn(r)) + p('Thank you for your interest in NotiCel. We reviewed your request and are unable to publish it this time.')
      + (r.note ? box(esc(r.note)) : '') + (refundLine(r, true) ? p(refundLine(r, true)) : '') + p('If you would like to make changes and try again, reply to this email and we will help.'), undefined, 'About your ad request.', true),
  }),
  aire: (r: Req, c: Camp): Mail => ({
    subject: 'Your ad is now live',
    html: frame('Your ad is now live', p(hiEn(r)) + p(`Starting today, your ad for <b>${esc(r.client.business)}</b> runs on NotiCel until <b>${dayEn(c.end_date)}</b>.`)
      + pic(c, true) + p('Visit your dashboard anytime to see how many people have seen it and how many have clicked on it.'), { text: 'See my results', url: PANEL_EN }, `Runs until ${dayEn(c.end_date)}.`, true),
  }),
  pronto: (r: Req, c: Camp, s: Stats): Mail => ({
    subject: `Your campaign ends on ${dayEn(c.end_date).replace(/, \d{4}$/, '')}`,
    html: frame('Your campaign ends soon', p(hiEn(r)) + p(`Your ad for <b>${esc(r.client.business)}</b> runs until <b>${dayEn(c.end_date)}</b>. Here is how it is doing so far:`)
      + stat(s, true) + p('Want to keep going? Renew with the same ad and keep your spot. Reply to this email or order your next campaign on our Advertise page.'), { text: 'Renew my ad', url: `${SITE}/en/advertise/` }, 'Renew and keep your spot.', true),
  }),
  fin: (r: Req, c: Camp, s: Stats): Mail => ({
    subject: 'Your campaign results',
    html: frame('Your campaign results', p(hiEn(r)) + p(`Your campaign for <b>${esc(r.client.business)}</b> ended on ${dayEn(c.end_date)}. Thank you for advertising with us! Here are the results:`)
      + stat(s, true) + rows([['Format', fmts(r, true)], ['From', dayEn(c.start_date)], ['Until', dayEn(c.end_date)]])
      + p('Shall we do it again? Order your next campaign whenever you like; your ad is ready to go.'), { text: 'Run my campaign again', url: `${SITE}/en/advertise/` }, 'Thank you for advertising with us.', true),
  }),
  mes: (r: Req, c: Camp, s: Stats, m: Month): Mail => ({
    subject: `Your month ${m.n} on NotiCel: ${num(m.views, true)} views`,
    html: frame(`Your month ${m.n} on NotiCel`, p(hiEn(r)) + p(`Here is how your ad for <b>${esc(r.client.business)}</b> did from ${dayEn(m.from)} to ${dayEn(m.to)}:`)
      + `<p style="text-align:center;margin:4px 0 6px"><span style="font-size:32px;font-weight:bold;color:${PURPLE}">${num(m.views, true)}</span><br><span style="font-size:13px;color:${MUTED}">views this month</span></p>`
      + p('Since you started:') + stat(s, true)
      + p('Your ad keeps running and renews by itself every month. To change the artwork or cancel, reply to this email.'), { text: 'See my results', url: PANEL_EN }, `${num(m.views, true)} views this month.`, true),
  }),
  venta: (r: Req, c?: Camp): Mail => ({
    subject: 'Your campaign with NotiCel is confirmed',
    html: frame('Your campaign is confirmed!', p(hiEn(r)) + p('Thank you for advertising with NotiCel. Here are the details of what we agreed on:')
      + rows([['Business', r.client.business ?? ''], ['Ad spaces', fmts(r, true)], ...whenEn(r, c), ['Where', placeEn(r.placement)], ['Total', money(r.total)], ['Payment', lineEn(r, 'Pago') || (r.paid ? 'Received' : 'Pending')], ['Invoice or receipt', lineEn(r, 'Factura')]])
      + (raw(r, 'Acordado') ? box(`<b>What we agreed:</b> ${esc(lineEn(r, 'Acordado'))}`) : '')
      + p(`You can see your campaign's views and clicks in your advertiser dashboard. Sign in with this same email (${esc(r.client.email)}).`), { text: 'View my campaign', url: PANEL_EN }, 'The details of your campaign.', true),
  }),
};

/** Each client email in the client's language (English when `client.lang` is 'en'); team emails always in Spanish. */
export const TEMPLATES = {
  recibida: (r: Req): Mail => (isEn(r) ? EN : ES).recibida(r),
  cambios: (r: Req): Mail => (isEn(r) ? EN : ES).cambios(r),
  aprobada: (r: Req, c?: Camp): Mail => (isEn(r) ? EN : ES).aprobada(r, c),
  rechazada: (r: Req): Mail => (isEn(r) ? EN : ES).rechazada(r),
  aire: (r: Req, c: Camp): Mail => (isEn(r) ? EN : ES).aire(r, c),
  pronto: (r: Req, c: Camp, s: Stats): Mail => (isEn(r) ? EN : ES).pronto(r, c, s),
  fin: (r: Req, c: Camp, s: Stats): Mail => (isEn(r) ? EN : ES).fin(r, c, s),
  mes: (r: Req, c: Camp, s: Stats, m: Month): Mail => (isEn(r) ? EN : ES).mes(r, c, s, m),
  venta: (r: Req, c?: Camp): Mail => (isEn(r) ? EN : ES).venta(r, c),
  ventaEquipo: ES.ventaEquipo,
  equipo: ES.equipo,
  lead: ES.lead,
};

/** Sample data for the panel's preview page. */
export const SAMPLE = {
  req: { id: 'R-EJEMPLO', status: 'aprobada', paid: false, client: { name: 'María Rivera', business: 'Panadería La Esquina', email: 'maria@ejemplo.com', phone: '787-555-0100' },
    formats: ['rectangle', 'cuadrado'], placement: 'Puerto Rico y la diáspora', start: '2026-11-03', duration: '1 mes', total: 0, note: 'La imagen se ve borrosa; ¿nos envías una versión más grande (600 × 600)?' } as Req,
  camp: { id: 'r-ejemplo', start_date: '2026-11-03', end_date: '2026-12-02', status: 'active' } as Camp,
  stats: { views: 18450, clicks: 212 } as Stats,
  month: { n: 2, from: '2026-12-03', to: '2027-01-02', views: 6120 } as Month,
  sale: { id: 'V-EJEMPLO', status: 'aprobada', paid: true, client: { name: 'Carlos Ortiz', business: 'Ferretería El Martillo', email: 'carlos@ejemplo.com', phone: '787-555-0142' },
    formats: ['rectangle', 'leaderboard'], placement: 'Solo Puerto Rico', start: '2026-11-03', duration: '2 meses', total: 0,
    lines: ['Venta directa', 'Pago: ATH Móvil · 2026-11-01', 'Factura: 1043', 'Acordado: 2 meses + 2 semanas gratis; cambia el arte en diciembre.', 'Vendido por: Ventas (ejemplo)'] } as Req,
  // English-speaking clients (client.lang 'en'): the same samples, in English
  reqEn: { id: 'R-SAMPLE', status: 'aprobada', paid: false, client: { name: 'Mary Rivers', business: 'Corner Bakery', email: 'mary@example.com', phone: '407-555-0100', lang: 'en' },
    formats: ['rectangle', 'cuadrado'], placement: 'Solo la diáspora', start: '2026-11-03', duration: '1 mes', total: 0, note: 'The image looks blurry; could you send us a larger version (600 × 600)?' } as Req,
  saleEn: { id: 'V-SAMPLE', status: 'aprobada', paid: true, client: { name: 'Charles Porter', business: 'Porter Hardware', email: 'charles@example.com', phone: '407-555-0142', lang: 'en' },
    formats: ['rectangle', 'leaderboard'], placement: 'Puerto Rico y la diáspora', start: '2026-11-03', duration: '2 meses', total: 0,
    lines: ['Venta directa', 'Pago: Transferencia · 2026-11-01', 'Factura: 1044', 'Acordado: 2 months + 2 free weeks; new artwork in December.', 'Vendido por: Ventas (ejemplo)'] } as Req,
  lead: { business: 'Taller El Rápido', contact: 'José Torres', email: 'jose@ejemplo.com', phone: '787-555-0199', requests: 'Quiero anunciarme en Deportes durante el BSN.' } as Lead,
};

/* ---------------- sending ---------------- */

function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' }); }
const addMonths = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCMonth(t.getUTCMonth() + n); return t.toISOString().slice(0, 10); };
const addDays = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const okEmail = (e?: string) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

if (typeof Deno !== 'undefined') Deno.serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return out({ error: 'Falta el secreto RESEND_API_KEY en Supabase (Edge Functions → Secrets).' }, 500);
  const from = Deno.env.get('FROM_EMAIL') || DEFAULT_FROM, team = Deno.env.get('TEAM_EMAIL') || DEFAULT_TEAM, replyTo = Deno.env.get('REPLY_TO') || team;
  const base = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  const get = async <T>(path: string): Promise<T[]> => { const r = await fetch(`${base}/rest/v1/${path}`, { headers: db }); return r.ok ? r.json() : []; };

  const sent: string[] = [], failed: string[] = [];
  /** Claims the key first (so two runs never send the same email twice), then sends; frees the key if sending fails. */
  async function send(logKey: string, to: string, mail: Mail) {
    if (!okEmail(to) || sent.length >= 40) return; // a cap per run keeps a mistake from flooding inboxes
    const claim = await fetch(`${base}/rest/v1/email_log`, { method: 'POST', headers: { ...db, Prefer: 'return=representation,resolution=ignore-duplicates' }, body: JSON.stringify({ key: logKey, to_email: to, subject: mail.subject }) });
    if (!claim.ok) { failed.push(`${logKey}: no se pudo anotar en email_log (${claim.status} ${(await claim.text()).slice(0, 120)})`); return; }
    if (!(await claim.json()).length) return; // already sent
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject: mail.subject, html: mail.html,
        attachments: [{ filename: 'noticel.png', content: LOGO_PNG_BASE64, content_id: 'nc-logo' }] }) });
    await new Promise((ok) => setTimeout(ok, 600)); // Resend takes at most 2 emails a second
    if (r.ok) sent.push(logKey);
    else { failed.push(`${logKey}: ${(await r.text()).slice(0, 160)}`); await fetch(`${base}/rest/v1/email_log?key=eq.${encodeURIComponent(logKey)}`, { method: 'DELETE', headers: db }); }
  }

  // Test: {"prueba": true} sends every email with the sample data (EJEMPLO) to the team's inbox only, at most once
  // every 10 minutes, so the whole set can be checked in a real inbox without waiting for real dates
  const body = await req.json().catch(() => ({}));
  if (body?.prueba === true) {
    if (!okEmail(team)) return out({ error: 'Falta el secreto TEAM_EMAIL (un correo válido) en Supabase → Edge Functions → Secrets.' }, 400);
    const slot = new Date().toISOString().slice(0, 15);
    const { req: r, camp: c, stats: s, lead: l } = SAMPLE;
    const all: [string, Mail][] = [['recibida', TEMPLATES.recibida(r)], ['cambios', TEMPLATES.cambios(r)], ['aprobada', TEMPLATES.aprobada(r, c)], ['rechazada', TEMPLATES.rechazada(r)],
      ['aire', TEMPLATES.aire(r, c)], ['pronto', TEMPLATES.pronto(r, c, s)], ['fin', TEMPLATES.fin(r, c, s)], ['mes', TEMPLATES.mes(r, c, s, SAMPLE.month)], ['equipo', TEMPLATES.equipo(r)], ['lead', TEMPLATES.lead(l)],
      ['venta', TEMPLATES.venta(SAMPLE.sale, c)], ['ventaEquipo', TEMPLATES.ventaEquipo(SAMPLE.sale)]];
    // The English set too (client.lang 'en'), plus the team's copy with the English-client note
    const e = SAMPLE.reqEn;
    all.push(['en-recibida', TEMPLATES.recibida(e)], ['en-cambios', TEMPLATES.cambios(e)], ['en-aprobada', TEMPLATES.aprobada(e, c)], ['en-rechazada', TEMPLATES.rechazada(e)],
      ['en-aire', TEMPLATES.aire(e, c)], ['en-pronto', TEMPLATES.pronto(e, c, s)], ['en-fin', TEMPLATES.fin(e, c, s)], ['en-mes', TEMPLATES.mes(e, c, s, SAMPLE.month)], ['en-equipo', TEMPLATES.equipo(e)],
      ['en-venta', TEMPLATES.venta(SAMPLE.saleEn, c)], ['en-ventaEquipo', TEMPLATES.ventaEquipo(SAMPLE.saleEn)]);
    for (const [k, m] of all) await send(`prueba:${slot}:${k}`, team, { ...m, subject: `[EJEMPLO] ${m.subject}` });
    return out({ sent, failed });
  }

  try {
    const since = new Date(Date.now() - 45 * 864e5).toISOString(); // only recent orders and campaigns are looked at
    const FIELDS = 'id,created_at,status,paid,client,formats,placement,start,duration,total,note,lines';
    const recent = await get<Req & { created_at: string }>(`ad_requests?select=${FIELDS}&created_at=gte.${since}&order=created_at.asc`);
    const camps = await get<Camp>(`ad_campaigns?select=id,start_date,end_date,status,creatives&end_date=gte.${addDays(today(), -10)}`);
    // Long campaigns (3 and 6 months, monthly subscriptions) were ordered more than 45 days ago: their approved orders
    // are read too, but only for the campaign emails (ends soon, results, monthly report), never the order emails again
    const campIds = new Set(camps.map((c) => c.id));
    const older = (await get<Req & { created_at: string }>(`ad_requests?select=${FIELDS}&status=eq.aprobada&created_at=lt.${since}`)).filter((r) => campIds.has(r.id.toLowerCase())).map((r) => ({ ...r, old: true }));
    const reqs: Array<Req & { created_at: string; old?: boolean }> = [...older, ...recent];
    // Views per day (supabase/vistas-justas.sql), for the monthly report
    const daily = await get<{ campaign_id: string; day: string; views: number }>(`ad_daily?select=campaign_id,day,views&day=gte.${addDays(today(), -75)}`);
    const viewsBetween = (id: string, from: string, to: string) => daily.filter((d) => d.campaign_id === id && d.day >= from && d.day < to).reduce((a, d) => a + d.views, 0);
    const stats = Object.fromEntries((await get<Stats & { campaign_id: string }>('ad_stats?select=campaign_id,views,clicks')).map((s) => [s.campaign_id, s]));
    const byId = Object.fromEntries(camps.map((c) => [c.id, c]));
    const t = today();
    for (const r of reqs) {
      const to = r.client?.email ?? '', c = byId[r.id.toLowerCase()], s = stats[r.id.toLowerCase()] ?? { views: 0, clicks: 0 };
      const monthly = /se renueva cada mes|renews every month/.test(r.duration ?? ''); // monthly subscription
      if (r.old) {
        // Only campaign emails for older orders
      } else if (isDirect(r)) {
        // Direct sale: the deal in writing to the client and a copy to the team (no "received" or "approved" emails)
        if (r.status === 'aprobada' && c) { await send(`${r.id}:venta`, to, TEMPLATES.venta(r, c)); await send(`${r.id}:ventaequipo`, team, TEMPLATES.ventaEquipo(r)); }
      } else {
        await send(`${r.id}:equipo`, team, TEMPLATES.equipo(r));
        await send(`${r.id}:recibida`, to, TEMPLATES.recibida(r));
      }
      if (!r.old && r.status === 'cambios') await send(`${r.id}:cambios:${(r.note ?? '').length}`, to, TEMPLATES.cambios(r)); // a new note sends a new email
      if (!r.old && r.status === 'rechazada') await send(`${r.id}:rechazada`, to, TEMPLATES.rechazada(r));
      if (r.status === 'aprobada' && c) {
        if (!r.old && !isDirect(r)) await send(`${r.id}:aprobada`, to, TEMPLATES.aprobada(r, c));
        const running = c.status === 'active' && c.start_date <= t && t <= c.end_date;
        if (running && c.start_date > addDays(t, -3)) await send(`${r.id}:aire`, to, TEMPLATES.aire(r, c)); // not for campaigns live before these emails existed
        const len = (Date.parse(c.end_date) - Date.parse(c.start_date)) / 864e5;
        if (monthly) {
          // Each paid month that just finished (within the last 10 days): its numbers. "Ends soon" never goes to them.
          let n = 1; while (addMonths(c.start_date, n) <= t) n++;
          const m = n - 1, from = addMonths(c.start_date, m - 1), to2 = addMonths(c.start_date, m);
          if (m >= 1 && to2 >= addDays(t, -10)) await send(`${r.id}:mes:${m}`, to, TEMPLATES.mes(r, c, s, { n: m, from, to: addDays(to2, -1), views: viewsBetween(c.id, from, to2) }));
          // The results only once they cancelled and the last paid month is over (2 days of grace for a late renewal)
          if ((c.status === 'ended' || c.end_date < addDays(t, -2)) && c.end_date >= addDays(t, -9)) await send(`${r.id}:fin`, to, TEMPLATES.fin(r, c, s));
        } else {
          if (running && len >= 13 && c.end_date <= addDays(t, 3)) await send(`${r.id}:pronto`, to, TEMPLATES.pronto(r, c, s));
          if ((c.end_date < t || c.status === 'ended') && c.end_date >= addDays(t, -7)) await send(`${r.id}:fin`, to, TEMPLATES.fin(r, c, s));
        }
      }
    }
    // "Prefiero hablar con alguien" (Anúnciate) → a heads-up to the team
    for (const l of await get<{ id: string; data: Lead & { channel?: string } }>(`sales_leads?select=id,data&updated_at=gte.${new Date(Date.now() - 3 * 864e5).toISOString()}`)) {
      if (l.data?.channel === 'Formulario web') await send(`${l.id}:lead`, team, TEMPLATES.lead(l.data));
    }
    return out({ sent, failed });
  } catch (e) {
    return out({ error: (e as Error).message, sent, failed }, 500);
  }
});
