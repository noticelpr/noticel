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

export async function onRequestGet({ request, env }) {
  if (!env.BUSCAR) return json({ error: 'La búsqueda del archivo todavía no está conectada.' }, 503, 0);
  const u = new URL(request.url), p = (k) => (u.searchParams.get(k) ?? '').trim();
  try {
    if (p('resumen')) {
      const [tot, secs, authors] = await env.BUSCAR.batch([
        env.BUSCAR.prepare('SELECT COUNT(*) AS total, MIN(date) AS oldest, MAX(date) AS newest, SUM(views) AS views FROM stories'),
        env.BUSCAR.prepare('SELECT sec, COUNT(*) AS n FROM stories GROUP BY sec ORDER BY n DESC'),
        env.BUSCAR.prepare("SELECT author, COUNT(*) AS n FROM stories WHERE author <> '' GROUP BY author ORDER BY n DESC LIMIT 300"),
      ]);
      const sections = secs.results.map((r) => ({ ...r, name: categories[r.sec]?.name ?? r.sec }));
      return json({ ...tot.results[0], sections, authors: authors.results }, 200, 3600);
    }
    const where = [], binds = [];
    const words = ftsQuery(p('q'));
    if (words) { where.push('s.id IN (SELECT rowid FROM fts WHERE fts MATCH ?)'); binds.push(words); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(p('desde'))) { where.push('s.date >= ?'); binds.push(`${p('desde')}T00:00:00`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(p('hasta'))) { where.push('s.date <= ?'); binds.push(`${p('hasta')}T23:59:59`); }
    if (p('seccion')) { const slugs = withChildren(p('seccion')); where.push(`(${slugs.map(() => 's.cats LIKE ?').join(' OR ')})`); binds.push(...slugs.map((s) => `% ${s} %`)); }
    if (p('autor')) { where.push('s.author = ?'); binds.push(p('autor')); }
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
