// Follow noticel.com's front page until switch day (user, 2026-11-15): reads the order of the stories at the top of
// noticel.com's home page and of each NotiCel section page, and saves it in src/data/portada-noticel.json. The test
// site then shows those stories first, in the same order and spots (src/lib/site.ts followNoticel). Runs with the
// 15-minute copy (.github/workflows/sync-noticel.yml), after the new stories are saved. Public pages only, no login.
// The file only changes when the order changes, so it doesn't make a new commit every 15 minutes.
// Switch day: set SITE.followNoticel to false (the newsroom places stories from the new panel).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SITE } from './wp-lib.mjs';

const OUT = 'src/data/portada-noticel.json';
const AGENT = 'NotiCel front page check (new NotiCel site)';
const categories = JSON.parse(readFileSync('src/data/categories.json', 'utf8'));
// NotiCel's sections (SECTIONS in src/lib/site.ts)
const SECTION_IDS = ['noticias', 'gobierno', 'legislatura', 'tribunales', 'policiacas', 'politica', 'economia', 'deportes', 'entretenimiento', 'opiniones', 'vida-y-bienestar', 'el-tiempo', 'mundo', 'estados-unidos'];
const STORY = /href="(?:https?:\/\/(?:www\.)?noticel\.com)?(\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/\d{8}\/[a-z0-9%-]+\/?)"/g;

/** The first `n` different story addresses on a noticel.com page, in the order they appear. */
async function topOf(path, n) {
  const r = await fetch(`${SITE}${path}`, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  const html = await r.text(), out = [];
  for (const m of html.matchAll(STORY)) {
    const p = m[1].replace(/\/?$/, '/');
    if (!out.includes(p)) out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

const before = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const next = { home: [], sections: {} };
try { next.home = await topOf('/', 12); } catch (e) { console.log(`home page: ${e.message}`); next.home = before.home ?? []; }
for (const id of SECTION_IDS) {
  const path = categories[id]?.path ?? id;
  try { next.sections[id] = await topOf(`/category/${path}/`, 8); } catch (e) { console.log(`${id}: ${e.message}`); next.sections[id] = before.sections?.[id] ?? []; }
  await new Promise((ok) => setTimeout(ok, 500)); // gentle with noticel.com
}
const same = JSON.stringify({ home: before.home, sections: before.sections }) === JSON.stringify(next);
if (same) console.log('noticel.com front page: same order as before.');
else { writeFileSync(OUT, `${JSON.stringify({ ...next, updated: new Date().toISOString() }, null, 1)}\n`); console.log(`noticel.com front page: new order saved (home: ${next.home.length} stories).`); }
