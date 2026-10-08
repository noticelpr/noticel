// Sitemaps for search engines, written after every build from the finished pages (astro.config.mjs).
// - sitemap.xml: every public page; stories carry their publish date (lastmod).
// - news-sitemap.xml: stories from the last 2 days, in Google News format.
// - robots.txt: points crawlers to both and keeps them out of the staff panel.
// Pages marked noindex (Base.astro `noindex` prop) are left out automatically, so nothing here needs a list of pages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NEWS_HOURS = 48; // Google News only reads stories from the last 2 days
const PUBLICATION = 'NotiCel';

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const meta = (html, prop) => html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`))?.[1];
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export function sitemap() {
  let origin = '', base = '/';
  return {
    name: 'nc-sitemap',
    hooks: {
      'astro:config:done': ({ config }) => {
        origin = String(config.site).replace(/\/$/, '');
        base = config.base.endsWith('/') ? config.base : `${config.base}/`;
      },
      'astro:build:done': ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const home = `${origin}${base}`;
        const urls = [], news = [];
        const now = Date.now();
        // Every built HTML page (dist/**/index.html)
        const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === 'index.html' ? [path.join(d, e.name)] : []));
        for (const file of walk(out).sort()) {
          const rel = path.relative(out, path.dirname(file)).split(path.sep).join('/');
          if (rel === '404') continue;
          const html = fs.readFileSync(file, 'utf8');
          if (/<meta name="robots" content="noindex/.test(html)) continue;
          const loc = rel ? `${home}${rel}/` : home;
          const published = meta(html, 'article:published_time');
          urls.push(`  <url><loc>${esc(loc)}</loc>${published ? `<lastmod>${published}</lastmod>` : ''}</url>`);
          if (published && now - Date.parse(published) < NEWS_HOURS * 36e5) {
            const title = unescape(meta(html, 'og:title') ?? '').replace(/ \| NotiCel$/, '');
            news.push(`  <url><loc>${esc(loc)}</loc><news:news><news:publication><news:name>${PUBLICATION}</news:name><news:language>es</news:language></news:publication><news:publication_date>${published}</news:publication_date><news:title>${esc(title)}</news:title></news:news></url>`);
          }
        }
        fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
        fs.writeFileSync(path.join(out, 'news-sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${news.join('\n')}\n</urlset>\n`);
        fs.writeFileSync(path.join(out, 'robots.txt'), [
          'User-agent: *',
          `Disallow: ${base}redaccion/`,
          `Disallow: ${base}publicidad/aprobar/`,
          `Disallow: ${base}comentarios/revisar/`,
          '',
          `Sitemap: ${home}sitemap.xml`,
          `Sitemap: ${home}news-sitemap.xml`,
          '',
        ].join('\n'));
        logger.info(`sitemap.xml: ${urls.length} pages · news-sitemap.xml: ${news.length} recent stories · robots.txt`);
      },
    },
  };
}
