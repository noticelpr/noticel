// NotiCel copy of Noticias Xtra's function (2026-11-15). NotiCel's own settings come from Supabase secrets, so no
// address or account lives in this public code: SITE_URL (where the panel is: the test site until switch day, then
// https://noticel.com), MAIL_FROM (e.g. "NotiCel <noreply@noticel.com>", once noticel.com is verified in Resend) and
// RESEND_API_KEY. Optional for equipo: CF_ACCESS_TOKEN, CF_ACCOUNT_ID, CF_ACCESS_POLICY (Cloudflare lock on the panel).
// Supabase Edge Function "equipo": the administrator's tools for the team (panel → Equipo).
//   invite         → gives the role and emails an invitation (sent here, see makeLink) whose link opens the panel on
//                    «Crea tu contraseña», for new and existing accounts alike
//   reset_password → emails that person a link to choose a new password
//   forgot         → the panel's «¿Olvidaste tu contraseña?» (no sign-in needed): the same link, team emails only
//   status         → for each team member: invitation accepted or not, last sign-in (the owner's only for the owner)
//   sync_access    → the panel's Cloudflare lock (Access policy "Equipo NotiCel") gets exactly the team's emails.
//                    Also runs after every invitation and whenever Equipo opens (status), so nobody updates it by hand.
// Only an administrator whose sign-in typed its email code can use it (Edge Function "codigo", supabase/seguridad.sql).
// A Gerente (role 'manager', supabase/gerente.sql) can use it for Ventas, periodistas and editors (user, 2026-11-02;
// not administrators or other Gerentes): invite them, send them
// password links, and see their status.
// Columnists (user, 2026-11-17; supabase/columnistas-solicitudes.sql): the Editor en jefe and the Editors approve
// requests and invite columnists from panel → Columnistas; they may invite that role only, with its own two emails.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor → name "equipo" → paste this file.
// Uses the RESEND_API_KEY secret (already there for "correos"); SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are built in.
// Cloudflare lock (user, 2026-11-03): CF_ACCESS_TOKEN, a Cloudflare API token that can only edit Access ("Access: Apps
// and Policies: Edit"). Optional: CF_ACCOUNT_ID (default below), CF_ACCESS_POLICY (default "Equipo NotiCel") and
// CF_ACCESS_ALWAYS (emails that always keep access, comma-separated). Without CF_ACCESS_TOKEN the sync is skipped.

