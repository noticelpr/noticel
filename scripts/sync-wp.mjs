// Keeps the new site up to date with noticel.com until switch day (set up 2026-11-15): copies every story PUBLISHED OR
// EDITED on noticel.com since the last run into src/content/noticias/, so no story is lost in the transition.
// Runs by itself every 15 minutes on GitHub (.github/workflows/sync-noticel.yml); the site then rebuilds on Cloudflare.
// It remembers where it left off in src/data/sync-state.json (the newest "modified" time it has seen).
// First run (no state yet): every story published since FIRST_FROM. Usage: node scripts/sync-wp.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { wp, saveStory, EMBED } from './wp-lib.mjs';

const STATE = 'src/data/sync-state.json';
const FIRST_FROM = '2026-10-01T00:00:00'; // the export in this folder ends at the end of September 2026

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
// Ask a little before the last seen time (5 minutes), in case two stories were saved in the same second
// WordPress compares modified_after with its LOCAL time (Puerto Rico, UTC−4), not world time: ask in Puerto Rico time,
// or every story changed in the last 4 hours is skipped (fixed 2026-11-15)
const prTime = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'America/Puerto_Rico' }).replace(' ', 'T');
const since = state.lastModifiedGmt ? prTime(Date.parse(`${state.lastModifiedGmt}Z`) - 5 * 60_000) : null;
const filter = since ? `modified_after=${since}&orderby=modified` : `after=${FIRST_FROM}&orderby=date`;

let newest = state.lastModifiedGmt ?? '', changed = 0, seen = 0;
for (let page = 1, pages = 1; page <= pages; page++) {
  const r = await wp(`posts?${filter}&order=asc&per_page=100&page=${page}&${EMBED}`);
  pages = r.pages;
  for (const p of r.data) {
    seen++;
    if (saveStory(p)) changed++;
    if (p.modified_gmt > newest) newest = p.modified_gmt;
  }
}

writeFileSync(STATE, `${JSON.stringify({ lastModifiedGmt: newest, lastRun: new Date().toISOString(), lastSeen: seen, lastChanged: changed }, null, 2)}\n`);
console.log(`Checked ${seen} stories published or edited on noticel.com ${since ? `since ${since} (Puerto Rico time)` : `since ${FIRST_FROM}`}; ${changed} new or updated.`);
