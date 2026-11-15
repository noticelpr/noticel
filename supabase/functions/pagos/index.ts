// NotiCel copy of Noticias Xtra's function (2026-11-15). NotiCel's settings come from Supabase secrets, never this
// public code: SITE_URL (the test site until switch day, then https://noticel.com), MAIL_FROM / TEAM_EMAIL (correos),
// RESEND_API_KEY, STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (pagos: NotiCel's own Stripe account).
// Supabase Edge Function "pagos": card payments with Stripe for the Anúnciate page (/publicidad/ and /en/advertise/).
//   checkout → the page sends the request's id; this reads the request from the database (never the price the page
//              sends) and opens a Stripe payment page for that exact amount: card, Apple Pay, Google Pay.
//   Stripe   → when the payment goes through, Stripe calls this same function (a "webhook", signed by Stripe); only
//              then the request is marked paid, with the payment written in its lines. Coming back to the page
//              doesn't mark anything paid.
//   Monthly subscription (user, 2026-11-06; duration "1 mes · se renueva cada mes"): the payment page charges the
//              card every month. Each month Stripe sends "invoice.paid" and the ad's end date moves one month ahead;
//              when the client cancels ("customer.subscription.deleted") it runs to the end of the paid month.
//              In Stripe → Webhooks, this endpoint also needs the events invoice.paid and customer.subscription.deleted.
//   reembolsar → the panel's "Rechazar y reembolsar" (user, 2026-11-07), only for someone on the team (staff table):
//              a card payment is refunded in full in Stripe and a monthly subscription is cancelled (every month it
//              charged is refunded). The request gets a "Reembolso: …" line, which the rejection email reads.
//              ATH Móvil and other payments can't be refunded from here: the answer says so, and the team does it by hand.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor → name "pagos" → paste this file.
// Then turn OFF "Verify JWT" for "pagos" (Stripe doesn't sign in to Supabase), like "redactor" and "correos".
// Secrets (Edge Functions → Secrets), pasted by the owner, never in this file:
//   STRIPE_SECRET_KEY      Stripe → Developers → API keys → Secret key (sk_test_… while testing, sk_live_… for real)
//   STRIPE_WEBHOOK_SECRET  Stripe → Developers → Webhooks → this endpoint → Signing secret (whsec_…)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are built in.

