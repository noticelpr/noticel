// NotiCel test site: password page in front of the whole site while it's being tested (a Cloudflare Pages Function,
// so it works on the free *.pages.dev address too). Same idea as Noticias Xtra's password Worker.
// Anyone with the password gets in and stays in for 30 days on that device; everyone else, search engines included,
// sees only a plain page with the address on it. The password box is at /entrar (the staff door).
//
// Setup (Cloudflare → Workers & Pages → this Pages project → Settings → Variables and Secrets), typed by the owner:
//   SITE_PASSWORD (Secret): the team's password. Changing it signs everyone out.
//   Optional guest access in demo mode (sample items, labeled; src/lib/demo.ts reads the nc_demo cookie):
//   GUEST_PASSWORD (Secret) and GUEST_UNTIL (Text, UTC time when it stops working, e.g. 2026-10-20T13:00:00Z).
// Without SITE_PASSWORD the site stays closed. On the day the new site replaces WordPress, delete this file.

const COOKIE = 'nc_clave';
const DOOR = '/entrar';
const DAYS = 30;
// Always open: the logo shown on the password page
const OPEN = [/^\/logo\.png$/];

async function token(password) {
  const data = new TextEncoder().encode(`noticel:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const cookieOf = (req) => (req.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
const json = (body, status = 200, cookies = []) => {
  const h = new Headers({ 'Content-Type': 'application/json' }); cookies.forEach((c) => h.append('Set-Cookie', c));
  return new Response(JSON.stringify(body), { status, headers: h });
};
/** The guest password's deadline (ms), or 0 when there is no guest access. */
const guestUntil = (env) => (env.GUEST_PASSWORD && env.GUEST_UNTIL ? Date.parse(env.GUEST_UNTIL) || 0 : 0);

export async function onRequest({ request: req, env, next }) {
  const url = new URL(req.url);
  const h = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  if (!env.SITE_PASSWORD) return new Response(PLAIN(url.hostname), { status: 503, headers: h }); // closed until a password is set
  const good = await token(env.SITE_PASSWORD);
  const until = guestUntil(env), guestOpen = until > Date.now();
  const guest = until ? await token(`guest:${env.GUEST_PASSWORD}:${env.GUEST_UNTIL}`) : '';

  // The form sends the password here
  if (url.pathname === '/__clave' && req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    const typed = await token(String(form?.get('clave') || ''));
    if (typed === good) return json({ ok: true }, 200, [`${COOKIE}=${good}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`, 'nc_demo=; Path=/; Max-Age=0; Secure; SameSite=Lax']);
    if (until && typed === (await token(env.GUEST_PASSWORD))) {
      if (!guestOpen) return json({ ok: false, expired: true }, 401);
      const exp = new Date(until).toUTCString(); // both cookies end exactly at the deadline
      return json({ ok: true }, 200, [`${COOKIE}=${guest}; Path=/; Expires=${exp}; HttpOnly; Secure; SameSite=Lax`, `nc_demo=1; Path=/; Expires=${exp}; Secure; SameSite=Lax`]);
    }
    return json({ ok: false }, 401);
  }
  const c = cookieOf(req);
  if (c === good || (guestOpen && c === guest) || OPEN.some((r) => r.test(url.pathname))) {
    const res = await next();
    const out = new Response(res.body, res); out.headers.set('X-Robots-Tag', 'noindex, nofollow'); // a test copy: never in Google
    return out;
  }
  if (c && c === guest) h.append('Set-Cookie', 'nc_demo=; Path=/; Max-Age=0; Secure; SameSite=Lax'); // guest time is over
  if (url.pathname.replace(/\/$/, '') !== DOOR) return new Response(PLAIN(url.hostname), { status: 404, headers: h }); // looks unused
  return new Response(PAGE, { status: 401, headers: h });
}

const PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>NotiCel · Sitio de prueba</title>
<link rel="icon" href="/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;font-family:Inter,system-ui,sans-serif;background:#000;color:#171717}
  .card{width:min(420px,100%);background:#fff;padding:32px 28px;border-top:6px solid #92D000;text-align:center}
  .logo{display:block;margin:-8px auto 0;height:72px;width:auto;background:#000;padding:8px 14px}
  h1{font-weight:800;font-size:22px;margin:18px 0 6px} p{margin:0 0 18px;color:#6B6A6A;font-size:15px;line-height:1.5}
  input{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1.5px solid #D4D4D8;outline:none}
  input:focus{border-color:#009DE9;box-shadow:0 0 0 3px rgba(0,157,233,.2)}
  button{margin-top:12px;width:100%;font:inherit;font-weight:800;font-size:16px;padding:12px;border:0;border-radius:999px;background:#000;color:#fff;cursor:pointer}
  button:hover{background:#007BB6} button:disabled{opacity:.6} .err{color:#D7263D;font-size:14px;margin:10px 0 0;min-height:1.2em}
</style></head>
<body><main class="card">
  <img class="logo" src="/logo.png" alt="NotiCel">
  <h1>Sitio de prueba</h1>
  <p>Aquí probamos el nuevo NotiCel. Si tienes la clave de acceso, escríbela para entrar.</p>
  <form id="f" method="post" action="/__clave"><input id="c" name="clave" type="password" autocomplete="current-password" placeholder="Clave de acceso" aria-label="Clave de acceso" required autofocus>
  <button id="b" type="submit">Entrar</button><p class="err" id="e" role="alert"></p></form>
</main>
<script>
  document.getElementById('f').addEventListener('submit', async function (ev) {
    ev.preventDefault(); var b = document.getElementById('b'), e = document.getElementById('e'); b.disabled = true; e.textContent = '';
    var r = await fetch('/__clave', { method: 'POST', body: new FormData(this) }).catch(function () { return null; });
    if (r && r.ok) { if (location.pathname.indexOf('/entrar') === 0) location.href = '/'; else location.reload(); return; } // keeps the address (and any login link) the visitor came with
    var out = r ? await r.json().catch(function () { return {}; }) : null;
    b.disabled = false; e.textContent = !r ? 'No hay conexión. Intenta otra vez.' : out.expired ? 'Esa clave de invitado ya venció.' : 'Esa clave no es correcta.';
  });
</script></body></html>`;

// What strangers see: just the address, nothing about the site
const PLAIN = (host) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${host}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#fff;color:#9A9CA8;font-size:15px}
@media (prefers-color-scheme:dark){body{background:#111;color:#666}}</style></head><body>${host}</body></html>`;