const SITE = (Deno.env.get('SITE_URL') || 'https://noticel.com').replace(/\/$/, '');
const PANEL = `${SITE}/redaccion/`;
const FROM = Deno.env.get('MAIL_FROM') || 'NotiCel <noreply@noticel.com>';
const CF_ACCOUNT = ''; // NotiCel's Cloudflare account id goes in the CF_ACCOUNT_ID secret
const CF_POLICY = 'Equipo NotiCel';
// What a Gerente can manage: everyone but administrators and Gerentes
const MGR_ROLES = ['ads', 'reporter', 'desk', 'editor'];
const ROLES: Record<string, string> = { admin: 'Administrador', editor: 'Editor en jefe', desk: 'Editor', ads: 'Ventas', reporter: 'Periodista', manager: 'Gerente', photo: 'Fotoperiodista', columnist: 'Columnista' };

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const claims = (token: string) => { try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; } };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const base = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  try {
    // «¿Olvidaste tu contraseña?» on the panel's sign-in screen: anyone may ask, but only a team member's email gets the
    // link, at most once a minute, and the answer is the same either way (nobody learns who is on the team).
    const first = await req.clone().json().catch(() => ({}));
    if (first.action === 'forgot') {
      const email = String(first.email ?? '').trim().toLowerCase();
      if (/^\S+@\S+\.\S+$/.test(email)) {
        const all = await (await fetch(`${base}/auth/v1/admin/users?per_page=1000`, { headers: admin })).json().catch(() => ({}));
        const u = (all.users ?? []).find((x: { email?: string }) => x.email?.toLowerCase() === email);
        const onTeam = u && ((await (await fetch(`${base}/rest/v1/staff?user_id=eq.${u.id}&select=user_id`, { headers: admin })).json()) as unknown[]).length;
        const recent = u?.recovery_sent_at && Date.now() - Date.parse(u.recovery_sent_at) < 60_000;
        if (onTeam && !recent) {
          const r = await makeLink('recovery', email);
          if (r) await mail(email, 'Tu nueva contraseña de NotiCel', 'Hola:', `Pediste cambiar tu contraseña del panel de NotiCel. Toca el botón para escoger una nueva. Si no fuiste tú, ignora este correo. ${GATE}`, 'Escoger mi contraseña', r.href);
        }
      }
      return out({ ok: true });
    }

    // Who is asking: a signed-in administrator who passed the second step
    const auth = req.headers.get('Authorization') ?? '';
    const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
    if (!who.ok) return out({ error: 'Tu sesión venció. Sal y vuelve a entrar al panel.' }, 401);
    const me = await who.json();
    const sid = claims(auth.replace(/^Bearer /, '')).session_id;
    const checked = await fetch(`${base}/rest/v1/staff_codes?session_id=eq.${sid}&verified_at=gt.${new Date(Date.now() - 864e5).toISOString()}&select=session_id`, { headers: admin });
    if (checked.ok && !(await checked.json()).length) return out({ error: 'Entra con tu código de verificación para usar esto.' }, 403); // (before seguridad.sql the table doesn't exist: not checked)
    const row = (await (await fetch(`${base}/rest/v1/staff?user_id=eq.${me.id}&select=role,is_owner`, { headers: admin })).json())[0];
    const manager = row?.role === 'manager'; // Ventas, periodistas and editors (MGR_ROLES)
    // The Editor en jefe only reads the newsroom's status (Equipo, read only; user 2026-11-03)
    const chief = row?.role === 'editor';
    const peek = await req.clone().json().catch(() => ({}));
    // The Editor en jefe and the Editors approve columnists (panel → Columnistas → Solicitudes): they may invite that role only (user, 2026-11-17)
    const newsroomColumnist = ['editor', 'desk'].includes(row?.role) && peek.action === 'invite' && peek.role === 'columnist';
    if (row?.role !== 'admin' && !manager && !(chief && peek.action === 'status') && !newsroomColumnist) return out({ error: 'Solo el administrador puede hacer esto.' }, 403);
    const roleOf = async (id: string) => (await (await fetch(`${base}/rest/v1/staff?user_id=eq.${id}&select=role`, { headers: admin })).json())[0]?.role as string | undefined;
    const iAmOwner = !!row?.is_owner; // supabase/dueno.sql
    const owners = new Set(((await (await fetch(`${base}/rest/v1/staff?is_owner=eq.true&select=user_id`, { headers: admin })).json()) ?? []).map((x: { user_id: string }) => x.user_id));
    // Hidden members (supabase/oculto.sql, user 2026-11-14): only the owner knows they're on the team
    const secret = new Set(((await (await fetch(`${base}/rest/v1/staff?hidden=eq.true&select=user_id`, { headers: admin })).json().catch(() => [])) ?? []).map((x: { user_id: string }) => x.user_id));

    const body = await req.json().catch(() => ({}));
    const userOf = async (id: string) => { const r = await fetch(`${base}/auth/v1/admin/users/${id}`, { headers: admin }); return r.ok ? r.json() : null; };

    /** The Cloudflare lock's list = the team's emails, exactly. Never writes an empty or partial list: if anything
     *  can't be read, it leaves Cloudflare as it is. */
    async function syncAccess(): Promise<string> {
      const tok = Deno.env.get('CF_ACCESS_TOKEN'); if (!tok) return 'skip';
      const acct = Deno.env.get('CF_ACCOUNT_ID') || CF_ACCOUNT, name = Deno.env.get('CF_ACCESS_POLICY') || CF_POLICY;
      const team = await (await fetch(`${base}/rest/v1/staff?select=user_id`, { headers: admin })).json().catch(() => null);
      if (!Array.isArray(team) || !team.length) return 'no team';
      const users = ((await (await fetch(`${base}/auth/v1/admin/users?per_page=1000`, { headers: admin })).json().catch(() => ({}))).users ?? []) as Array<{ id: string; email?: string }>;
      const byId = new Map(users.map((u) => [u.id, (u.email ?? '').toLowerCase()]));
      const emails = new Set<string>();
      for (const m of team as Array<{ user_id: string }>) { const e = byId.get(m.user_id); if (!e) return 'missing email'; emails.add(e); }
      (Deno.env.get('CF_ACCESS_ALWAYS') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => x.includes('@')).forEach((x) => emails.add(x));
      const cf = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
      const api = `https://api.cloudflare.com/client/v4/accounts/${acct}/access/policies`;
      const pol = ((await (await fetch(`${api}?per_page=100`, { headers: cf })).json().catch(() => ({}))).result ?? []).find((x: { name: string }) => x.name === name);
      if (!pol) return 'policy not found';
      const now = new Set<string>((pol.include ?? []).map((r: { email?: { email: string } }) => r.email?.email?.toLowerCase()).filter(Boolean));
      if (now.size === emails.size && [...emails].every((e) => now.has(e))) return 'ok'; // already the same
      const keep = ['exclude', 'require', 'session_duration', 'approval_required', 'approval_groups', 'isolation_required', 'purpose_justification_required', 'purpose_justification_prompt', 'mfa_config'];
      const next: Record<string, unknown> = { name: pol.name, decision: pol.decision, include: [...emails].sort().map((e) => ({ email: { email: e } })) };
      for (const k of keep) if (pol[k] !== undefined && pol[k] !== null) next[k] = pol[k];
      const r = await fetch(`${api}/${pol.id}`, { method: 'PUT', headers: cf, body: JSON.stringify(next) });
      if (!r.ok) console.error('Cloudflare Access', r.status, await r.text());
      return r.ok ? 'ok' : `error ${r.status}`;
    }
    if (body.action === 'sync_access') return out({ access: await syncAccess() });

    if (body.action === 'status') {
      const team: Array<{ user_id: string }> = await (await fetch(`${base}/rest/v1/staff?select=user_id${manager ? `&or=(role.in.(${MGR_ROLES.join(',')}),user_id.eq.${me.id})` : chief ? `&or=(role.in.(reporter,desk,editor),user_id.eq.${me.id})` : ''}`, { headers: admin })).json();
      const list = await Promise.all(team.filter((m) => iAmOwner || !secret.has(m.user_id) || m.user_id === me.id).map(async (m) => {
        const u = await userOf(m.user_id);
        // The owner's sign-ins stay private from the other administrators
        if (owners.has(m.user_id) && !iAmOwner) return { id: m.user_id, email: u?.email ?? '', accepted: true, lastSignIn: null, hidden: true };
        return { id: m.user_id, email: u?.email ?? '', accepted: !!u?.last_sign_in_at, lastSignIn: u?.last_sign_in_at ?? null, owner: owners.has(m.user_id), invisible: secret.has(m.user_id) };
      }));
      const access = chief ? 'skip' : await syncAccess().catch(() => 'error'); // opening Equipo also keeps the Cloudflare lock's list current
      return out({ list, access });
    }

    if (body.action === 'invite') {
      const email = String(body.email ?? '').trim().toLowerCase(), name = String(body.name ?? '').trim().slice(0, 40), role = String(body.role ?? '');
      if (!/^\S+@\S+\.\S+$/.test(email)) return out({ error: 'Escribe un correo válido.' }, 400);
      if (name.length < 2) return out({ error: 'Escribe el nombre.' }, 400);
      if (!ROLES[role]) return out({ error: 'Ese rol no existe.' }, 400);
      if (manager && !MGR_ROLES.includes(role)) return out({ error: 'Como Gerente puedes invitar a Ventas, periodistas y editores.' }, 403);
      // We email the invitation ourselves. Its link always opens the panel on «Crea tu contraseña» (user, 2026-11-03):
      // a new person gets an invitation link; someone who already has an account (a reader, or invited before, even if
      // the link was opened once) gets a password link instead, which opens the same screen.
      let link = await makeLink('invite', email, { name });
      let uid = link?.id ?? '', existing = false;
      if (!link) {
        const all = await (await fetch(`${base}/auth/v1/admin/users?per_page=1000`, { headers: admin })).json();
        const u = (all.users ?? []).find((x: { email?: string }) => x.email?.toLowerCase() === email);
        if (!u) return out({ error: 'No se pudo enviar la invitación. Revisa el correo.' }, 400);
        uid = u.id; existing = !!u.last_sign_in_at;
        if ((owners.has(uid) || secret.has(uid)) && !iAmOwner) return out({ error: 'Solo el dueño puede cambiar esa cuenta.' }, 403);
      }
      // A Gerente can't change someone who is already on the team with another role
      if (manager) { const had = await roleOf(uid); if (had && !MGR_ROLES.includes(had)) return out({ error: 'Esa persona es administrador o Gerente. Solo el administrador la puede cambiar.' }, 403); }
      if (newsroomColumnist) { const had = await roleOf(uid); if (had && had !== 'columnist') return out({ error: 'Esa persona ya es parte del equipo con otro rol. Pídele al administrador que la cambie.' }, 403); }
      const add = await fetch(`${base}/rest/v1/staff?on_conflict=user_id`, { method: 'POST', headers: { ...admin, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: uid, name, role, ...(iAmOwner && body.hidden === true ? { hidden: true } : {}) }) });
      if (!add.ok) return out({ error: 'Se invitó, pero no se pudo dar el rol. Intenta otra vez.' }, 500);
      link ??= await makeLink('recovery', email);
      if (!link) return out({ error: 'Se dio el rol, pero no se pudo crear el enlace. Envía la invitación otra vez.' }, 500);
      if (role === 'columnist' && body.reason === 'invitacion') await mail(email, 'Te invitamos a escribir en NotiCel', `Hola ${name}:`, COLUMNIST_INVITE, 'Crear mi cuenta', `${link.href}&bienvenida=1`);
      else if (role === 'columnist') await mail(email, '¡Tu solicitud para ser columnista fue aprobada!', `Hola ${name}:`, COLUMNIST_OK, 'Crear mi cuenta', `${link.href}&bienvenida=1`);
      else await mail(email, 'Te invitaron al equipo de NotiCel', `Hola ${name}:`, invited(role), 'Crear mi contraseña', `${link.href}&bienvenida=1`);
      const access = await syncAccess().catch(() => 'error'); // the new person can open the panel right away
      return out({ ok: true, existing, access, id: uid }); // id: Columnistas links the new profile to this account (owner)
    }

    if (body.action === 'reset_password') {
      const u = await userOf(String(body.id ?? ''));
      if (!u) return out({ error: 'No encontramos esa cuenta.' }, 404);
      if ((owners.has(u.id) || secret.has(u.id)) && !iAmOwner) return out({ error: 'Solo el dueño puede cambiar esa cuenta.' }, 403);
      if (manager && !MGR_ROLES.includes((await roleOf(u.id)) ?? '')) return out({ error: 'Como Gerente puedes ayudar a Ventas, periodistas y editores.' }, 403);
      const r = await makeLink('recovery', u.email);
      if (!r) return out({ error: 'No se pudo enviar el correo. Intenta en unos minutos.' }, 500);
      await mail(u.email, 'Tu nueva contraseña de NotiCel', 'Hola:', `Toca el botón para escoger una contraseña nueva para el panel de NotiCel. ${GATE}`, 'Escoger mi contraseña', r.href);
      return out({ ok: true });
    }
    return out({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    return out({ error: (e as Error).message }, 500);
  }
});

