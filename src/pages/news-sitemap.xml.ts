import type { APIContext } from 'astro';
import { getStories, storyUrl, SITE } from '../lib/site';

// Google News sitemap: the stories of the last 2 days (Google News reads only those), with title and date.
// If nothing was published in the last 2 days (like the test copy, whose stories are older), it lists the newest 50.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET(context: APIContext) {
  const site = context.site!;
  const all = await getStories();
  const recent = all.filter((s) => Date.now() - s.data.date.valueOf() < 2 * 864e5);
  const list = (recent.length ? recent : all.slice(0, 50)).slice(0, 1000);
  const rows = list.map((s) => `<url><loc>${esc(new URL(storyUrl(s), site).toString())}</loc><news:news><news:publication><news:name>${esc(SITE.name)}</news:name><news:language>es</news:language></news:publication><news:publication_date>${s.data.date.toISOString()}</news:publication_date><news:title>${esc(s.data.title)}</news:title></news:news></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${rows.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
