// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';

// noticel.com also opens a category from short addresses (/deportes/, /beisbol/, /deportes/beisbol/).
// Send those to the real category page, /category/deportes/beisbol/, so old links keep working.
/** @type {Record<string, { name: string, path: string }>} */
const categories = JSON.parse(readFileSync(new URL('./src/data/categories.json', import.meta.url), 'utf8'));
/** @type {Record<string, string>} */
const redirects = {};
for (const [slug, { path }] of Object.entries(categories)) {
  redirects[`/${path}`] = `/category/${path}/`;
  redirects[`/${slug}`] ??= `/category/${path}/`;
}

// NotiCel's own site. Static pages like Noticias Xtra; older archive stories will later come
// from Supabase on demand through Cloudflare (see CLAUDE.md, "Archive scale").
export default defineConfig({
  site: 'https://noticel.com',
  base: '/',
  // Old WordPress addresses end in "/" (e.g. /noticias/20260930/mi-noticia/); keep them identical
  trailingSlash: 'always',
  redirects,
});