// The panel is behind the Cloudflare lock, which drops whatever follows "#" in a link while the person types its code.
// So links carry their one-time code after "?" (token_hash), which survives, and the panel trades it for a session.
// Supabase's own emails (templates) would put it after "#", so these emails are sent here instead (user, 2026-11-03).
async function makeLink(type: 'invite' | 'recovery', email: string, data?: Record<string, unknown>) {
  const base = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r = await fetch(`${base}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type, email, data, redirect_to: PANEL }) });
  if (!r.ok) return null;
  const j = await r.json(), hash = j.hashed_token ?? j.properties?.hashed_token, id = j.id ?? j.user?.id;
  return hash ? { id, href: `${PANEL}?token_hash=${encodeURIComponent(hash)}&type=${type}` } : null;
}
const GATE = 'Primero se abrirá una página de Cloudflare: escribe este mismo correo y te enviaremos un código para entrar. Abre el enlace en el navegador donde vas a trabajar. Si el enlace venció, pide que te lo envíen otra vez.';
// Approved columnist (user, 2026-11-17): their request from the Opiniones page was approved; they create their account here
const COLUMNIST_OK = '¡Felicidades! La redacción de NotiCel aprobó tu solicitud para ser <b>columnista</b> de la sección de Opiniones. Toca el botón para crear tu cuenta y tu contraseña. Desde tu cuenta podrás enviar tus columnas (la redacción las revisa antes de publicarlas) y ver cuántas personas las leen y sus comentarios. ' + GATE;
// Invited by the newsroom without a request (panel → Columnistas → Invitar a un columnista)
const COLUMNIST_INVITE = 'La redacción de NotiCel te invita a ser <b>columnista</b> de nuestra sección de Opiniones. Nos gustaría publicar tu voz y tu experiencia. Toca el botón para crear tu cuenta y tu contraseña. Desde tu cuenta podrás enviar tus columnas (la redacción las revisa antes de publicarlas) y ver cuántas personas las leen y sus comentarios. ' + GATE;
const invited = (role: string) => `Te invitaron a ser parte del equipo de NotiCel como <b>${ROLES[role]}</b>. Toca el botón para crear tu contraseña. ${GATE}`;

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

/** A short account email in the site's look (through Resend, like the advertiser emails). */
async function mail(to: string, subject: string, hi: string, text: string, button: string, href = PANEL) {
  const key = Deno.env.get('RESEND_API_KEY'); if (!key) return;
  const html = card(`${h1(subject)}<p style="margin:0 0 12px">${hi}</p><p style="margin:0 0 12px">${text}</p>${btn(href, button)}`, 'Este correo se envía automáticamente. NotiCel · noticel.com');
  await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to: [to], subject, html }) }).catch(() => null);
}
