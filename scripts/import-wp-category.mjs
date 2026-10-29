// Copies every story of one WordPress category from noticel.com's PUBLIC story list (wp-json, no login needed) into
// src/content/noticias/ as Markdown, the same shape scripts/import-wp.mjs makes from the export file.
// Each story keeps its WordPress id and its exact old address (`path`), so old links keep working.
// Files are named wpa-<id>.md, so re-running import-wp.mjs (which replaces wp-*.md) leaves them alone.
// Usage: node scripts/import-wp-category.mjs <category-slug>      e.g. noticel-factcheck
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://noticel.com';
const slug = process.argv[2];
if (!slug) throw new Error('Pass a category slug: node scripts/import-wp-category.mjs noticel-factcheck');
const get = async (path) => {
  const r = await fetch(`${SITE}/wp-json/wp/v2/${path}`, { headers: { 'User-Agent': 'NotiCel archive copy' } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return { data: await r.json(), pages: Number(r.headers.get('x-wp-totalpages') || 1) };
};
const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;|&#8216;/g, "'")
  .replace(/&#8220;|&#8221;/g, '"').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#8230;|&hellip;/g, '…').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (html = '') => decode(html.replace(/<[^>]+>/g, '').replace(/\s*\[(&hellip;|…|\.\.\.)\]\s*$/, '…')).replace(/\s+/g, ' ').trim();

const cat = (await get(`categories?slug=${encodeURIComponent(slug)}`)).data[0];
if (!cat) throw new Error(`No category "${slug}" on ${SITE}`);
const posts = [];
for (let page = 1, pages = 1; page <= pages; page++) {
  const r = await get(`posts?categories=${cat.id}&per_page=100&page=${page}&_embed=author,wp:featuredmedia,wp:term`);
  posts.push(...r.data); pages = r.pages;
}

const dir = 'src/content/noticias';
mkdirSync(dir, { recursive: true });
let n = 0;
for (const p of posts) {
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
  const yaml = Object.entries(front).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  const file = join(dir, `wpa-${p.id}.md`);
  if (!existsSync(join(dir, `wp-${p.id}.md`))) { writeFileSync(file, `---\n${yaml}\n---\n\n${body}\n`); n++; } // skip stories already copied from the export
}
console.log(`Copied ${n} of ${posts.length} "${cat.name}" stories into ${dir}/`);
