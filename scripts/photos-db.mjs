// Photo search (2026-11-16): every image in noticel.com's media library (archive/media, scripts/media-copy.mjs) into
// Cloudflare D1 "noticel-buscar" (table fotos + full-text index fotos_fts), so panel → Fotos → Archivo can search them
// all. Each photo is found by its caption, alt text, title and THE TITLE OF ITS STORY (half have no caption).
// Rebuilt from scratch each run: node scripts/photos-db.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const DB = 'noticel-buscar', TMP = join(tmpdir(), 'noticel-fotos-db');
const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&#8217;|&#039;|&#39;/g, '’').replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (h = '') => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const looksLikeCode = (t) => /^[0-9a-f-]{20,}$|^img[_-]?\d+|^dsc[_-]?\d+|^whatsapp image/i.test(t) || /^[A-Za-z0-9_-]{20,}$/.test(t);
// The stories, to name each photo by its story (archive copy + stories built into the site)
const stories = new Map();
for (const f of readdirSync('archive/stories').filter((x) => /^batch-\d+\.json\.gz$/.test(x))) {
  for (const p of JSON.parse(gunzipSync(readFileSync(join('archive/stories', f))).toString())) if (p.link) stories.set(p.id, { title: strip(p.title?.rendered), path: new URL(p.link).pathname });
}
for (const f of readdirSync('src/content/noticias').filter((x) => /^wpa?-\d+\.md$/.test(x))) {
  const t = readFileSync(join('src/content/noticias', f), 'utf8');
  const id = Number(t.match(/^wpId: (\d+)$/m)?.[1] ?? f.match(/\d+/)[0]);
  try { stories.set(id, { title: JSON.parse(t.match(/^title: (.+)$/m)[1]), path: JSON.parse(t.match(/^path: (.+)$/m)[1]) }); } catch { /* skip */ }
}
const rows = [];
for (const f of readdirSync('archive/media').filter((x) => /^page-\d+\.json\.gz$/.test(x)).sort()) {
  for (const m of JSON.parse(gunzipSync(readFileSync(join('archive/media', f))).toString())) {
    if (!m.source_url || !/^image\//.test(m.mime_type ?? '')) continue;
    const title = strip(m.title?.rendered), st = stories.get(m.post);
    rows.push({ id: m.id, src: m.source_url, caption: strip(m.caption?.rendered), alt: strip(m.alt_text ?? ''), title: looksLikeCode(title) ? '' : title,
      date: `${m.date_gmt}Z`, w: m.media_details?.width ?? null, h: m.media_details?.height ?? null, story: st?.title ?? '', path: st?.path ?? '' });
  }
}
console.log(`${rows.length} photos (${rows.filter((r) => r.story).length} with their story, ${rows.filter((r) => r.caption).length} with a caption)`);
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
const head = `DROP TABLE IF EXISTS fotos_fts; DROP TABLE IF EXISTS fotos;
CREATE TABLE fotos (id INTEGER PRIMARY KEY, src TEXT NOT NULL, caption TEXT, alt TEXT, title TEXT, date TEXT, w INTEGER, h INTEGER, story TEXT, path TEXT);
CREATE VIRTUAL TABLE fotos_fts USING fts5(caption, alt, title, story, content='', tokenize='unicode61 remove_diacritics 2');
`;
const files = [];
for (let i = 0; i < rows.length; i += 25000) {
  const part = rows.slice(i, i + 25000), file = join(TMP, `fotos-${String(i / 25000).padStart(2, '0')}.sql`);
  writeFileSync(file, (i === 0 ? head : '') + part.map((r) => `INSERT INTO fotos VALUES (${[r.id, r.src, r.caption, r.alt, r.title, r.date, r.w, r.h, r.story, r.path].map(q).join(',')});\nINSERT INTO fotos_fts(rowid,caption,alt,title,story) VALUES (${[r.id, r.caption, r.alt, r.title, r.story].map(q).join(',')});`).join('\n')
    + (i + 25000 >= rows.length ? '\nCREATE INDEX fotos_date ON fotos(date);\n' : ''));
  files.push(file);
}
const local = process.argv.includes('--local') ? ['--local', '--persist-to', process.argv[process.argv.indexOf('--local') + 1]] : ['--remote'];
for (const file of files) {
  for (let tries = 1; ; tries++) {
    try { execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'execute', DB, ...local, '--file', file, '--yes'], { stdio: 'pipe', timeout: 1800000, cwd: process.env.D1_CWD || process.cwd() }); break; }
    catch (e) { console.log(`${file}: try ${tries} failed: ${String(e.stderr || e.message).replace(/\s+/g, ' ').slice(-200)}`); if (tries >= 4) process.exit(1); await new Promise((ok) => setTimeout(ok, 30000 * tries)); }
  }
  console.log(`sent ${file.split('/').pop()}`);
}
rmSync(TMP, { recursive: true, force: true });
console.log(`Done: ${rows.length} photos in D1 "${DB}".`);
