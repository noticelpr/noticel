// Supabase Edge Function "analitica": visitor numbers from Google Analytics for the staff panel (Analítica tab,
// and views per story in Escribir → Publicadas). Only admins, editors and sales (ads) can ask.
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor → name "analitica" → paste this file.
// Secrets (Edge Functions → Secrets):
//   GA_SERVICE_ACCOUNT: the whole JSON key file of a Google service account that has "Viewer" access to the property.
//   GA_PROPERTY_ID: the property's number (Google Analytics → Admin → Property details), e.g. 512345678.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are built in.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = ''; bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** A short-lived Google access token from the service account key (signed JWT, read-only Analytics scope). */
let tokenCache: { token: string; exp: number } | null = null;
async function googleToken(sa: { client_email: string; private_key: string }): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  const out = await r.json();
  if (!r.ok) throw new Error(`Google no aceptó la llave (${out.error_description || out.error || r.status}).`);
  tokenCache = { token: out.access_token, exp: Date.now() + out.expires_in * 1000 };
  return out.access_token;
}

// Same answer for 5 minutes, so opening the panel often doesn't spend Google's daily quota
const cache = new Map<string, { at: number; data: unknown }>();

type Row = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
const rows = (rep: { rows?: Row[] }) => (rep.rows ?? []).map((r) => ({ d: (r.dimensionValues ?? []).map((x) => x.value), m: (r.metricValues ?? []).map((x) => Number(x.value)) }));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const base = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const saText = Deno.env.get('GA_SERVICE_ACCOUNT'), property = Deno.env.get('GA_PROPERTY_ID')?.trim();
    if (!saText || !property) return json({ error: 'Faltan los secretos GA_SERVICE_ACCOUNT y GA_PROPERTY_ID en Supabase (Edge Functions → Secrets).' }, 500);

    // Who is asking? Admins, editors and sales only
    const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: req.headers.get('Authorization') ?? '' } });
    if (!who.ok) return json({ error: 'Tu sesión venció. Sal y vuelve a entrar al panel.' }, 401);
    const user = await who.json();
    const db = { apikey: service, Authorization: `Bearer ${service}` };
    const staff = (await (await fetch(`${base}/rest/v1/staff?user_id=eq.${user.id}&select=role`, { headers: db })).json())[0];
    if (!staff || !['admin', 'editor', 'ads'].includes(staff.role)) return json({ error: 'Solo el administrador, los editores y ventas ven las visitas.' }, 403);

    const body = await req.json().catch(() => ({}));
    const days = [1, 7, 28].includes(body.days) ? body.days : 7;
    const top = Math.min(Math.max(Number(body.top) || 20, 5), 1000);
    const key = `${days}:${top}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 5 * 60_000) return json(hit.data);

    const token = await googleToken(JSON.parse(saText));
    const ga = (path: string, payload: unknown) => fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).then(async (r) => { const o = await r.json(); if (!r.ok) throw new Error(o.error?.message || `Google Analytics respondió ${r.status}`); return o; });

    const dateRanges = [{ startDate: days === 1 ? 'today' : `${days - 1}daysAgo`, endDate: 'today' }];
    const views = [{ metric: { metricName: 'screenPageViews' }, desc: true }];
    const [batch, more, live] = await Promise.all([
      ga('batchRunReports', { requests: [
        { dateRanges, metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }, { name: 'averageSessionDuration' }, { name: 'newUsers' }] },
        { dateRanges, dimensions: [{ name: days === 1 ? 'hour' : 'date' }], metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }], orderBys: [{ dimension: { dimensionName: days === 1 ? 'hour' : 'date' } }] },
        { dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], orderBys: views, limit: top },
        { dateRanges, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8 },
        { dateRanges, dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'activeUsers' }] },
      ] }),
      ga('runReport', { dateRanges, dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 6 }),
      ga('runRealtimeReport', { metrics: [{ name: 'activeUsers' }] }),
    ]);
    const [totals, series, pages, channels, devices] = batch.reports;
    const t = rows(totals)[0]?.m ?? [0, 0, 0, 0, 0];
    const data = {
      days,
      now: rows(live)[0]?.m[0] ?? 0,
      totals: { users: t[0], views: t[1], sessions: t[2], avgSeconds: Math.round(t[3]), newUsers: t[4] },
      series: rows(series).map((r) => ({ at: r.d[0], users: r.m[0], views: r.m[1] })),
      pages: rows(pages).map((r) => ({ path: r.d[0], views: r.m[0], users: r.m[1] })),
      channels: rows(channels).map((r) => ({ name: r.d[0], sessions: r.m[0] })),
      devices: rows(devices).map((r) => ({ name: r.d[0], users: r.m[0] })),
      countries: rows(more).map((r) => ({ name: r.d[0], users: r.m[0] })),
      at: new Date().toISOString(),
    };
    cache.set(key, { at: Date.now(), data });
    return json(data);
  } catch (e) {
    return json({ error: `No se pudieron leer las visitas: ${e instanceof Error ? e.message : e}` }, 500);
  }
});
