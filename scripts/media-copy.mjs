// noticel.com's photo list (2026-11-16): every image in WordPress's media library (~296,000), from the public
// wp-json/wp/v2/media list: address on cdn.noticel.com, caption, alt text, title, date and size. Saves
// archive/media/page-NNNNN.json.gz (100 each, oldest first, resumable: archive/media-progress.json). The files themselves
// are already in NotiCel's R2 (noticel-fotos). scripts/photos-db.mjs then loads this list into the search database.
// Usage: node scripts/media-copy.mjs [--pages N]   (--pages: only the first N pages, for a test)
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { wp } from './wp-lib.mjs';

const OUT = 'archive/media', PROGRESS = 'archive/media-progress.json', LOG = 'archive/media-log.txt';
mkdirSync(OUT, { recursive: true });
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); appendFileSync(LOG, `${line}\n`); };
const done = new Set(existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')).done : []);
const limit = Number(process.argv[process.argv.indexOf('--pages') + 1]) || Infinity;
const FIELDS = '_fields=id,date_gmt,source_url,caption,alt_text,title,mime_type,post,media_details.width,media_details.height'; // post: the story the photo belongs to
const first = await wp(`media?media_type=image&orderby=id&order=asc&per_page=100&page=1&_fields=id`, 20);
const pages = Math.min(first.pages, limit);
log(`noticel.com has ${first.total} images (${first.pages} pages of 100); ${done.size} pages already copied`);
for (let page = 1; page <= pages; page++) {
  if (done.has(page)) continue;
  let r;
  for (let wait = 1; ; wait = Math.min(wait * 2, 10)) {
    try { r = await wp(`media?media_type=image&orderby=id&order=asc&per_page=100&page=${page}&${FIELDS}`); break; }
    catch (e) { log(`page ${page}: ${e.message.slice(-80)}; trying again in ${wait} min`); await new Promise((ok) => setTimeout(ok, wait * 60_000)); }
  }
  writeFileSync(join(OUT, `page-${String(page).padStart(5, '0')}.json.gz`), gzipSync(JSON.stringify(r.data)));
  done.add(page);
  writeFileSync(PROGRESS, JSON.stringify({ total: first.total, pages: first.pages, done: [...done].sort((a, b) => a - b), updated: new Date().toISOString() }));
  if (page % 50 === 0 || page === pages) log(`page ${page}/${pages}`);
  await new Promise((ok) => setTimeout(ok, 700));
}
log(`Finished: ${done.size}/${first.pages} pages of images.`);
