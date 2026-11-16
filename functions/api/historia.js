// One archive story, in full (2026-11-16): /api/historia?path=/deportes/20191214/mi-noticia/
// From NotiCel's R2 archive (the same files functions/[[path]].js reads), for the panel: Publicadas → Editar opens an
// old story in Escribir (saving it there makes it a regular story built into the site, at the same address).
// The archive is public (every story is a page on the site), so this needs no sign-in.
function shardOf(path) {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) { h ^= path.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 3);
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function onRequestGet({ request, env }) {
  if (!env.ARCHIVO) return json({ error: 'El archivo no está conectado.' }, 503);
  const raw = new URL(request.url).searchParams.get('path') ?? '';
  const path = raw.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase()).replace(/\/?$/, '/');
  if (!/^\/[a-z0-9%/_-]+\/$/i.test(path)) return json({ error: 'Dirección no válida.' }, 400);
  const obj = await env.ARCHIVO.get(`historias/${shardOf(path)}.json.gz`).catch(() => null);
  if (!obj) return json({ error: 'No está en el archivo.' }, 404);
  const group = await new Response(obj.body.pipeThrough(new DecompressionStream('gzip'))).json().catch(() => ({}));
  return group[path] ? json(group[path]) : json({ error: 'No está en el archivo.' }, 404);
}
