// Adds what noticel.com's database export gave us (archive/postmeta-extra.json.gz, archive/gallery-media.json) to
// the stories built on the site (src/content/noticias): view counts ("Lo más leído"), the top story mark, and photo
// galleries (the photos after the main one, with their captions). Run once after the export; the 15-minute copy keeps
// these fields when a story is edited on noticel.com (scripts/wp-lib.mjs saveStory).
// Usage: node scripts/apply-postmeta.mjs [--views-only]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIR = 'src/content/noticias';
export const extra = existsSync('archive/postmeta-extra.json.gz') ? JSON.parse(gunzipSync(readFileSync('archive/postmeta-extra.json.gz')).toString()) : {};
const media = existsSync('archive/gallery-media.json') ? JSON.parse(readFileSync('archive/gallery-media.json', 'utf8')) : {};
const base = (u = '') => u.split('/').pop().replace(/-scaled(?=\.)/, '').replace(/-\d+x\d+(?=\.)/, '');

/** The story's gallery: its photos in order, without the main photo, with their real addresses and captions. */
export function galleryOf(p, mainImage = '') {
  const out = [];
  for (const id of p?.galleryIds ?? []) {
    const m = media[id];
    if (!m?.src || base(m.src) === base(mainImage) || out.some((g) => g.src === m.src)) continue;
    out.push({ src: m.src, caption: m.caption || '', credit: '' });
  }
  return out;
}

if (process.argv[1]?.endsWith('apply-postmeta.mjs')) {
  let changed = 0, views = 0, galleries = 0;
  const setLine = (text, key, value) => (new RegExp(`^${key}: `, 'm').test(text)
    ? text.replace(new RegExp(`^${key}: .*$`, 'm'), () => `${key}: ${value}`)
    : text.replace(/\n---\n/, () => `\n${key}: ${value}\n---\n`));
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.md'))) {
    const file = join(DIR, f), before = readFileSync(file, 'utf8');
    const id = before.match(/^wpId: (\d+)$/m)?.[1]; if (!id || !extra[id]) continue;
    const p = extra[id]; let text = before;
    const curViews = Number(before.match(/^views: (\d+)$/m)?.[1] ?? 0);
    if ((p.views ?? 0) > curViews) { text = setLine(text, 'views', p.views); views++; }
    if (p.top && /^topStory: false$/m.test(text)) text = setLine(text, 'topStory', 'true');
    const img = (before.match(/^image: "?([^"\n]+)"?$/m) ?? [])[1] ?? '';
    const g = process.argv.includes('--views-only') ? [] : galleryOf(p, img); // --views-only: before the photo lookup is done
    if (g.length && !/^gallery: /m.test(text)) { text = setLine(text, 'gallery', JSON.stringify(g)); galleries++; }
    if (text !== before) { writeFileSync(file, text); changed++; }
  }
  console.log(`${changed} story files updated: ${views} view counts, ${galleries} galleries.`);
}