const SITE = (Deno.env.get('SITE_URL') || 'https://noticel.com').replace(/\/$/, '');
const MAX_AGE_DAYS = 45; // a request older than this needs a new quote from the sales team (salespeople send payment links for approved orders)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Req = { id: string; created_at: string; paid: boolean; status: string; total: number; duration: string | null; client: { name?: string; business?: string; email?: string; lang?: string }; lines: string[] | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return out({ error: 'Los pagos con tarjeta todavía no están activados.' }, 503);
  const base = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  const getReq = async (id: string): Promise<Req | undefined> =>
    (await (await fetch(`${base}/rest/v1/ad_requests?id=eq.${encodeURIComponent(id)}&select=id,created_at,paid,status,total,duration,client,lines`, { headers: db })).json())[0];

  const raw = await req.text();

  /** Stripe's API with the secret key; throws with Stripe's message on an error. */
  const stripe = async (path: string, method = 'GET', form?: Record<string, string>) => {
    const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form ? new URLSearchParams(form) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error?.message ?? `Stripe ${r.status}`); return j;
  };
  /** The panel's refund (someone on the team only). Returns [answer, status]. */
  async function refund(id: string): Promise<[Record<string, unknown>, number]> {
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: req.headers.get('Authorization') ?? '' } });
    if (!who.ok) return [{ error: 'Tu sesión venció. Entra otra vez.' }, 401];
    const me = await who.json();
    const role = (await (await fetch(`${base}/rest/v1/staff?user_id=eq.${me.id}&select=role`, { headers: db })).json())[0]?.role;
    if (!role || role === 'reporter') return [{ error: 'Solo el equipo de anuncios puede reembolsar.' }, 403];
    const r = await getReq(id);
    if (!r) return [{ error: 'No encontramos la solicitud.' }, 404];
    const lines = r.lines ?? [];
    if (lines.some((l) => l.startsWith('Reembolso:'))) return [{ ok: true, already: true }, 200];
    if (!r.paid) return [{ ok: true, unpaid: true }, 200];
    const pay = lines.find((l) => l.startsWith('Pago: Tarjeta (Stripe)'));
    if (!pay) return [{ ok: true, manual: true }, 200]; // ATH Móvil, transfer…: by hand
    const pi = pay.match(/\bpi_[A-Za-z0-9]+/)?.[0], sub = pay.match(/\bsub_[A-Za-z0-9]+/)?.[0];
    const intents: string[] = [];
    if (sub) {
      // Every month the subscription charged, then cancel it so it never charges again
      const invs = await stripe(`invoices?subscription=${sub}&status=paid&limit=24`);
      for (const inv of invs.data ?? []) {
        let p = typeof inv.payment_intent === 'string' ? inv.payment_intent : inv.payment_intent?.id; // older API versions
        if (!p) { const ip = await stripe(`invoice_payments?invoice=${inv.id}&limit=5`).catch(() => ({ data: [] })); p = ip.data?.find((x: any) => x.payment?.payment_intent)?.payment?.payment_intent; }
        if (p) intents.push(typeof p === 'string' ? p : p.id);
      }
      await stripe(`subscriptions/${sub}`, 'DELETE').catch((e) => { if (!/No such subscription|canceled/i.test((e as Error).message)) throw e; });
    } else if (pi) intents.push(pi);
    if (!intents.length) return [{ ok: true, manual: true, error: 'No encontramos el pago en Stripe: reembólsalo a mano.' }, 200];
    let cents = 0; const ids: string[] = [];
    for (const p of intents) {
      try { const rf = await stripe('refunds', 'POST', { payment_intent: p, 'metadata[request_id]': r.id, reason: 'requested_by_customer' }); cents += Number(rf.amount) || 0; ids.push(rf.id); }
      catch (e) { if (!/already been refunded/i.test((e as Error).message)) throw e; }
    }
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' });
    const note = `Reembolso: Tarjeta (Stripe) · ${day} · $${(cents / 100).toFixed(2)} · ${ids.join(', ') || 'ya estaba reembolsado'}${sub ? ' · suscripción cancelada' : ''}`;
    await fetch(`${base}/rest/v1/ad_requests?id=eq.${encodeURIComponent(r.id)}`, { method: 'PATCH', headers: db, body: JSON.stringify({ status: 'rechazada', lines: [...lines, note] }) });
    return [{ ok: true, refunded: cents / 100 }, 200];
  }

  // ---- Stripe: a payment went through ----
  const sig = req.headers.get('stripe-signature');
  if (sig) {
    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!secret || !(await signedByStripe(raw, sig, secret))) return out({ error: 'firma' }, 400);
    const ev = JSON.parse(raw);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' });
    const addLines = async (r: Req, more: string[], extra: Record<string, unknown> = {}) =>
      fetch(`${base}/rest/v1/ad_requests?id=eq.${encodeURIComponent(r.id)}`, { method: 'PATCH', headers: db, body: JSON.stringify({ ...extra, lines: [...(r.lines ?? []), ...more] }) });
    // Monthly subscription: each new month paid moves the ad's end date one month ahead
    if (ev.type === 'invoice.paid') {
      const inv = ev.data.object;
      if (inv.billing_reason !== 'subscription_cycle') return out({ ok: true, first: true }); // the first month comes with checkout.session.completed
      const id = String(inv.subscription_details?.metadata?.request_id ?? inv.parent?.subscription_details?.metadata?.request_id ?? '');
      const r = id ? await getReq(id) : undefined;
      if (!r) return out({ ok: true, unknown: true });
      const camp = (await (await fetch(`${base}/rest/v1/ad_campaigns?id=eq.${encodeURIComponent(r.id.toLowerCase())}&select=end_date`, { headers: db })).json())[0];
      let end = '';
      if (camp) {
        const from = new Date(`${(camp.end_date > today ? camp.end_date : today)}T12:00:00`);
        from.setMonth(from.getMonth() + 1);
        end = from.toISOString().slice(0, 10);
        await fetch(`${base}/rest/v1/ad_campaigns?id=eq.${encodeURIComponent(r.id.toLowerCase())}`, { method: 'PATCH', headers: db, body: JSON.stringify({ end_date: end, status: 'active' }) });
      }
      await addLines(r, [`Pago mensual: Tarjeta (Stripe) · ${today} · $${(Number(inv.amount_paid) / 100).toFixed(2)} · ${inv.id}${end ? ` · sale hasta el ${end}` : ''}`]);
      return out({ ok: true, renewed: true });
    }
    if (ev.type === 'customer.subscription.deleted') {
      const sub = ev.data.object;
      const r = await getReq(String(sub.metadata?.request_id ?? ''));
      if (r) await addLines(r, [`Suscripción cancelada · ${today} · el anuncio sale hasta el final del mes pagado`]);
      return out({ ok: true, cancelled: true });
    }
    if (ev.type !== 'checkout.session.completed' && ev.type !== 'checkout.session.async_payment_succeeded') return out({ ok: true, ignored: ev.type });
    const s = ev.data.object;
    if (s.payment_status !== 'paid') return out({ ok: true, waiting: true }); // e.g. a bank payment still on its way
    const r = await getReq(String(s.client_reference_id ?? s.metadata?.request_id ?? ''));
    if (!r) return out({ ok: true, unknown: true });
    if (r.paid) return out({ ok: true, already: true });
    const paidUsd = Number(s.amount_total) / 100;
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' });
    const note = s.mode === 'subscription'
      ? `Pago: Tarjeta (Stripe), suscripción mensual · ${day} · $${paidUsd.toFixed(2)} · ${s.subscription ?? s.id} · se cobra cada mes hasta que el cliente cancele`
      : `Pago: Tarjeta (Stripe) · ${day} · $${paidUsd.toFixed(2)} · ${s.payment_intent ?? s.id}`;
    const short = Math.abs(paidUsd - Number(r.total)) > 0.01 ? [`Atención: se cobró $${paidUsd.toFixed(2)} y la solicitud dice $${Number(r.total).toFixed(2)}`] : [];
    await fetch(`${base}/rest/v1/ad_requests?id=eq.${encodeURIComponent(r.id)}`, { method: 'PATCH', headers: db,
      body: JSON.stringify({ paid: true, lines: [...(r.lines ?? []), note, ...short] }) });
    return out({ ok: true });
  }

  // ---- The panel: refund a rejected ad ----
  try {
    const body = JSON.parse(raw || '{}');
    if (body.action === 'reembolsar') return out(...(await refund(String(body.id ?? ''))));
    if (body.action !== 'checkout') return out({ error: 'Acción desconocida.' }, 400);
    const r = await getReq(String(body.id ?? ''));
    const en = r?.client?.lang === 'en';
    if (!r) return out({ error: en ? 'We could not find your request. Try again.' : 'No encontramos tu solicitud. Intenta otra vez.' }, 404);
    if (r.paid) return out({ error: en ? 'This request is already paid.' : 'Esta solicitud ya está pagada.' }, 409);
    if (r.status === 'rechazada') return out({ error: en ? 'This request was not approved.' : 'Esta solicitud no fue aprobada.' }, 409);
    if (Date.now() - Date.parse(r.created_at) > MAX_AGE_DAYS * 864e5) return out({ error: en ? 'This request is too old to pay online. Write to us and we will send you a new quote.' : 'Esta solicitud es muy vieja para pagarla en línea. Escríbenos y te enviamos una cotización nueva.' }, 409);
    const cents = Math.round(Number(r.total) * 100);
    if (!(cents >= 50)) return out({ error: en ? 'The amount is not valid.' : 'La cantidad no es válida.' }, 400);
    const page = en ? `${SITE}/en/advertise/` : `${SITE}/publicidad/`;
    const monthly = /se renueva cada mes|renews every month/.test(r.duration ?? ''); // monthly subscription
    const form = new URLSearchParams({
      mode: monthly ? 'subscription' : 'payment', locale: en ? 'en' : 'es', client_reference_id: r.id, 'metadata[request_id]': r.id,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': String(cents),
      'line_items[0][price_data][product_data][name]': en ? `${monthly ? 'Monthly ad' : 'Ad'} on NotiCel · ${r.id}` : `${monthly ? 'Anuncio mensual' : 'Anuncio'} en NotiCel · ${r.id}`,
      'line_items[0][price_data][product_data][description]': String(r.client?.business ?? '').slice(0, 200) || 'NotiCel',
      ...(monthly
        ? { 'line_items[0][price_data][recurring][interval]': 'month', 'subscription_data[metadata][request_id]': r.id, 'subscription_data[description]': `NotiCel ${r.id} · ${String(r.client?.business ?? '').slice(0, 80)}` }
        : { 'payment_intent_data[description]': `NotiCel ${r.id} · ${String(r.client?.business ?? '').slice(0, 80)}`, 'payment_intent_data[metadata][request_id]': r.id }),
      success_url: `${page}?pagado=1&r=${encodeURIComponent(r.id)}`, cancel_url: `${page}?cancelado=1&r=${encodeURIComponent(r.id)}#campana`,
      expires_at: String(Math.floor(Date.now() / 1000) + 60 * 60), // the payment page works for 1 hour
    });
    if (r.client?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.client.email)) form.set('customer_email', r.client.email);
    const s = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const j = await s.json();
    if (!s.ok || !j.url) return out({ error: en ? 'The payment page could not open. Try again in a minute.' : 'No se pudo abrir la página de pago. Intenta otra vez en un minuto.', detail: j?.error?.message }, 502);
    return out({ url: j.url });
  } catch (e) {
    return out({ error: (e as Error).message }, 500);
  }
});

/** Stripe signs each call: header "t=<time>,v1=<signature>", an HMAC-SHA256 of "<time>.<body>" with the signing secret. */
async function signedByStripe(body: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false; // older than 5 minutes: a replay
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${body}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  return sigs.some((v) => v.length === mac.length && [...v].reduce((a, c, i) => a | (c.charCodeAt(0) ^ mac.charCodeAt(i)), 0) === 0);
}
