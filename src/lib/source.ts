/* Where a client came from (user, 2026-11-13: lead tracking from social media, for the sales CRM).
   Tagged links (Ventas → Redes builds them: ?utm_source=instagram&utm_campaign=navidad) or, without a tag, the site
   that sent the visitor (instagram.com, facebook.com…). The first one is kept on this device for 30 days, so a business
   that arrives from an Instagram post and comes back days later to order an ad is still counted for Instagram.
   The "Prefiero hablar con alguien" form and Anúnciate orders carry it to Ventas (src/lib/adrequests.ts). */
const KEY = 'nc-src';
const DAYS = 30;
export type Source = { source: string; campaign?: string; at: number };

/** The networks and channels, by the names Ventas shows. */
export const SOURCES = ['Instagram', 'Facebook', 'TikTok', 'X (Twitter)', 'YouTube', 'WhatsApp', 'LinkedIn', 'Anuncio en redes', 'Correo', 'Google', 'Sitio web', 'Otro'] as const;
const BY_TAG: Record<string, string> = {
  ig: 'Instagram', instagram: 'Instagram', fb: 'Facebook', facebook: 'Facebook', meta: 'Anuncio en redes', ads: 'Anuncio en redes',
  tiktok: 'TikTok', tt: 'TikTok', x: 'X (Twitter)', twitter: 'X (Twitter)', yt: 'YouTube', youtube: 'YouTube', whatsapp: 'WhatsApp', wa: 'WhatsApp',
  linkedin: 'LinkedIn', email: 'Correo', correo: 'Correo', boletin: 'Correo', google: 'Google',
};
const BY_SITE: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'Facebook'], [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X (Twitter)'], [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YouTube'], [/(^|\.)whatsapp\.com$|^wa\.me$/, 'WhatsApp'],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, 'LinkedIn'], [/(^|\.)google\./, 'Google'],
];

/** Runs on every page: keeps the first tagged visit (or social site) for 30 days. */
export function captureSource() {
  try {
    const q = new URLSearchParams(location.search);
    const tag = (q.get('utm_source') || q.get('src') || '').toLowerCase().trim();
    const paid = /cpc|paid|ads?$/.test((q.get('utm_medium') || '').toLowerCase());
    let source = tag ? (paid ? 'Anuncio en redes' : BY_TAG[tag] ?? tag.slice(0, 30)) : '';
    if (!source && document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\.|^l\.|^lm\.|^m\./, '');
      if (host && host !== location.hostname) source = BY_SITE.find(([re]) => re.test(host))?.[1] ?? '';
    }
    if (!source) return;
    const old = getSource();
    if (old && !tag) return; // a tagged link replaces an older untagged visit, never the other way around
    const campaign = (q.get('utm_campaign') || '').trim().slice(0, 60) || undefined;
    localStorage.setItem(KEY, JSON.stringify({ source, campaign, at: Date.now() } satisfies Source));
  } catch { /* storage blocked */ }
}
/** The kept source, if it's still within 30 days. */
export function getSource(): Source | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Source | null;
    return s && Date.now() - s.at < DAYS * 864e5 ? s : null;
  } catch { return null; }
}
/** The source and campaign as fields for a lead or an order ({} when unknown). */
export const sourceFields = (): { source?: string; campaign?: string } => { const s = getSource(); return s ? { source: s.source, ...(s.campaign ? { campaign: s.campaign } : {}) } : {}; };
