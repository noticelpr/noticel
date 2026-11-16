// NotiCel copy of Noticias Xtra's "publicar" (synced 2026-11-16 to match the panel copied from Noticias Xtra).
// Supabase Edge Function "publicar": an editor or admin publishes a staff article to the site; with action "delete",
// the administrator deletes a story for good; with action "settings", the administrator saves Panel → Ajustes.
// Periodistas never publish: they send stories to review, also with a future time, and an editor approves them (user, 2026-11-02).
// It saves the story file in GitHub (src/content/noticias/<slug>.md); that push rebuilds the site in about 2 minutes
// and keeps the story's full history. Then it marks the article as published (or scheduled) in the `articles` table.
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor → name "publicar" → paste this file.
// Secret: GITHUB_TOKEN (Edge Functions → Secrets): a fine-grained GitHub token for this repository only,
// with "Contents: Read and write". SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are built in.
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

const REPO = 'noticelpr/noticel'; // NotiCel's own GitHub repository (same value as src/lib/repo.ts)
const BRANCH = 'main';
const DIR = 'src/content/noticias';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const base = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = Deno.env.get('GITHUB_TOKEN');
    if (!token) return json({ error: 'Falta el secreto GITHUB_TOKEN en Supabase (Edge Functions → Secrets).' }, 500);

    // Who is asking, and are they allowed to publish?
    const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: req.headers.get('Authorization') ?? '' } });
    if (!who.ok) return json({ error: 'Tu sesión venció. Sal y vuelve a entrar al panel.' }, 401);
    const user = await who.json();
    const db = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
    const staff = (await (await fetch(`${base}/rest/v1/staff?user_id=eq.${user.id}&select=name,role`, { headers: db })).json())[0];
    // Periodistas send their stories to review (also with a future time); an editor or the admin approves and publishes or schedules them
    // An Editor ('desk', supabase/editores.sql) publishes any periodista's story, like the Editor en jefe
    if (!staff || !['admin', 'editor', 'desk'].includes(staff.role)) return json({ error: staff?.role === 'reporter' ? 'Un editor aprueba y publica tus noticias: envíala a revisión.' : 'Solo los editores y el administrador pueden publicar.' }, 403);

    const body = await req.json();
    const gh = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'noticel-publicar' };
    const url = (s: string) => `https://api.github.com/repos/${REPO}/contents/${DIR}/${s}.md`;

    // «Borrar para siempre» (user, 2026-11-03): only the administrator. The story's file leaves the site (GitHub keeps
    // the old versions in its history, as with any change) and its copy in the panel (articles) is deleted.
    if (body.action === 'delete') {
      if (staff.role !== 'admin') return json({ error: 'Solo el administrador puede borrar noticias para siempre.' }, 403);
      const name = String(body.slug ?? '');
      if (!/^[a-z0-9][a-z0-9-]{3,120}$/.test(name)) return json({ error: 'Noticia no válida.' }, 400);
      const found = await fetch(`${url(name)}?ref=${BRANCH}`, { headers: gh });
      if (found.status === 401 || found.status === 403) return json({ error: 'GitHub rechazó el permiso. Revisa el GITHUB_TOKEN.' }, 502);
      if (found.ok) {
        const del = await fetch(url(name), { method: 'DELETE', headers: gh, body: JSON.stringify({ message: `Borra: ${name} (${staff.name}, panel de la redacción)`, sha: (await found.json()).sha, branch: BRANCH }) });
        if (!del.ok) return json({ error: `GitHub no pudo borrarla (${del.status}). Intenta otra vez en un minuto.` }, 502);
      } else if (found.status !== 404) return json({ error: `GitHub no respondió (${found.status}). Intenta otra vez.` }, 502);
      await fetch(`${base}/rest/v1/articles?slug=eq.${encodeURIComponent(name)}`, { method: 'DELETE', headers: db });
      if (typeof body.id === 'string' && body.id) await fetch(`${base}/rest/v1/articles?id=eq.${encodeURIComponent(body.id)}`, { method: 'DELETE', headers: db });
      return json({ ok: true, deleted: name });
    }

    // Panel → Ajustes (user, 2026-11-03): only the administrator. Saves src/data/ajustes.json; the site rebuilds by itself.
    if (body.action === 'settings') {
      if (staff.role !== 'admin') return json({ error: 'Solo el administrador cambia los ajustes.' }, 403);
      const KEYS: Record<string, number> = { tagline: 80, description: 300, email: 120, salesEmail: 120, phone: 30, legalName: 120, address: 200 };
      const v = body.settings ?? {}, out: Record<string, unknown> = {};
      for (const [k, max] of Object.entries(KEYS)) out[k] = String(v[k] ?? '').trim().slice(0, max);
      out.invoiceDays = Math.min(90, Math.max(0, Math.round(Number(v.invoiceDays) || 15)));
      for (const k of ['email', 'salesEmail']) if (out[k] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(out[k]))) return json({ error: 'Revisa los correos.' }, 400);
      const path = `https://api.github.com/repos/${REPO}/contents/src/data/ajustes.json`;
      const cur = await fetch(`${path}?ref=${BRANCH}`, { headers: gh });
      const put = await fetch(path, { method: 'PUT', headers: gh, body: JSON.stringify({ message: `Ajustes del sitio (${staff.name}, panel de la redacción)`, content: encodeBase64(new TextEncoder().encode(JSON.stringify(out, null, 2) + '\n')), branch: BRANCH, ...(cur.ok ? { sha: (await cur.json()).sha } : {}) }) });
      return put.ok ? json({ ok: true, settings: out }) : json({ error: `GitHub no aceptó los ajustes (${put.status}).` }, 502);
    }

    const { id, slug, file, title, scheduled } = body;
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{5,90}$/.test(slug ?? '') || typeof file !== 'string' || !file.startsWith('---\n') || file.length > 500_000) {
      return json({ error: 'La noticia no tiene el formato correcto.' }, 400);
    }
    const art = (await (await fetch(`${base}/rest/v1/articles?id=eq.${encodeURIComponent(id)}&select=id,slug,owner,status`, { headers: db })).json())[0];
    if (!art) return json({ error: 'Guarda la noticia antes de publicarla.' }, 404);

    // Updates keep the same file; a new story gets its own name (a short suffix if that name is taken)
    let name: string = art.slug || slug;
    let sha: string | undefined;
    const found = await fetch(`${url(name)}?ref=${BRANCH}`, { headers: gh });
    if (found.status === 401 || found.status === 403) return json({ error: 'GitHub rechazó el permiso. Revisa el GITHUB_TOKEN.' }, 502);
    if (found.ok) {
      if (art.slug) sha = (await found.json()).sha;
      else name = `${slug}-${id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-5)}`;
    }

    const put = await fetch(url(name), {
      method: 'PUT',
      headers: gh,
      body: JSON.stringify({
        message: `${sha ? 'Actualiza' : 'Publica'}: ${String(title || name).slice(0, 120)} (${staff.name}, panel de la redacción)`,
        content: encodeBase64(new TextEncoder().encode(file)),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!put.ok) return json({ error: `GitHub no aceptó la noticia (${put.status}). Intenta otra vez en un minuto.` }, 502);

    const now = new Date().toISOString();
    await fetch(`${base}/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: db,
      body: JSON.stringify({ status: scheduled ? 'scheduled' : 'published', slug: name, published_by: staff.name, published_at: now, updated_at: now }),
    });
    return json({ ok: true, slug: name });
  } catch (e) {
    return json({ error: `No se pudo publicar: ${e instanceof Error ? e.message : e}` }, 500);
  }
});
