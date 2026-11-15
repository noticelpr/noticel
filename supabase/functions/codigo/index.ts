// NotiCel copy of Noticias Xtra's function (2026-11-15). NotiCel's own settings come from Supabase secrets, so no
// address or account lives in this public code: SITE_URL (where the panel is: the test site until switch day, then
// https://noticel.com), MAIL_FROM (e.g. "NotiCel <noreply@noticel.com>", once noticel.com is verified in Resend) and
// RESEND_API_KEY. Optional for equipo: CF_ACCESS_TOKEN, CF_ACCOUNT_ID, CF_ACCESS_POLICY (Cloudflare lock on the panel).
// Supabase Edge Function "codigo": two-step verification with a 6-digit code by email.
//   send   → emails a new code to the signed-in person (good for 10 minutes; at most one a minute)
//   verify → checks the code (5 tries); when it's right, this sign-in counts as verified for 24 hours.
//            With "remember": true it also returns a device key, so this device can skip the code for 30 days
//   trust  → a remembered device (its key): this sign-in counts as verified without a code
//   forget → forgets every remembered device of this account (Mi cuenta, and after a password change)
// Remembered devices: table trusted_devices (supabase/recordar.sql); only a hash of each key is stored.
// The team: required to enter the panel; the database only gives staff powers to verified sign-ins
// (supabase/seguridad.sql: sesion_verificada()). Readers: optional, turned on in Mi perfil → Ajustes.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor → name "codigo" → paste this file.
// Uses the RESEND_API_KEY secret (already there); SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are built in.

const FROM = Deno.env.get('MAIL_FROM') || 'NotiCel <noreply@noticel.com>';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const claims = (token: string) => { try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; } };
const sha = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const mask = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '•'.repeat(Math.min(6, b.length)) + c);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const base = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
    if (!who.ok) return out({ error: 'Tu sesión venció. Entra otra vez.' }, 401);
    const me = await who.json();
    const sid = claims(auth.replace(/^Bearer /, '')).session_id;
    if (!sid) return out({ error: 'Entra otra vez.' }, 401);
    const onTeam = (await (await fetch(`${base}/rest/v1/staff?user_id=eq.${me.id}&select=user_id`, { headers: db })).json()).length > 0;
    const body = await req.json().catch(() => ({}));
    const row = (await (await fetch(`${base}/rest/v1/staff_codes?session_id=eq.${sid}&select=*`, { headers: db })).json())[0];

    if (body.action === 'send') {
      if (row?.sent_at && Date.now() - Date.parse(row.sent_at) < 60_000) return out({ error: 'Ya te enviamos un código hace menos de un minuto. Revisa tu correo (y la carpeta de spam).' }, 429);
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
      const save = await fetch(`${base}/rest/v1/staff_codes?on_conflict=session_id`, { method: 'POST', headers: { ...db, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ session_id: sid, user_id: me.id, code_hash: await sha(`${code}:${sid}`), expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), tries: 0, sent_at: new Date().toISOString(), verified_at: null }) });
      if (!save.ok) return out({ error: 'Falta un paso en la base de datos (supabase/seguridad.sql).' }, 500);
      const key = Deno.env.get('RESEND_API_KEY');
      const html = card(`${h1(onTeam ? 'Tu código para entrar al panel' : 'Tu código de verificación')}
<p style="margin:0 0 8px">${onTeam ? 'Escribe este código en el panel de NotiCel:' : 'Escribe este código en NotiCel para confirmar que eres tú:'}</p>
<p style="font-size:34px;font-weight:bold;letter-spacing:.25em;color:#000000;margin:8px 0 16px">${code}</p>
<p style="color:#5C5F6E;font-size:13px;line-height:1.5;margin:0 0 12px">Vence en 10 minutos. Si no lo pediste tú, alguien tiene tu contraseña: cámbiala en Mi perfil → Ajustes${onTeam ? ' y avísale al administrador' : ''}.</p>`,
        'Este correo se envía automáticamente; no lo contestes. NotiCel · noticel.com', `${code} es tu código`);
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [me.email], subject: `${code} es tu código para entrar a NotiCel`, html }) });
      return r.ok ? out({ ok: true, to: mask(me.email) }) : out({ error: 'No se pudo enviar el correo. Intenta otra vez en un minuto.' }, 500);
    }

    // A remembered device: its key must belong to this account and not be older than 30 days
    if (body.action === 'trust') {
      const key = String(body.device ?? '');
      if (!/^[a-f0-9]{64}$/.test(key)) return out({ error: 'Este dispositivo no está recordado.' }, 400);
      const dev = (await (await fetch(`${base}/rest/v1/trusted_devices?token_hash=eq.${await sha(`device:${key}`)}&user_id=eq.${me.id}&expires_at=gt.${new Date().toISOString()}&select=id`, { headers: db })).json().catch(() => []))[0];
      if (!dev) return out({ error: 'Este dispositivo ya no está recordado.' }, 403);
      const ok = await fetch(`${base}/rest/v1/staff_codes?on_conflict=session_id`, { method: 'POST', headers: { ...db, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ session_id: sid, user_id: me.id, code_hash: null, tries: 0, verified_at: new Date().toISOString() }) });
      await fetch(`${base}/rest/v1/trusted_devices?id=eq.${dev.id}`, { method: 'PATCH', headers: db, body: JSON.stringify({ last_used_at: new Date().toISOString() }) });
      return ok.ok ? out({ ok: true }) : out({ error: 'Falta un paso en la base de datos (supabase/seguridad.sql).' }, 500);
    }
    if (body.action === 'forget') {
      await fetch(`${base}/rest/v1/trusted_devices?user_id=eq.${me.id}`, { method: 'DELETE', headers: db });
      return out({ ok: true });
    }

    if (body.action === 'verify') {
      if (!row?.code_hash) return out({ error: 'Pide un código primero.' }, 400);
      if (Date.parse(row.expires_at) < Date.now()) return out({ error: 'Ese código venció. Toca «Reenviar código».' }, 400);
      if (row.tries >= 5) return out({ error: 'Demasiados intentos. Toca «Reenviar código» para recibir uno nuevo.' }, 429);
      const good = (await sha(`${String(body.code ?? '').replace(/\D/g, '')}:${sid}`)) === row.code_hash;
      await fetch(`${base}/rest/v1/staff_codes?session_id=eq.${sid}`, { method: 'PATCH', headers: db,
        body: JSON.stringify(good ? { verified_at: new Date().toISOString(), code_hash: null } : { tries: row.tries + 1 }) });
      if (!good) return out({ error: `Ese código no es correcto. Te quedan ${4 - row.tries} intentos.` }, 400);
      if (body.remember !== true) return out({ ok: true });
      // "Recordar este dispositivo por 30 días": a random key for this device; the database keeps only its hash
      const key = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const saved = await fetch(`${base}/rest/v1/trusted_devices`, { method: 'POST', headers: { ...db, Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: me.id, token_hash: await sha(`device:${key}`), label: String(body.label ?? '').slice(0, 80), expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }) });
      return out(saved.ok ? { ok: true, device: key } : { ok: true });
    }
    return out({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    return out({ error: (e as Error).message }, 500);
  }
});

