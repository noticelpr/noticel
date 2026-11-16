// NotiCel search (2026-11-16): every story, the ~230,000 in the archive and the recent ones, from Cloudflare D1
// "noticel-buscar" (filled by scripts/search-db.mjs). Used by the site's search page and the staff panel
// (Publicadas, Analítica → Total de noticias).
//   GET /api/buscar?q=palabras&desde=2020-01-01&hasta=2020-12-31&seccion=deportes&autor=NotiCel&orden=fecha|vistas|relevancia&pagina=1&por=20
//   GET /api/buscar?resumen=1  → total, oldest and newest date, stories per section and the authors (for the filters)
// Setup, once (Cloudflare → Workers & Pages → the NotiCel Pages project → Settings → Bindings → Add → D1 database):
//   Variable name BUSCAR, database noticel-buscar. Without it, this answers 503 and the site uses its own small index.
import categories from '../../src/data/categories.json';

const json = (body, status = 200, cache = 300) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${cache}`, 'Access-Control-Allow-Origin': '*' },
});
// A section and every category under it (Deportes includes Béisbol, Boxeo…), by the WordPress category paths
const withChildren = (slug) => {
  const base = categories[slug]?.path; if (!base) return [slug];
  return Object.entries(categories).filter(([, c]) => c.path === base || c.path.startsWith(`${base}/`)).map(([s]) => s);
};
// Each word must appear (any accent, any ending: "eleccion" finds "elecciones")
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
      const r = await summary(env.BUSCAR, 'stories', async () => {
        const [tot, secs, authors] = await env.BUSCAR.batch([
          env.BUSCAR.prepare('SELECT COUNT(*) AS total, MIN(date) AS oldest, MAX(date) AS newest, SUM(views) AS views FROM stories'),
          env.BUSCAR.prepare('SELECT sec, COUNT(*) AS n FROM stories GROUP BY sec ORDER BY n DESC'),
          env.BUSCAR.prepare("SELECT author, COUNT(*) AS n FROM stories WHERE author <> '' GROUP BY author ORDER BY n DESC LIMIT 300"),
        ]);
        return { ...tot.results[0], secs: secs.results, authors: authors.results };
      });
      const sections = r.secs.map((x) => ({ ...x, name: categories[x.sec]?.name ?? x.sec }));
      const { secs: _s, ...rest } = r;
      return json({ ...rest, sections }, 200, 3600);
    }
    const where = [], binds = [];
    const words = ftsQuery(p('q'));
    if (words) { where.push('s.id IN (SELECT rowid FROM fts WHERE fts MATCH ?)'); binds.push(words); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(p('desde'))) { where.push('s.date >= ?'); binds.push(`${p('desde')}T00:00:00`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(p('hasta'))) { where.push('s.date <= ?'); binds.push(`${p('hasta')}T23:59:59`); }
    if (p('seccion')) { const slugs = withChildren(p('seccion')); where.push(`(${slugs.map(() => 's.cats LIKE ?').join(' OR ')})`); binds.push(...slugs.map((s) => `% ${s} %`)); }
    // One or more authors (?autor=A&autor=B): a columnist signs with or without a title ("Lcdo. Walter Pérez" / "Walter Pérez")
    const autores = [...new Set(u.searchParams.getAll('autor').map((a) => a.trim()).filter(Boolean))].slice(0, 4);
    if (autores.length) { where.push(`s.author IN (${autores.map(() => '?').join(',')})`); binds.push(...autores); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order = p('orden') === 'vistas' ? 's.views DESC, s.date DESC' : 's.date DESC';
    const per = Math.min(100, Math.max(1, Number(p('por')) || 20)), page = Math.max(1, Number(p('pagina')) || 1);
    const [count, rows] = await env.BUSCAR.batch([
      env.BUSCAR.prepare(`SELECT COUNT(*) AS n FROM stories s ${w}`).bind(...binds),
      env.BUSCAR.prepare(`SELECT s.id, s.path, s.title, s.descr, s.date, s.sec, s.author, s.views, s.img FROM stories s ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...binds, per, (page - 1) * per),
    ]);
    const results = rows.results.map((r) => ({ ...r, secName: categories[r.sec]?.name ?? r.sec }));
    return json({ total: count.results[0].n, page, per, results });
  } catch (e) {
    return json({ error: 'No se pudo buscar.', detail: String(e?.message ?? e).slice(0, 200) }, 500, 0);
  }
}
