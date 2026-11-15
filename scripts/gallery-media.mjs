// Gallery photos (2026-11-15): the database export gives each gallery's photo NUMBERS (archive/gallery-ids.json);
// WordPress's public photo list (wp-json/wp/v2/media) gives each number's real address on cdn.noticel.com and its
// caption. Saves archive/gallery-media.json { id: { src, caption } }, 100 photos per request, resumable.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { wp } from './wp-lib.mjs';

const OUT = 'archive/gallery-media.json';
const ids = JSON.parse(readFileSync('archive/gallery-ids.json', 'utf8'));
const got = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const strip = (h = '') => h.replace(/<[^>]+>/g, '').replace(/&#8217;/g, '’').replace(/&#8220;|&#8221;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const todo = ids.filter((id) => !(id in got));
console.log(`${todo.length} of ${ids.length} photos to look up`);
for (let i = 0; i < todo.length; i += 100) {
  const part = todo.slice(i, i + 100);
  let r;
  for (let wait = 1; ; wait = Math.min(wait * 2, 10)) {
    try { r = await wp(`media?include=${part.join(',')}&per_page=100&_fields=id,source_url,caption`); break; }
    catch (e) { console.log(`try again in ${wait} min: ${e.message.slice(-80)}`); await new Promise((ok) => setTimeout(ok, wait * 60_000)); }
  }
  for (const m of r.data) got[m.id] = { src: m.source_url, caption: strip(m.caption?.rendered) };
  for (const id of part) if (!(id in got)) got[id] = null; // deleted photo
  if ((i / 100) % 10 === 0 || i + 100 >= todo.length) { writeFileSync(OUT, JSON.stringify(got)); console.log(`${Object.keys(got).length} of ${ids.length}`); }
  await new Promise((ok) => setTimeout(ok, 1000));
}
writeFileSync(OUT, JSON.stringify(got));
console.log('Done.');
