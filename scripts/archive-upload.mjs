// Archive upload (2026-11-15): sends the story batches that scripts/archive-copy.mjs saved in archive/stories/ to
// NotiCel's Cloudflare R2 bucket "noticel-archivo" (key stories/batch-NNNNN.json.gz), so the new site can open old
// stories on demand. Uses Wrangler, signed in to NotiCel's own Cloudflare account (npx wrangler@4 login).
// Resumable (archive/uploaded.json) and it keeps waiting for new batches while the copy is still running, then stops.
// Usage: node scripts/archive-upload.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const DIR = 'archive/stories', STATE = 'archive/uploaded.json', LOG = 'archive/upload-log.txt', BUCKET = 'noticel-archivo';
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); appendFileSync(LOG, `${line}\n`); };
const done = new Set(existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : []);
const save = () => writeFileSync(STATE, JSON.stringify([...done].sort()));
const total = () => (existsSync('archive/progress.json') ? JSON.parse(readFileSync('archive/progress.json', 'utf8')).pages : Infinity);

const put = (file) => execFileSync('npx', ['--yes', 'wrangler@4', 'r2', 'object', 'put', `${BUCKET}/stories/${file}`, '--file', join(DIR, file),
  '--content-type', 'application/json', '--content-encoding', 'gzip', '--remote'], { stdio: 'pipe', timeout: 120000 });

let idle = 0;
for (;;) {
  const todo = readdirSync(DIR).filter((f) => /^batch-\d+\.json\.gz$/.test(f) && !done.has(f)).sort();
  for (const f of todo) {
    let ok = false;
    for (let tries = 1; tries <= 4 && !ok; tries++) {
      try { put(f); ok = true; } catch (e) {
        if (tries === 4) log(`${f}: failed 4 times, will try again later (${String(e.stderr || e.message).slice(0, 160)})`);
        else await new Promise((res) => setTimeout(res, 5000 * tries));
      }
    }
    if (!ok) continue;
    done.add(f); save();
    if (done.size % 25 === 0) log(`${done.size} batches uploaded`);
  }
  if (done.size >= total() && readdirSync(DIR).filter((f) => /^batch-\d+\.json\.gz$/.test(f)).every((f) => done.has(f))) { log(`Finished: all ${done.size} batches are in R2 (${BUCKET}/stories/).`); break; }
  idle = todo.length ? 0 : idle + 1;
  if (idle > 720) { log('No new batches for 12 hours: stopping (run again to continue).'); break; }
  await new Promise((ok) => setTimeout(ok, 60000)); // wait for the copy to save more
}
