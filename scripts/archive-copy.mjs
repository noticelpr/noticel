// Full archive copy (2026-11-15): every story on noticel.com (about 229,500) from its PUBLIC story list, saved on this
// computer in archive/stories/ (kept out of GitHub, see .gitignore): 100 stories per compressed file, oldest first.
// Later they are uploaded to NotiCel's Cloudflare R2 storage, where the new site opens old stories on demand.
// Gentle with noticel.com: one batch at a time, a short pause between batches (about 11 hours in all).
// It can stop and start again any time: finished batches are skipped (archive/progress.json).
// Usage: node scripts/archive-copy.mjs        (progress: archive/progress.json and archive/log.txt)
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { wp, EMBED } from './wp-lib.mjs';

const DIR = 'archive', OUT = join(DIR, 'stories'), PROGRESS = join(DIR, 'progress.json'), LOG = join(DIR, 'log.txt');
mkdirSync(OUT, { recursive: true });
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); appendFileSync(LOG, `${line}\n`); };
const progress = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : { done: [] };
const done = new Set(progress.done);

// Oldest first by id: new stories published during the copy land on the last pages, so earlier pages never shift
const first = await wp(`posts?orderby=id&order=asc&per_page=100&page=1&_fields=id`);
const pages = first.pages;
log(`noticel.com has ${first.total} stories (${pages} batches of 100); ${done.size} batches already copied`);

for (let page = 1; page <= pages; page++) {
  if (done.has(page)) continue;
  const t = Date.now();
  const r = await wp(`posts?orderby=id&order=asc&per_page=100&page=${page}&${EMBED}`);
  writeFileSync(join(OUT, `batch-${String(page).padStart(5, '0')}.json.gz`), gzipSync(JSON.stringify(r.data)));
  done.add(page);
  writeFileSync(PROGRESS, JSON.stringify({ total: first.total, pages, done: [...done].sort((a, b) => a - b), updated: new Date().toISOString() }));
  if (page % 10 === 0 || page === pages) log(`batch ${page}/${pages} done (${r.data.length} stories, ${((Date.now() - t) / 1000).toFixed(0)} s); ${done.size}/${pages} copied`);
  await new Promise((ok) => setTimeout(ok, 1000)); // short pause between batches, to be gentle
}
log(`Finished: ${done.size}/${pages} batches. The full archive is in ${OUT}/`);
