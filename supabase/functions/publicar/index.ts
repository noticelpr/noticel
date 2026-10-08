// Supabase Edge Function "publicar": an editor or admin publishes a staff article to the site.
// Reporters can only schedule their own stories for a future time, without labels or pins (approved 2026-10-04).
// It saves the story file in GitHub (src/content/noticias/<slug>.md); that push rebuilds the site in about 2 minutes
// and keeps the story's full history. Then it marks the article as published (or scheduled) in the `articles` table.
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor → name "publicar" → paste this file.
// Secret: GITHUB_TOKEN (Edge Functions → Secrets): a fine-grained GitHub token for this repository only,
// with "Contents: Read and write". SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are built in.
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

const REPO = ''; // NotiCel's own GitHub repository, "owner/name" (same value as src/lib/repo.ts)
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
    if (!staff || !['admin', 'editor', 'reporter'].includes(staff.role)) return json({ error: 'Solo el equipo de la redacción puede publicar.' }, 403);

    const { id, slug, file, title, scheduled } = await req.json();
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{5,90}$/.test(slug ?? '') || typeof file !== 'string' || !file.startsWith('---\n') || file.length > 500_000) {
      return json({ error: 'La noticia no tiene el formato correcto.' }, 400);
    }
    const art = (await (await fetch(`${base}/rest/v1/articles?id=eq.${encodeURIComponent(id)}&select=id,slug,owner,status`, { headers: db })).json())[0];
    if (!art) return json({ error: 'Guarda la noticia antes de publicarla.' }, 404);
    if (staff.role === 'reporter') {
      const when = Date.parse(file.match(/^date: (.+)$/m)?.[1] ?? '');
      if (art.owner !== user.id) return json({ error: 'Solo puedes programar tus propias noticias.' }, 403);
      if (!scheduled || !(when > Date.now() + 60_000)) return json({ error: 'Escoge una fecha y hora futura. Para publicarla ahora, envíala a revisión.' }, 403);
      if (art.slug && art.status !== 'scheduled') return json({ error: 'Esta noticia ya salió: tus cambios van a revisión.' }, 403);
      if (/^(breaking|trending|featured|live|pinned|homeLead|sectionLead|sectionPinned): true$/m.test(file)) return json({ error: 'Las etiquetas y las noticias fijadas las pone un editor.' }, 403);
    }

    // Updates keep the same file; a new story gets its own name (a short suffix if that name is taken)
    const gh = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'noticel-publicar' };
    const url = (s: string) => `https://api.github.com/repos/${REPO}/contents/${DIR}/${s}.md`;
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
