// Archive stories, one file each (2026-11-15): turns the copied batches (archive/stories/, scripts/archive-copy.mjs)
// into one small JSON file per story, named after its old address, and uploads them to NotiCel's R2 bucket
// "noticel-archivo" as historias/<path>.json. The site's archive function (functions/[[path]].js) opens any old
// noticel.com address from there. Files are made a few batches at a time in a temporary folder (not on the iCloud
// Desktop), uploaded with Wrangler's bulk upload, then deleted. Resumable: archive/historias-done.json.
// Usage: node scripts/archive-stories.mjs [--test]
import { readdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import categories from '../src/data/categories.json' with { type: 'json' };

const SRC = 'archive/stories', STATE = 'archive/historias-done.json', LOG = 'archive/historias-log.txt', BUCKET = 'noticel-archivo';
const TMP = join(tmpdir(), 'noticel-historias');
const TEST = process.argv.includes('--test');
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); appendFileSync(LOG, `${line}\n`); };
const users = Object.fromEntries(JSON.parse(readFileSync('archive/users.json', 'utf8')).map((u) => [u.id, u.name]));
const done = new Set(existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : []);

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
    html: (p.content?.rendered ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/<p>\s*(&nbsp;)?\s*<\/p>/g, '').replace(/\n{3,}/g, '\n\n').trim(),
  };
}
const keyOf = (path) => `historias/${path.replace(/^\/|\/$/g, '')}.json`;

const GROUP = 5; // batches per upload (about 500 stories)
const total = () => (existsSync('archive/progress.json') ? JSON.parse(readFileSync('archive/progress.json', 'utf8')).pages : Infinity);
// Keeps going while the copy is still saving batches; stops when every batch is done (or after 12 quiet hours)
for (let idle = 0; ; ) {
const batches = readdirSync(SRC).filter((f) => /^batch-\d+\.json\.gz$/.test(f) && !done.has(f)).sort();
if (!batches.length) {
  if (done.size >= total()) { log(`Finished: all ${done.size} batches are in R2 as single stories.`); break; }
  if (++idle > 720 || TEST) { log('No new batches: stopping (run again to continue).'); break; }
  await new Promise((ok) => setTimeout(ok, 60000)); continue;
}
idle = 0;
const ready = batches.length >= GROUP || done.size + batches.length >= total() ? batches : [];
if (!ready.length) { await new Promise((ok) => setTimeout(ok, 60000)); continue; }
for (let i = 0; i < ready.length; i += GROUP) {
  const group = TEST ? ready.slice(0, 1) : ready.slice(i, i + GROUP);
  rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
  const list = [];
  for (const b of group) {
    for (const p of JSON.parse(gunzipSync(readFileSync(join(SRC, b))).toString())) {
      if (!p.link || p.status !== 'publish') continue;
      const s = slim(p), file = join(TMP, `${p.id}.json`);
      writeFileSync(file, JSON.stringify(s));
      list.push({ key: keyOf(s.path), file });
      if (TEST && list.length >= 3) break;
    }
  }
  writeFileSync(join(TMP, 'list.json'), JSON.stringify(list));
  for (let tries = 1; ; tries++) {
    try {
      execFileSync('npx', ['--yes', 'wrangler@4', 'r2', 'bulk', 'put', BUCKET, '--filename', join(TMP, 'list.json'), '--remote', '--content-type', 'application/json; charset=utf-8', '--concurrency', '20', '--force'], { stdio: 'pipe', timeout: 900000 });
      break;
    } catch (e) {
      if (tries >= 5) { log(`upload of ${group.join(', ')} failed: ${String(e.stderr || e.message).slice(0, 300)}`); process.exit(1); }
      await new Promise((ok) => setTimeout(ok, 30000 * tries));
    }
  }
  if (TEST) { log(`test: uploaded ${list.map((x) => x.key).join(' | ')}`); process.exit(0); }
  group.forEach((b) => done.add(b)); writeFileSync(STATE, JSON.stringify([...done].sort()));
  log(`${done.size} batches as single stories (${list.length} stories in this upload)`);
}
}
rmSync(TMP, { recursive: true, force: true });
