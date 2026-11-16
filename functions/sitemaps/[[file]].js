// Sitemaps of the whole archive for Google (2026-11-16), from Cloudflare D1 "noticel-buscar" (every story):
//   /sitemaps/index.xml        → the list of pages below (robots.txt points here, next to /sitemap.xml)
//   /sitemaps/archivo-N.xml    → 45,000 stories each, oldest first (Google's limit is 50,000 per file)
// Needs the BUSCAR binding (see functions/api/buscar.js). On the test copy Google is kept out anyway (_middleware.js).
const PER = 45000;
const xml = (body, cache = 3600) => new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': `public, max-age=${cache}` } });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function onRequestGet({ request, env, params }) {
  const file = [].concat(params.file ?? []).join('/');
  if (!env.BUSCAR) return new Response('Not found', { status: 404 });
  const origin = new URL(request.url).origin;
  if (file === 'index.xml') {
    const n = (await env.BUSCAR.prepare('SELECT COUNT(*) AS n FROM stories').first('n')) ?? 0;
    const pages = Math.max(1, Math.ceil(n / PER));
    return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Array.from({ length: pages }, (_, i) => `<sitemap><loc>${origin}/sitemaps/archivo-${i + 1}.xml</loc></sitemap>`).join('\n')}\n</sitemapindex>`);
  }
  const m = file.match(/^archivo-(\d+)\.xml$/);
  if (!m) return new Response('Not found', { status: 404 });
  const { results } = await env.BUSCAR.prepare('SELECT path, date, img FROM stories ORDER BY id LIMIT ? OFFSET ?').bind(PER, (Number(m[1]) - 1) * PER).all();
  if (!results.length) return new Response('Not found', { status: 404 });
  const rows = results.map((r) => `<url><loc>${esc(origin + r.path)}</loc><lastmod>${esc(r.date)}</lastmod>${r.img ? `<image:image><image:loc>${esc(r.img)}</image:loc></image:image>` : ''}</url>`);
  return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${rows.join('\n')}\n</urlset>`, 86400);
}
