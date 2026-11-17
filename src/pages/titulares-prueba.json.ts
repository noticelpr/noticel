import { getStories } from '../lib/site';

// The two-headline tests running now (owner, 2026-11-17): { "<story address>": ["<story id>", "<second headline>"] } for
// the last 3 days' stories that have one and no winner yet. src/lib/traffic.ts shows it to half the readers;
// scripts/titulares.mjs picks the winner.
export async function GET() {
  const since = Date.now() - 3 * 864e5;
  const tests = Object.fromEntries((await getStories())
    .filter((s) => s.data.titleB && !s.data.titleTested && s.data.date.valueOf() >= since && s.data.titleB !== s.data.title)
    .map((s) => [s.data.path.replace(/\/?$/, '/'), [s.id, s.data.titleB]]));
  return new Response(JSON.stringify(tests), { headers: { 'Content-Type': 'application/json' } });
}
