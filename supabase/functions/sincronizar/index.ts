// Supabase Edge Function "sincronizar" (NotiCel, 2026-11-15): starts the copy from noticel.com on time.
// GitHub's own 15-minute schedule (.github/workflows/sync-noticel.yml) never fired for this repository, so the database
// calls this every 5 minutes (supabase/sincronizar.sql) and it starts that job when it's due. Same idea as Noticias
// Xtra's "redactor" function. A run starts only if the last one started 14+ minutes ago and has finished, so calling
// this more often, or by anyone, never starts extra runs. Turn it off on switch day (see supabase/sincronizar.sql).
//
// Deploy: Supabase → Edge Functions → Deploy a new function → name "sincronizar" → paste this file → Deploy.
// Secret: GITHUB_TOKEN with "Actions: Read and write" on the noticelpr/noticel repository (the owner creates it).

const REPO = 'noticelpr/noticel';
const JOB = { file: 'sync-noticel.yml', every: 14 };

Deno.serve(async () => {
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const token = Deno.env.get('GITHUB_TOKEN');
  if (!token) return out({ error: 'Falta el secreto GITHUB_TOKEN en Supabase (Edge Functions → Secrets).' }, 500);
  const gh = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'noticel-sincronizar' };
  const runs = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${JOB.file}/runs?per_page=1`, { headers: gh });
  if (!runs.ok) return out({ error: `GitHub ${runs.status}` }, 502);
  const last = (await runs.json()).workflow_runs?.[0];
  const minutes = last ? (Date.now() - Date.parse(last.created_at)) / 60000 : Infinity;
  if (last && (last.status !== 'completed' || minutes < JOB.every)) return out({ [JOB.file]: `espera (última hace ${Math.round(minutes)} min, ${last.status})` });
  const go = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${JOB.file}/dispatches`, { method: 'POST', headers: gh, body: JSON.stringify({ ref: 'main' }) });
  return out({ [JOB.file]: go.ok ? 'arrancó' : `error GitHub ${go.status}: ${(await go.text()).slice(0, 120)}` });
});
