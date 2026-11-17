#!/usr/bin/env node
/**
 * Two-headline tests (owner, 2026-11-17; copied from the sister platform): picks each test's winner and makes it the
 * story's headline. An editor can write a second headline in the panel (Escribir → "Probar un segundo titular", saved as
 * `titleB`); src/lib/traffic.ts shows A or B on the cards to half the readers each and counts views and clicks
 * (supabase/trafico.sql). Run by .github/workflows/sync-noticel.yml.
 *   - Both headlines seen at least MIN_VIEWS times and one clearly gets more clicks (z ≥ 1.65): that one wins.
 *   - Both seen MAX_VIEWS times: the one with more clicks wins.
 *   - 3 days without enough readers: the test ends and the first headline stays ('sin-datos').
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'src/content/noticias');
const MIN_VIEWS = 150, MAX_VIEWS = 600, DAYS = 3;
const backend = await fs.readFile(path.join(ROOT, 'src/lib/backend.ts'), 'utf8');
const URL_ = backend.match(/url: '([^']+)'/)?.[1], KEY = backend.match(/anonKey: '([^']+)'/)?.[1];

const yaml = (s) => JSON.stringify(s);
const field = (md, k) => { const m = md.match(new RegExp(`^${k}: (.*)$`, 'm')); if (!m) return undefined; try { return JSON.parse(m[1]); } catch { return m[1].replace(/^['"]|['"]$/g, ''); } };

async function main() {
  if (!URL_ || !KEY) return console.log('titulares: sin base de datos');
  // Only the story files that have a second headline (a quick text search: there are thousands of files)
  const files = [];
  for (const f of await fs.readdir(DIR)) {
    if (!f.endsWith('.md')) continue;
    const md = await fs.readFile(path.join(DIR, f), 'utf8');
    const head = md.slice(0, md.indexOf('\n---', 4));
    if (/^titleB: /m.test(head) && !/^titleTested: /m.test(head)) files.push([f, md, head]);
  }
  if (!files.length) return console.log('titulares: no hay pruebas abiertas');
  const r = await fetch(`${URL_}/rest/v1/rpc/titulares_resultados`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
  if (!r?.ok) return console.log(`titulares: no se pudieron leer los resultados (${r?.status ?? 'sin conexión'}; ¿falta correr supabase/trafico.sql?)`);
  const stats = {};
  for (const x of await r.json()) (stats[x.slug] ??= {})[x.variant] = { v: x.views, c: x.clicks };
  let changed = 0;
  for (let [f, md, head] of files) {
    const titleB = field(head, 'titleB');
    if (!titleB) continue;
    const slug = f.slice(0, -3), s = stats[slug] ?? {}, A = s.A ?? { v: 0, c: 0 }, B = s.B ?? { v: 0, c: 0 };
    const age = Date.now() - Date.parse(field(head, 'date') ?? '');
    let win = '';
    if (A.v >= MIN_VIEWS && B.v >= MIN_VIEWS) {
      const pa = A.c / A.v, pb = B.c / B.v, p = (A.c + B.c) / (A.v + B.v);
      const se = Math.sqrt(p * (1 - p) * (1 / A.v + 1 / B.v));
      const z = se ? (pb - pa) / se : 0;
      if (Math.abs(z) >= 1.65) win = z > 0 ? 'B' : 'A';
      else if (A.v >= MAX_VIEWS && B.v >= MAX_VIEWS) win = pb > pa ? 'B' : 'A';
    }
    if (!win && age > DAYS * 864e5) win = 'sin-datos';
    if (!win) continue;
    const title = field(head, 'title');
    if (win === 'B') {
      // The winner becomes the headline; the first one stays as titleB for the record
      md = md.replace(/^title: .*$/m, `title: ${yaml(titleB)}`).replace(/^titleB: .*$/m, `titleB: ${yaml(title)}`);
    }
    md = md.replace(/^titleB: .*$/m, (l) => `${l}\ntitleTested: ${yaml(win)}`);
    await fs.writeFile(path.join(DIR, f), md);
    changed++;
    console.log(`titulares: ${slug} → ${win} (A ${A.c}/${A.v}, B ${B.c}/${B.v})`);
  }
  console.log(`titulares: ${changed} pruebas terminadas`);
}
main().catch((e) => { console.warn(`titulares: ${e.message}`); });
