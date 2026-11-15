// Archive stories for the site (2026-11-15): turns the copied batches (archive/stories/, scripts/archive-copy.mjs) into
// 4,096 files in NotiCel's R2 bucket "noticel-archivo" (historias/<000-fff>.json.gz). Each story goes in the file picked
// by a short code worked out from its old address (shardOf, the same in functions/[[path]].js), so the site opens any
// old noticel.com address by reading one small file. (One file per story hit Cloudflare's upload limit: days.)
// Built in a temporary folder (not the iCloud Desktop), uploaded in steps that stay under Cloudflare's limit.
// Run it when the copy is complete (and again after any later copy): node scripts/archive-stories.mjs
import { readdirSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import categories from '../src/data/categories.json' with { type: 'json' };
import { extra, galleryOf } from './apply-postmeta.mjs'; // views and galleries from noticel.com's database export

const SRC = 'archive/stories', LOG = 'archive/historias-log.txt', BUCKET = 'noticel-archivo';
const TMP = join(tmpdir(), 'noticel-historias');
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); appendFileSync(LOG, `${line}\n`); };
const users = Object.fromEntries(JSON.parse(readFileSync('archive/users.json', 'utf8')).map((u) => [u.id, u.name]));

const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;|&#8216;/g, "'")
  .replace(/&#8220;|&#8221;/g, '"').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#8230;|&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (html = '') => decode(html.replace(/<[^>]+>/g, '').replace(/\s*\[(&hellip;|…|\.\.\.)\]\s*$/, '…')).replace(/\s+/g, ' ').trim();
// The label over the headline: the story's most specific NotiCel category (same idea as src/lib/site.ts kicker)
const BROAD = new Set(['noticias', 'ultima-hora', 'uncategorized']);
function section(slugs) {
  const known = slugs.filter((s) => categories[s]);
  const pick = known.filter((s) => !BROAD.has(s)).sort((a, b) => categories[b].path.split('/').length - categories[a].path.split('/').length)[0] ?? known[0];
  return pick ? { name: categories[pick].name, url: `/category/${categories[pick].path}/` } : { name: 'Noticias', url: '/category/noticias/' };
}
/** One WordPress story → what the archive page shows. */
function slim(p) {
  const e = p._embedded ?? {}, media = e['wp:featuredmedia']?.[0], terms = e['wp:term'] ?? [];
  const cats = (terms[0] ?? []).map((t) => t.slug);
  return {
    id: p.id, title: strip(p.title?.rendered), desc: strip(p.excerpt?.rendered), date: `${p.date_gmt}Z`,
    author: users[p.author] || 'NotiCel', path: new URL(p.link).pathname, cats, sec: section(cats),
    tags: (terms[1] ?? []).map((t) => decode(t.name)),
    img: media?.source_url || '', cap: strip(media?.caption?.rendered),
    views: extra[p.id]?.views ?? 0, gallery: galleryOf(extra[p.id], media?.source_url || ''),
    html: (p.content?.rendered ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/<p>\s*(&nbsp;)?\s*<\/p>/g, '').replace(/\n{3,}/g, '\n\n').trim(),
  };
}
/** The file a story lives in: FNV-1a hash of its address, first 3 hex digits (4,096 files). Same in functions/[[path]].js. */
export function shardOf(path) {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) { h ^= path.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 3);
}

if (!process.argv[1]?.endsWith('archive-stories.mjs')) { /* imported: only shardOf */ } else {
  rmSync(TMP, { recursive: true, force: true }); mkdirSync(join(TMP, 'parts'), { recursive: true }); mkdirSync(join(TMP, 'out'));
  // 1. Each story into its file's list (one line each), batch by batch, so memory stays small
  const batches = readdirSync(SRC).filter((f) => /^batch-\d+\.json\.gz$/.test(f)).sort();
  let n = 0;
  for (const b of batches) {
    const lines = {};
    for (const p of JSON.parse(gunzipSync(readFileSync(join(SRC, b))).toString())) {
      if (!p.link || p.status !== 'publish') continue;
      const s = slim(p); const k = shardOf(s.path);
      (lines[k] ??= []).push(JSON.stringify(s)); n++;
    }
    for (const [k, l] of Object.entries(lines)) appendFileSync(join(TMP, 'parts', k), `${l.join('\n')}\n`);
  }
  log(`${n} stories from ${batches.length} batches sorted into files`);
  // 2. Each file as { address: story }, compressed
  const list = [];
  for (const k of readdirSync(join(TMP, 'parts')).sort()) {
    const map = {};
    for (const line of readFileSync(join(TMP, 'parts', k), 'utf8').split('\n')) if (line) { const s = JSON.parse(line); map[s.path] = s; }
    const file = join(TMP, 'out', `${k}.json.gz`); writeFileSync(file, gzipSync(JSON.stringify(map), { level: 9 }));
    list.push({ key: `historias/${k}.json.gz`, file });
  }
  // 3. Upload in steps of 150 files about a minute apart (Cloudflare allows about 1,200 uploads per 5 minutes)
  for (let i = 0; i < list.length; i += 150) {
    const part = list.slice(i, i + 150); writeFileSync(join(TMP, 'list.json'), JSON.stringify(part));
    for (let tries = 1; ; tries++) {
      try {
        execFileSync('npx', ['--yes', 'wrangler@4', 'r2', 'bulk', 'put', BUCKET, '--filename', join(TMP, 'list.json'), '--remote', '--content-type', 'application/gzip', '--concurrency', '3', '--force'], { stdio: 'pipe', timeout: 900000 });
        break;
      } catch (e) {
        log(`upload try ${tries} (files ${i + 1}-${i + part.length}) failed: ${String(e.stderr || e.message).replace(/\s+/g, ' ').slice(-200)}`);
        if (tries >= 8) process.exit(1);
        await new Promise((ok) => setTimeout(ok, 60000 * tries));
      }
    }
    log(`${Math.min(i + 150, list.length)} of ${list.length} files uploaded`);
    await new Promise((ok) => setTimeout(ok, 45000));
  }
  writeFileSync('archive/historias-state.json', JSON.stringify({ stories: n, batches: batches.length, files: list.length, at: new Date().toISOString() }));
  log(`Done: ${n} stories in ${list.length} files in R2 (${BUCKET}/historias/).`);
  rmSync(TMP, { recursive: true, force: true });
}
