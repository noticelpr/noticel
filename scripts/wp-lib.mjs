// Shared pieces for copying stories from noticel.com's PUBLIC story list (wp-json, no login needed):
// reading it politely, and turning one WordPress story into the site's Markdown story file
// (same shape as scripts/import-wp.mjs makes from the export file). Used by sync-wp.mjs and archive-copy.mjs.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SITE = 'https://noticel.com';
export const STORY_DIR = 'src/content/noticias';
const AGENT = 'NotiCel archive copy (new NotiCel site)';

/** One request to the public story list, retried a few times if noticel.com is slow or busy. */
export async function wp(path, tries = 4) {
  for (let n = 1; ; n++) {
    try {
      const r = await fetch(`${SITE}/wp-json/wp/v2/${path}`, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(90_000) });
      if (r.status === 400 && /rest_post_invalid_page_number/.test(await r.clone().text())) return { data: [], total: 0, pages: 0 };
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return { data: await r.json(), total: Number(r.headers.get('x-wp-total') || 0), pages: Number(r.headers.get('x-wp-totalpages') || 1) };
    } catch (e) {
      if (n >= tries) throw new Error(`${path}: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, 15_000 * n)); // wait longer each time, to be gentle with the server
    }
  }
}

const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;|&#8216;/g, "'")
  .replace(/&#8220;|&#8221;/g, '"').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#8230;|&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (html = '') => decode(html.replace(/<[^>]+>/g, '').replace(/\s*\[(&hellip;|…|\.\.\.)\]\s*$/, '…')).replace(/\s+/g, ' ').trim();

/** The fields asked for in each request: only what the site needs (keeps each batch small). */
export const EMBED = '_embed=author,wp:featuredmedia,wp:term';

/** A WordPress story (with _embed) → { id, file text } in the site's Markdown format. */
export function toStory(p) {
  const e = p._embedded ?? {};
  const media = e['wp:featuredmedia']?.[0];
  const terms = e['wp:term'] ?? [];
  const front = {
    wpId: p.id,
    title: strip(p.title?.rendered),
    description: strip(p.excerpt?.rendered),
    date: `${p.date_gmt}Z`,
    author: e.author?.[0]?.name || 'NotiCel',
    path: new URL(p.link).pathname,
    categories: (terms[0] ?? []).map((t) => t.slug),
    tags: (terms[1] ?? []).map((t) => decode(t.name)),
    image: media?.source_url || undefined,
    imageCaption: strip(media?.caption?.rendered) || undefined,
    topStory: false,
    views: 0,
  };
  const body = (p.content?.rendered ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/<p>\s*(&nbsp;)?\s*<\/p>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const yaml = Object.entries(front).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  return { id: p.id, text: `---\n${yaml}\n---\n\n${body}\n` };
}

/** Saves a story into the site. A story first copied from the export (wp-<id>.md) is updated in place, so it never
 *  appears twice, and keeps the view count and "top story" mark the export gave it. Anything else is wpa-<id>.md.
 *  Returns true when the file changed. */
export function saveStory(p) {
  let { id, text } = toStory(p);
  const fromExport = join(STORY_DIR, `wp-${id}.md`);
  const file = existsSync(fromExport) ? fromExport : join(STORY_DIR, `wpa-${id}.md`);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  for (const key of ['views', 'topStory']) {
    const kept = before.match(new RegExp(`^${key}: (.+)$`, 'm'));
    if (kept) text = text.replace(new RegExp(`^${key}: .+$`, 'm'), `${key}: ${kept[1]}`);
  }
  if (before === text) return false;
  writeFileSync(file, text);
  return true;
}
