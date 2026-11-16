// Supabase Edge Function "reconstruir" (NotiCel, fast publishing, 2026-11-16): the batch rebuild.
// With fast publishing, stories are live within seconds from the database (supabase/rapido.sql), so the site doesn't
// need a full rebuild after each one. The database calls this every 2 hours (supabase/rapido.sql, last part); when
// something was published or edited since the last rebuild, it asks Cloudflare to rebuild the site once. That keeps
// Cloudflare's builds well under the plan's monthly limit, and after the rebuild the built pages take over again.
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor → name "reconstruir" → paste this file,
// and turn off "Verify JWT". Secret: CF_DEPLOY_HOOK (Cloudflare → the Pages project → Settings → Builds → Deploy hooks →
// Add, branch main; paste the address it gives as the secret's value). Without it, nothing happens.

const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async () => {
  const hook = Deno.env.get('CF_DEPLOY_HOOK');
  if (!hook) return out({ skip: 'Falta el secreto CF_DEPLOY_HOOK.' });
  const base = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  const get = async (q: string) => { const r = await fetch(`${base}/rest/v1/${q}`, { headers: db }); return r.ok ? r.json() : []; };

  // The newest change, and the last rebuild this function asked for
  const [last] = await get('live_stories?select=updated_at&order=updated_at.desc&limit=1');
  const [done] = await get('rebuilds?select=at&order=at.desc&limit=1');
  if (!last) return out({ skip: 'Nada publicado todavía.' });
  if (done && Date.parse(done.at) >= Date.parse(last.updated_at)) return out({ skip: 'Nada nuevo desde la última reconstrucción.' });

  const r = await fetch(hook, { method: 'POST' });
  if (!r.ok) return out({ error: `Cloudflare no aceptó la reconstrucción (${r.status}).` }, 502);
  await fetch(`${base}/rest/v1/rebuilds`, { method: 'POST', headers: db, body: JSON.stringify({ at: new Date().toISOString() }) });
  return out({ ok: true, since: done?.at ?? null });
});
