// Search database (2026-11-16): every NotiCel story (the ~230,000 in the archive + the recent ones built into the site)
// in Cloudflare D1 "noticel-buscar", so the site's search, the panel (Publicadas, Analítica → Total de noticias) and the
// sitemap for Google can use all of them. Rebuilt from scratch each run (a few minutes): node scripts/search-db.mjs
// Per story: wp id, address, title, summary, date, section (+ every category), author, views, photo.
// Words are searched with SQLite's full-text index (FTS5), accents ignored ("policia" finds "policía").
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import categories from '../src/data/categories.json' with { type: 'json' };
import { extra } from './apply-postmeta.mjs';

const DB = 'noticel-buscar', TMP = join(tmpdir(), 'noticel-buscar');
const users = Object.fromEntries(JSON.parse(readFileSync('archive/users.json', 'utf8')).map((u) => [u.id, u.name]));
const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;|&#8216;/g, "'")
  .replace(/&#8220;|&#8221;/g, '"').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#8230;|&hellip;/g, '…').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (h = '') => decode(h.replace(/<[^>]+>/g, '').replace(/\s*\[(&hellip;|…|\.\.\.)\]\s*$/, '…')).replace(/\s+/g, ' ').trim();
const short = (t = '', n = 220) => (t.length <= n ? t : `${t.slice(0, t.lastIndexOf(' ', n) > 120 ? t.lastIndexOf(' ', n) : n)}…`);
const BROAD = new Set(['noticias', 'ultima-hora', 'uncategorized']);
const sectionOf = (slugs) => {
  const known = slugs.filter((s) => categories[s]);
  return known.filter((s) => !BROAD.has(s)).sort((a, b) => categories[b].path.split('/').length - categories[a].path.split('/').length)[0] ?? known[0] ?? 'noticias';
};
const rows = new Map(); // by wp id: the newest data wins (built stories after the archive)
// 1. The archive copy (oldest first)
for (const f of readdirSync('archive/stories').filter((x) => /^batch-\d+\.json\.gz$/.test(x)).sort()) {
  for (const p of JSON.parse(gunzipSync(readFileSync(join('archive/stories', f))).toString())) {
    if (!p.link || p.status !== 'publish') continue;
    const terms = p._embedded?.['wp:term'] ?? [], cats = (terms[0] ?? []).map((t) => t.slug), sec = sectionOf(cats);
    rows.set(p.id, { id: p.id, path: new URL(p.link).pathname, title: strip(p.title?.rendered), descr: short(strip(p.excerpt?.rendered)), date: `${p.date_gmt}Z`,
      sec, cats, author: users[p.author] || 'NotiCel', views: extra[p.id]?.views ?? 0, img: p._embedded?.['wp:featuredmedia']?.[0]?.source_url || '' });
  }
}
// 2. The stories built into the site (newest, and any edits made since the archive copy)
const fm = (t, k) => { const m = t.match(new RegExp(`^${k}: (.+)$`, 'm')); if (!m) return undefined; try { return JSON.parse(m[1]); } catch { return m[1].replace(/^"|"$/g, ''); } };
for (const f of readdirSync('src/content/noticias').filter((x) => /^wpa?-\d+\.md$/.test(x))) {
  const t = readFileSync(join('src/content/noticias', f), 'utf8'); if (fm(t, 'draft') === true) continue;
  const id = Number(fm(t, 'wpId') ?? f.match(/\d+/)[0]); const cats = fm(t, 'categories') ?? [];
  rows.set(id, { id, path: fm(t, 'path'), title: fm(t, 'title'), descr: short(fm(t, 'description') ?? ''), date: new Date(fm(t, 'date')).toISOString(),
    sec: sectionOf(cats), cats, author: fm(t, 'author') ?? 'NotiCel', views: Math.max(Number(fm(t, 'views') ?? 0), extra[id]?.views ?? 0), img: fm(t, 'image') ?? '' });
}
console.log(`${rows.size} stories`);
// 3. SQL files of 20,000 stories each, then Wrangler sends them to D1
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
const head = `DROP TABLE IF EXISTS fts; DROP TABLE IF EXISTS stories;
CREATE TABLE stories (id INTEGER PRIMARY KEY, path TEXT NOT NULL, title TEXT NOT NULL, descr TEXT, date TEXT NOT NULL, sec TEXT, cats TEXT, author TEXT, views INTEGER DEFAULT 0, img TEXT);
CREATE VIRTUAL TABLE fts USING fts5(title, descr, author, content='', tokenize='unicode61 remove_diacritics 2');
`;
const list = [...rows.values()].filter((r) => r.path && r.title);
const files = [];
for (let i = 0; i < list.length; i += 20000) {
  const part = list.slice(i, i + 20000), file = join(TMP, `part-${String(i / 20000).padStart(2, '0')}.sql`);
  const ins = part.map((r) => `INSERT INTO stories VALUES (${[r.id, r.path, r.title, r.descr, r.date, r.sec, ` ${r.cats.join(' ')} `, r.author, r.views, r.img].map(q).join(',')});\nINSERT INTO fts(rowid,title,descr,author) VALUES (${[r.id, r.title, r.descr, r.author].map(q).join(',')});`).join('\n');
  writeFileSync(file, (i === 0 ? head : '') + ins + (i + 20000 >= list.length ? '\nCREATE INDEX stories_date ON stories(date); CREATE INDEX stories_sec ON stories(sec); CREATE INDEX stories_views ON stories(views); CREATE INDEX stories_author ON stories(author); CREATE UNIQUE INDEX stories_path ON stories(path);\n' : ''));
  files.push(file);
}
if (process.argv.includes('--dry')) { console.log(`dry run: ${files.length} files in ${TMP}`); process.exit(0); }
for (const file of files) {
  for (let tries = 1; ; tries++) {
    try { execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'execute', DB, '--remote', '--file', file, '--yes'], { stdio: 'pipe', timeout: 1800000 }); break; }
    catch (e) { console.log(`${file}: try ${tries} failed: ${String(e.stderr || e.message).replace(/\s+/g, ' ').slice(-200)}`); if (tries >= 4) process.exit(1); await new Promise((ok) => setTimeout(ok, 30000 * tries)); }
  }
  console.log(`sent ${file.split('/').pop()}`);
}
writeFileSync('archive/search-db-state.json', JSON.stringify({ stories: list.length, at: new Date().toISOString() }));
rmSync(TMP, { recursive: true, force: true });
console.log(`Done: ${list.length} stories in D1 "${DB}".`);
