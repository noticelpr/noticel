import type { APIContext } from 'astro';
import { getStories, storyUrl, url, CATEGORY_INFO } from '../lib/site';
import { COLUMNISTS } from '../lib/columnists';

// Sitemap for Google and other search engines: the home page, every section (at its WordPress address), every story
// and every columnist. On the test copy the whole site is hidden from search engines anyway (functions/_middleware.js);
// it matters on switch day, when noticel.com points here.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function GET(context: APIContext) {
  const site = context.site!;
  const abs = (p: string) => esc(new URL(p, site).toString());
  const stories = await getStories();
  const newest = stories[0]?.data.date.toISOString();
  const rows = [
    `<url><loc>${abs(url())}</loc>${newest ? `<lastmod>${newest}</lastmod>` : ''}<changefreq>hourly</changefreq></url>`,
    ...Object.values(CATEGORY_INFO).map((c) => `<url><loc>${abs(url(`category/${c.path}/`))}</loc><changefreq>hourly</changefreq></url>`),
    ...COLUMNISTS.map((c) => `<url><loc>${abs(url(`opinion/${c.slug}/`))}</loc></url>`),
    ...stories.map((s) => `<url><loc>${abs(storyUrl(s))}</loc><lastmod>${s.data.date.toISOString()}</lastmod>${s.data.image ? `<image:image><image:loc>${esc(s.data.image)}</image:loc></image:image>` : ''}</url>`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${rows.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
