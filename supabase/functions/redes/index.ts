// Supabase Edge Function "redes": posts published stories to Instagram (image + caption) and Facebook (link post).
// The panel (Escribir → Redes sociales) asks for a post when a story is published; scheduled stories wait in the
// `social_posts` table until their time, and a job every 5 minutes (supabase/redes.sql) sends what is due.
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor → name "redes" → paste this file.
// Secrets (Edge Functions → Secrets), from the Meta developer app connected to the NotiCel page:
//   META_PAGE_ID     the Facebook page's ID
//   META_PAGE_TOKEN  a long-lived page access token (permissions: pages_manage_posts, instagram_content_publish…)
//   IG_USER_ID       the Instagram business account ID linked to that page
//   GRAPH_VERSION    optional, e.g. v26.0 (Meta retires old versions every couple of years)
// Without them, requests are saved as "skipped" with a note, so nothing goes out by surprise once they are added.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Row = { id: number; article_id: string; network: 'instagram' | 'facebook'; payload: Record<string, string>; attempts: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const base = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  const rest = (path: string, init: RequestInit = {}) => fetch(`${base}/rest/v1/${path}`, { ...init, headers: { ...db, ...(init.headers || {}) } });
  const pageId = Deno.env.get('META_PAGE_ID'), pageToken = Deno.env.get('META_PAGE_TOKEN'), igUser = Deno.env.get('IG_USER_ID');
  const graph = `https://graph.facebook.com/${Deno.env.get('GRAPH_VERSION') || 'v26.0'}`;
  const connected = { facebook: !!(pageId && pageToken), instagram: !!(igUser && pageToken) };

  async function meta(path: string, params: Record<string, string>) {
    const r = await fetch(`${graph}/${path}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: pageToken! }) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || out.error) throw new Error(out.error?.message || `Meta respondió ${r.status}`);
    return out;
  }
  async function postOne(row: Row): Promise<string> {
    if (row.network === 'facebook') return (await meta(`${pageId}/feed`, { message: row.payload.message, link: row.payload.link })).id;
    // Instagram: make the container, wait until Meta has fetched the image, then publish
    const { id } = await meta(`${igUser}/media`, { image_url: row.payload.image, caption: row.payload.caption });
    for (let i = 0; i < 10; i++) {
      const st = await (await fetch(`${graph}/${id}?fields=status_code&access_token=${pageToken}`)).json().catch(() => ({}));
      if (st.status_code === 'FINISHED') break;
      if (st.status_code === 'ERROR') throw new Error('Instagram no pudo procesar la imagen.');
      await new Promise((r) => setTimeout(r, 1500));
    }
    return (await meta(`${igUser}/media_publish`, { creation_id: id })).id;
  }
  /** Sends what is due (at most 10 at a time); a failure is retried on the next run, up to 3 tries. */
  async function process() {
    const due: Row[] = await (await rest(`social_posts?status=eq.pending&due_at=lte.${new Date().toISOString()}&order=due_at.asc&limit=10&select=id,article_id,network,payload,attempts`)).json().catch(() => []);
    let sent = 0;
    for (const row of Array.isArray(due) ? due : []) {
      try {
        const postId = await postOne(row); sent++;
        await rest(`social_posts?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'sent', result: postId, sent_at: new Date().toISOString() }) });
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300), tries = row.attempts + 1;
        await rest(`social_posts?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ attempts: tries, result: msg, ...(tries >= 3 ? { status: 'error' } : {}) }) });
        if (tries >= 3) await rest('panel_errors', { method: 'POST', body: JSON.stringify({ who: 'Redes sociales', what: `${row.network === 'instagram' ? 'Instagram' : 'Facebook'}: ${row.article_id}`, detail: msg }) });
      }
    }
    return sent;
  }

  try {
    const body = await req.json().catch(() => ({}));
    // The job every 5 minutes only sends what staff already queued, so it needs no login
    if (body.action === 'process') return json({ sent: await process() });

    // Queue a story's posts: staff only
    const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: req.headers.get('Authorization') ?? '' } });
    if (!who.ok) return json({ error: 'Tu sesión venció. Sal y vuelve a entrar al panel.' }, 401);
    const user = await who.json();
    const staff = (await (await rest(`staff?user_id=eq.${user.id}&select=name,role`)).json())[0];
    if (!staff || !['admin', 'editor', 'reporter'].includes(staff.role)) return json({ error: 'Solo el equipo de la redacción puede publicar en redes.' }, 403);
    const { id, slug, due, ig, fb } = body;
    if (typeof id !== 'string' || typeof slug !== 'string') return json({ error: 'Faltan datos de la noticia.' }, 400);
    const when = Number.isNaN(Date.parse(due)) ? new Date().toISOString() : new Date(due).toISOString();
    const rows = [
      ig && { network: 'instagram', payload: { image: String(ig.image), caption: String(ig.caption).slice(0, 2200) } },
      fb && { network: 'facebook', payload: { message: String(fb.message).slice(0, 2000), link: String(fb.link) } },
    ].filter(Boolean).map((r: any) => ({ article_id: id, slug, network: r.network, payload: r.payload, due_at: when, created_by: staff.name,
      status: connected[r.network as 'instagram' | 'facebook'] ? 'pending' : 'skipped', result: connected[r.network as 'instagram' | 'facebook'] ? '' : 'La cuenta todavía no está conectada.' }));
    // One post per story and network: publishing a correction later doesn't post again
    const ins = await rest('social_posts?on_conflict=article_id,network', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(rows) });
    const added: Array<{ network: string; status: string }> = ins.ok ? await ins.json() : [];
    if (!ins.ok) return json({ error: 'No se pudo guardar el pedido para redes (¿falta correr supabase/redes.sql?).' }, 500);
    await process();
    const skipped = added.filter((r) => r.status === 'skipped').map((r) => (r.network === 'instagram' ? 'Instagram' : 'Facebook'));
    const note = !added.length ? 'Esta noticia ya se había enviado a redes antes.'
      : skipped.length ? `${skipped.join(' y ')}: la cuenta todavía no está conectada; no se envió.`
      : Date.parse(when) > Date.now() + 60_000 ? 'Redes sociales: saldrán a la hora programada.' : 'Redes sociales: enviado.';
    return json({ ok: true, note });
  } catch (e) {
    return json({ error: `Redes sociales: ${e instanceof Error ? e.message : e}` }, 500);
  }
});
