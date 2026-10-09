// Imports stories from a WordPress export (WXR .xml) into src/content/noticias/ as Markdown files.
// Each file keeps the story's WordPress id and its exact old address (`path`), so old links keep working.
// Usage: node scripts/import-wp.mjs [export.xml] [how-many-newest]
// This is the first, small version of the archive import: it reads a few stories for the layout.
// The full archive (~228,800 stories) will go to Supabase instead (see CLAUDE.md).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const file = process.argv[2] || readdirSync('.').find((f) => f.endsWith('.xml') && f.includes('WordPress'));
const newest = Number(process.argv[3] || 120);
if (!file) throw new Error('No WordPress export (.xml) found. Pass its path: node scripts/import-wp.mjs export.xml');
const xml = readFileSync(file, 'utf8');

// WordPress splits "]]>" inside CDATA as "]]]]><![CDATA[>"; join those back before reading.
const cdata = (s = '') => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const tag = (item, name) => {
  const m = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? cdata(m[1]).trim() : '';
};
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
const strip = (html) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// Authors: login -> display name
const authors = {};
for (const m of xml.matchAll(/<wp:author>([\s\S]*?)<\/wp:author>/g)) {
  authors[tag(m[1], 'wp:author_login')] = tag(m[1], 'wp:author_display_name');
}

const items = xml.replace(/\]\]\]\]><!\[CDATA\[>/g, ']]&gt;').split('<item>').slice(1).map((s) => s.split('</item>')[0]);
const metaOf = (item) => {
  const meta = {};
  for (const m of item.matchAll(/<wp:postmeta>\s*<wp:meta_key>([\s\S]*?)<\/wp:meta_key>\s*<wp:meta_value>([\s\S]*?)<\/wp:meta_value>/g)) {
    meta[cdata(m[1])] = cdata(m[2]);
  }
  return meta;
};

// Photos: attachment id -> { url, caption }
const photos = {};
for (const it of items) {
  if (tag(it, 'wp:post_type') !== 'attachment') continue;
  photos[tag(it, 'wp:post_id')] = { url: tag(it, 'wp:attachment_url'), caption: strip(tag(it, 'excerpt:encoded')) };
}

const posts = items
  .filter((it) => tag(it, 'wp:post_type') === 'post' && tag(it, 'wp:status') === 'publish')
  .map((it) => {
    const meta = metaOf(it);
    const cats = [...it.matchAll(/<category domain="category" nicename="([^"]+)"><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g)].map((m) => ({ slug: m[1], name: decode(m[2]) }));
    const tags = [...it.matchAll(/<category domain="post_tag" nicename="([^"]+)"><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g)].map((m) => decode(m[2]));
    const photo = photos[meta._thumbnail_id];
    // No featured image: use the CDN thumbnail without its size suffix (same rule as the WordPress theme)
    const image = photo?.url || (meta._cdn_thumb_url || '').replace(/-\d+x\d+(\.\w+)$/, '$1');
    const body = tag(it, 'content:encoded')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<p>\s*(&nbsp;)?\s*<\/p>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return {
      wpId: Number(tag(it, 'wp:post_id')),
      title: decode(tag(it, 'title')),
      description: strip(meta.preview_content || '') || strip(tag(it, 'excerpt:encoded')),
      date: tag(it, 'wp:post_date_gmt').replace(' ', 'T') + 'Z',
      author: authors[tag(it, 'dc:creator')] || tag(it, 'dc:creator') || 'NotiCel',
      path: new URL(tag(it, 'link')).pathname,
      categories: cats.map((c) => c.slug),
      tags,
      image: image || undefined,
      imageCaption: photo?.caption || undefined,
      topStory: meta.is_post_top_stories === '1',
      views: Number(meta.post_views_count || 0),
      pdfUrl: meta.pdf_url || undefined,
      pdfTitle: meta.pdf_title || undefined,
      body,
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

// The newest stories, plus enough of each home-page block's category to fill it: Opiniones, and the most-read
// sections (total views per category, same ranking the home page uses)
const pick = new Map(posts.slice(0, newest).map((p) => [p.wpId, p]));
const BROAD = ['noticias', 'ultima-hora', 'opiniones', 'uncategorized'];
const viewsBy = new Map();
for (const p of posts) for (const c of p.categories) viewsBy.set(c, (viewsBy.get(c) ?? 0) + p.views);
const topSections = [...viewsBy].filter(([c]) => !BROAD.includes(c)).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([c]) => c);
for (const [slug, n] of [['opiniones', 4], ...topSections.map((c) => [c, 3])]) {
  posts.filter((p) => p.categories.includes(slug)).slice(0, n + 3).forEach((p) => pick.set(p.wpId, p));
}
// Every section in the menu and its drop-downs gets up to 16 stories, so its page fills (top block + rows)
const MENU_SECTIONS = ['noticias', 'gobierno', 'legislatura', 'tribunales', 'policiacas', 'politica', 'economia', 'deportes', 'opiniones',
  'el-tiempo', 'mundo', 'estados-unidos', 'entretenimiento', 'vida-y-bienestar', 'educacion', 'energia', 'judicatura', 'la-calle', 'ultima-hora'];
for (const slug of MENU_SECTIONS) posts.filter((p) => p.categories.includes(slug)).slice(0, 16).forEach((p) => pick.set(p.wpId, p));

// A few stories with deeper addresses (/noticias/la-calle/policiacas/20260808/...), to test those keep working
posts.filter((p) => p.path.split('/').filter(Boolean).length > 3).slice(0, 3).forEach((p) => pick.set(p.wpId, p));

const dir = 'src/content/noticias';
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) if (f.startsWith('wp-')) unlinkSync(join(dir, f));
for (const p of pick.values()) {
  const { body, ...front } = p;
  const yaml = Object.entries(front)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  writeFileSync(join(dir, `wp-${p.wpId}.md`), `---\n${yaml}\n---\n\n${body}\n`);
}
console.log(`Imported ${pick.size} of ${posts.length} stories into ${dir}/`);
