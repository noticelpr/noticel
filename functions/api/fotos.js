// Photo search (2026-11-16): every image from noticel.com's media library (~296,000), from Cloudflare D1
// "noticel-buscar" (table fotos, filled by scripts/photos-db.mjs). For panel → Fotos → Archivo and Analítica.
//   GET /api/fotos?q=palabras&desde=2020-01-01&hasta=2020-12-31&pagina=1&por=48   GET /api/fotos?resumen=1 → total
// A photo is found by its caption, alt text, title or the title of its story. Needs the BUSCAR binding.
const json = (body, status = 200, cache = 300) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${cache}` } });
const ftsQuery = (q) => q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9ñ]{2,}/g)?.slice(0, 8).map((w) => `"${w}"*`).join(' ') ?? '';

// Answers are kept in Cloudflare's cache for a few minutes, so repeated searches don't read the database again
// (D1's free plan allows 5 million rows read a day; one uncached search over the archive can read 230,000)
async function cached(request, waitUntil, make) {
  const c = caches.default, key = new Request(request.url, { method: 'GET' });
  const hit = await c.match(key).catch(() => null);
  if (hit) return hit;
  const res = await make();
  if (res.status === 200) waitUntil(c.put(key, res.clone()).catch(() => {}));
  return res;
}
// Totals (count, oldest and newest date, per section and author) are worked out once and kept in table "resumen";
// the loaders (scripts/search-db.mjs, scripts/photos-db.mjs) drop it when they reload, so it's redone after each load
async function summary(db, key, make) {
  await db.prepare('CREATE TABLE IF NOT EXISTS resumen (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run();
  const row = await db.prepare('SELECT v FROM resumen WHERE k = ?').bind(key).first();
  if (row) return JSON.parse(row.v);
  const v = await make();
  await db.prepare('INSERT OR REPLACE INTO resumen (k, v) VALUES (?, ?)').bind(key, JSON.stringify(v)).run();
  return v;
}

export async function onRequestGet({ request, env, waitUntil }) {
  return cached(request, waitUntil, () => answer(request, env));
}

async function answer(request, env) {
  if (!env.BUSCAR) return json({ error: 'La búsqueda del archivo todavía no está conectada.' }, 503, 0);
  const u = new URL(request.url), p = (k) => (u.searchParams.get(k) ?? '').trim();
  try {
    if (p('resumen')) {
      const r = await summary(env.BUSCAR, 'fotos', () => env.BUSCAR.prepare('SELECT COUNT(*) AS total, MIN(date) AS oldest, MAX(date) AS newest FROM fotos').first());
      return json(r ?? { total: 0 }, 200, 3600);
    }
    const where = [], binds = [];
    const words = ftsQuery(p('q'));
    if (words) { where.push('f.id IN (SELECT rowid FROM fotos_fts WHERE fotos_fts MATCH ?)'); binds.push(words); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(p('desde'))) { where.push('f.date >= ?'); binds.push(`${p('desde')}T00:00:00`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(p('hasta'))) { where.push('f.date <= ?'); binds.push(`${p('hasta')}T23:59:59`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const per = Math.min(96, Math.max(1, Number(p('por')) || 48)), page = Math.max(1, Number(p('pagina')) || 1);
    const [count, rows] = await env.BUSCAR.batch([
      env.BUSCAR.prepare(`SELECT COUNT(*) AS n FROM fotos f ${w}`).bind(...binds),
      env.BUSCAR.prepare(`SELECT f.id, f.src, f.caption, f.alt, f.title, f.date, f.w, f.h, f.story, f.path FROM fotos f ${w} ORDER BY f.date DESC LIMIT ? OFFSET ?`).bind(...binds, per, (page - 1) * per),
    ]);
    return json({ total: count.results[0].n, page, per, results: rows.results });
  } catch (e) {
    // The photo list isn't loaded yet (no "fotos" table): say so instead of failing
    if (/no such table/i.test(String(e?.message))) return json({ error: 'Las fotos del archivo todavía no están cargadas.' }, 503, 0);
    return json({ error: 'No se pudo buscar.', detail: String(e?.message ?? e).slice(0, 200) }, 500, 0);
  }
}
