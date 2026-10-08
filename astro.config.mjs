// @ts-check
import { defineConfig } from 'astro/config';

// NotiCel's own site. Static pages like Noticias Xtra; older archive stories will later come
// from Supabase on demand through Cloudflare (see CLAUDE.md, "Archive scale").
export default defineConfig({
  site: 'https://noticel.com',
  base: '/',
  // Old WordPress addresses end in "/" (e.g. /noticias/20260930/mi-noticia/); keep them identical
  trailingSlash: 'always',
});