/** Every NotiCel email has the same look (user, 2026-11-03): a white card on a light gray page, the logo (with
 *  its own white margin), a purple and a blue line, the message, and a small gray footer. Light only: email apps in
 *  dark mode (iPhone Mail, Outlook) keep it white, so the text always reads. Same design in the functions "correos",
 *  "codigo", "equipo" and "boletin". */
function card(inner: string, foot: string, preheader = ''): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only}</style></head>
<body style="margin:0;padding:0;background:#F3F3F8" bgcolor="#F3F3F8">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3F3F8" style="background:#F3F3F8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#16161D">
<tr><td bgcolor="#FFFFFF" style="padding:20px 28px 16px;border-bottom:4px solid #000000"><a href="${(Deno.env.get('SITE_URL') || 'https://noticel.com').replace(/\/$/, '')}" style="text-decoration:none"><img src="${(Deno.env.get('SITE_URL') || 'https://noticel.com').replace(/\/$/, '')}/logo.png" width="140" height="59" alt="NotiCel" style="display:block;border:0;width:140px;height:59px"></a></td></tr>
<tr><td bgcolor="#009DE9" style="background:#009DE9;height:3px;line-height:3px;font-size:0">&nbsp;</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:28px 28px 8px;font-size:16px;line-height:1.55;color:#16161D">${inner}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:16px 28px 22px;border-top:1px solid #E2E3EA;font-size:12px;line-height:1.5;color:#5C5F6E">${foot}</td></tr>
</table></td></tr></table></body></html>`;
}
const h1 = (t: string) => `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#000000">${t}</h1>`;
const btn = (href: string, label: string) => `<p style="margin:18px 0 20px"><a href="${href}" style="display:inline-block;background:#000000;color:#FFFFFF;font-weight:bold;font-size:16px;padding:13px 26px;border-radius:999px;text-decoration:none">${label}</a></p>`;
