// Reader accounts (Supabase Auth): sign up with email + password + public username, or "Continuar con Google";
// the login is kept in this browser ('nc-session') and renewed by itself. The public profile (username, photo)
// lives in the `profiles` table (supabase/comments.sql) and is mirrored in 'nc-profile' so the existing header,
// comments and /perfil code keep working. Without Supabase (BACKEND empty) everything stays in preview mode.
import { BACKEND, hasBackend, deviceKey, saveDevice, dropDevice, deviceLabel, staffLogin, staffToken } from './backend';

const SESSION = 'nc-session';
const base = () => BACKEND.url.replace(/\/$/, '');
const head = (token?: string) => ({ apikey: BACKEND.anonKey, Authorization: `Bearer ${token || BACKEND.anonKey}`, 'Content-Type': 'application/json' });
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export type Me = { id: string; email: string; username: string; photo?: string };

// ---- Signed in to the panel = signed in on the site (user, 2026-11-04) ----
// When the panel is signed in (and past its emailed code) but the site isn't, the site uses the panel's sign-in.
// Both then hold the same session: whichever renews it updates the other (sameSession), and signing out of the site
// only forgets it here (no server logout, which would close the panel too). Signing out of the site on purpose is
// respected for that sign-in ('nc-site-out').
const STAFF_SESSION = 'nc-staff-session';
const sidOf = (t?: string) => { try { return String(JSON.parse(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id ?? ''); } catch { return ''; } };
const sameSession = () => { const a = sidOf(read<any>(SESSION, null)?.access_token); return !!a && a === sidOf(read<any>(STAFF_SESSION, null)?.access_token); };
/** Uses the panel's sign-in on the site when the site has none. True when it did. */
export function adoptPanel(): boolean {
  if (typeof localStorage === 'undefined' || read<any>(SESSION, null)?.access_token) return false;
  const st = read<any>(STAFF_SESSION, null), staff = read<any>('nc-staff', null);
  if (!st?.access_token || !staff?.name) return false; // the panel isn't fully signed in (no code yet)
  const sid = sidOf(st.access_token);
  if (!sid || read<string>('nc-site-out', '') === sid) return false;
  write(SESSION, st);
  void syncProfile().then(() => changed());
  return true;
}
export const accountsOn = hasBackend;
/** Is the account signed in on the site on the newsroom team? (user, 2026-11-17: one sign-in for the site and the panel)
 *  Asked to the database (soy_equipo, supabase/dos-pasos.sql) and remembered on this device for 6 hours, per account. */
export async function onTeamSite(): Promise<boolean> {
  const id = userId(); if (!id || !hasBackend()) return false;
  const c = read<{ id: string; yes: boolean; at: number } | null>('nc-team-member', null);
  if (c?.id === id && Date.now() - c.at < 6 * 36e5) return c.yes;
  const r = await api('rpc/soy_equipo', { method: 'POST', body: '{}' });
  if (!r?.ok) return c?.id === id ? c.yes : false;
  const yes = (await r.json().catch(() => false)) === true;
  write('nc-team-member', { id, yes, at: Date.now() });
  return yes;
}
export const loggedIn = () => !!read<any>(SESSION, null)?.access_token;
const changed = () => dispatchEvent(new Event('nc-account'));

/** The login token, renewed first when it's about to expire. */
export async function token(): Promise<string | undefined> {
  const s = read<any>(SESSION, null);
  if (!s?.access_token) return undefined;
  if (!s.expires_at || s.expires_at * 1000 > Date.now() + 60_000 || !s.refresh_token) return s.access_token;
  const r = await fetch(`${base()}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: head(), body: JSON.stringify({ refresh_token: s.refresh_token }) }).catch(() => null);
  if (!r?.ok) { if (r && r.status >= 400 && r.status < 500) { write(SESSION, null); changed(); } return undefined; }
  const shared = sameSession();
  const next = await r.json(); write(SESSION, next); if (shared) write(STAFF_SESSION, next); return next.access_token;
}
const userId = () => read<any>(SESSION, null)?.user?.id as string | undefined;
export const myId = userId;
/** The signed-in reader's email (already confirmed when they made the account), or ''. */
export const myEmail = () => String(read<any>(SESSION, null)?.user?.email ?? '').toLowerCase();

const SPANISH: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  user_already_exists: 'Ya hay una cuenta con ese correo. Entra con tu contraseña.',
  email_exists: 'Ya hay una cuenta con ese correo. Entra con tu contraseña.',
  weak_password: 'La contraseña es muy corta: usa al menos 8 caracteres.',
  email_not_confirmed: 'Confirma tu correo: te enviamos un enlace.',
  signup_disabled: 'Por ahora no se pueden crear cuentas nuevas.',
  over_email_send_rate_limit: 'Demasiados intentos. Espera unos minutos.',
  same_password: 'Escoge una contraseña distinta a la anterior.',
  validation_failed: 'Revisa el correo y la contraseña.',
};
const why = async (r: Response) => { const e = await r.json().catch(() => ({})); return SPANISH[e.error_code || e.code] || e.msg || e.error_description || 'No se pudo. Intenta otra vez.'; };

/** Mirror of the public profile used by the rest of the site ('nc-profile'). */
async function syncProfile(): Promise<Me | null> {
  const id = userId(); const t = await token(); if (!id || !t) return null;
  const r = await fetch(`${base()}/rest/v1/profiles?id=eq.${id}&select=username,photo`, { headers: head(t) }).catch(() => null);
  const row = r?.ok ? (await r.json())[0] : null;
  if (!row) return null;
  const prev = read<any>('nc-profile', {});
  write('nc-profile', { ...prev, name: row.username, photo: row.photo || undefined });
  dispatchEvent(new Event('nc-profile-change'));
  return { id, email: read<any>(SESSION, null)?.user?.email ?? '', username: row.username, photo: row.photo || undefined };
}
export const me = syncProfile;

export async function signUp(email: string, password: string, username: string): Promise<{ ok?: boolean; error?: string; confirm?: boolean }> {
  if (!/^[a-z0-9._]{3,20}$/.test(username)) return { error: 'El nombre de usuario: 3 a 20 letras minúsculas, números, punto o guion bajo.' };
  const taken = await fetch(`${base()}/rest/v1/profiles?username=eq.${username}&select=id`, { headers: head() }).then((r) => r.json()).catch(() => []);
  if (taken.length) return { error: 'Ese nombre de usuario ya existe. Prueba otro.' };
  const r = await fetch(`${base()}/auth/v1/signup`, { method: 'POST', headers: head(), body: JSON.stringify({ email, password, data: { username } }) });
  if (!r.ok) return { error: await why(r) };
  const s = await r.json();
  if (!s.access_token) return { ok: true, confirm: true }; // email confirmation is on: they must click the link first
  write(SESSION, s); await syncProfile(); changed();
  return { ok: true };
}
/** The other way around (user, 2026-11-04): signing in on the site with a team member's account also signs them into
 *  the staff panel (its own session, so neither one's renewal logs out the other). Only for the team (soy_equipo);
 *  the panel still asks for its emailed code, unless this sign-in or device was already verified. */
async function alsoPanel(email: string, password: string, siteToken: string) {
  if (staffToken()) return; // already signed in to the panel (maybe as someone else): leave it
  const r = await fetch(`${base()}/rest/v1/rpc/soy_equipo`, { method: 'POST', headers: head(siteToken), body: '{}' }).catch(() => null);
  if (!r?.ok || (await r.json().catch(() => false)) !== true) return;
  await staffLogin(email, password).catch(() => false);
}
let pendingLogin: { email: string; password: string } | null = null; // kept in memory only, until the emailed code is typed

export async function signIn(email: string, password: string): Promise<{ ok?: boolean; error?: string; code?: boolean; to?: string }> {
  const r = await fetch(`${base()}/auth/v1/token?grant_type=password`, { method: 'POST', headers: head(), body: JSON.stringify({ email, password }) });
  if (!r.ok) return { error: await why(r) };
  const s = await r.json();
  // Two-step on (Mi perfil → Ajustes): the session waits here until the emailed code is typed
  if (await twoStepOn(s.access_token)) {
    // A device remembered for 30 days ("Recordar este dispositivo"): straight in, no code
    const uid = s.user?.id ?? '', key = uid ? deviceKey(uid) : '';
    if (key) {
      const t = await codeFor(s.access_token, 'trust', { device: key });
      if (t.ok) { write(SESSION, s); await syncProfile(); changed(); void alsoPanel(email, password, s.access_token); return { ok: true }; }
      if (/recordado/.test(t.error ?? '')) dropDevice(uid);
    }
    pending = s; pendingLogin = { email, password };
    const sent = await codeFor(s.access_token, 'send');
    return sent.ok ? { code: true, to: sent.to } : { error: sent.error ?? 'No se pudo enviar el código.' };
  }
  write(SESSION, s); await syncProfile(); changed(); void alsoPanel(email, password, s.access_token);
  return { ok: true };
}

/** The staff panel's sign-in also signs the person in on the site (same account), so they can comment with their
 *  team badge without signing in twice (user, 2026-11-03). Its own session, separate from the panel's. Skipped when
 *  they're already signed in, or when their reader account asks for an emailed code (they sign in on the site then). */
export async function signInQuiet(email: string, password: string): Promise<void> {
  if (loggedIn()) return;
  const r = await fetch(`${base()}/auth/v1/token?grant_type=password`, { method: 'POST', headers: head(), body: JSON.stringify({ email, password }) }).catch(() => null);
  if (!r?.ok) return;
  const s = await r.json();
  if (await twoStepOn(s.access_token)) return;
  write(SESSION, s); await syncProfile(); changed();
}

// ---- Account security (Mi perfil → Ajustes → Cuenta y seguridad; supabase/cuenta-segura.sql) ----
let pending: any = null; // a sign-in waiting for its emailed code
const codeFor = async (t: string, action: 'send' | 'verify' | 'trust' | 'forget', extra: Record<string, unknown> = {}): Promise<{ ok?: boolean; to?: string; error?: string; device?: string }> => {
  const r = await fetch(`${base()}/functions/v1/codigo`, { method: 'POST', headers: head(t), body: JSON.stringify({ action, ...extra }) }).catch(() => null);
  if (!r) return { error: 'No hay conexión.' };
  return r.json().catch(() => ({ error: `Error ${r.status}` }));
};
async function twoStepOn(t: string): Promise<boolean> {
  const r = await fetch(`${base()}/rest/v1/account_security?select=two_step`, { headers: head(t) }).catch(() => null);
  return r?.ok ? !!(await r.json())[0]?.two_step : false;
}
/** Sign-in step two: the code from the email. */
export async function finishCode(code: string, remember = false): Promise<{ ok?: boolean; error?: string }> {
  if (!pending) return { error: 'Entra otra vez con tu correo y contraseña.' };
  const v = await codeFor(pending.access_token, 'verify', { code, remember, label: deviceLabel() });
  if (!v.ok) return { error: v.error ?? 'Ese código no es correcto.' };
  if (v.device && pending.user?.id) saveDevice(pending.user.id, v.device);
  const login = pendingLogin, t = pending.access_token; pendingLogin = null;
  write(SESSION, pending); pending = null; await syncProfile(); changed();
  if (login) void alsoPanel(login.email, login.password, t);
  return { ok: true };
}
export const resendCode = async () => (pending ? codeFor(pending.access_token, 'send') : { error: 'Entra otra vez.' });
/** The signed-in account: email, whether it signs in with Google, and whether two-step is on. */
export async function accountInfo(): Promise<{ email: string; google: boolean; twoStep: boolean } | null> {
  const t = await token(); if (!t) return null;
  const u = await fetch(`${base()}/auth/v1/user`, { headers: head(t) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!u) return null;
  const providers: string[] = u.app_metadata?.providers ?? [u.app_metadata?.provider];
  return { email: u.email, google: providers.includes('google') && !providers.includes('email'), twoStep: await twoStepOn(t) };
}
/** Is this the account's current password? (checked without touching the session) */
export async function passwordOk(email: string, password: string): Promise<boolean> {
  const r = await fetch(`${base()}/auth/v1/token?grant_type=password`, { method: 'POST', headers: head(), body: JSON.stringify({ email, password }) }).catch(() => null);
  return !!r?.ok;
}
/** Changes the email: Supabase sends a link to the new address to confirm it. */
export async function changeEmail(email: string): Promise<{ ok?: boolean; error?: string }> {
  const t = await token(); if (!t) return { error: 'Entra a tu cuenta otra vez.' };
  const r = await fetch(`${base()}/auth/v1/user?redirect_to=${encodeURIComponent(`${location.origin}/perfil/`)}`, { method: 'PUT', headers: head(t), body: JSON.stringify({ email }) });
  return r.ok ? { ok: true } : { error: await why(r) };
}
/** Two-step: sends a code now (to turn it on, the reader confirms the code first). */
export async function twoStepSend() { const t = await token(); return t ? codeFor(t, 'send') : { error: 'Entra a tu cuenta otra vez.' }; }
/** Turns two-step on (after checking the code) or off. */
export async function twoStepSet(on: boolean, code = ''): Promise<{ ok?: boolean; error?: string }> {
  const t = await token(); if (!t) return { error: 'Entra a tu cuenta otra vez.' };
  if (on) { const v = await codeFor(t, 'verify', { code }); if (!v.ok) return { error: v.error ?? 'Ese código no es correcto.' }; }
  const r = await fetch(`${base()}/rest/v1/account_security?on_conflict=user_id`, { method: 'POST', headers: { ...head(t), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: userId(), two_step: on, updated_at: new Date().toISOString() }) });
  return r.ok ? { ok: true } : { error: r.status === 404 ? 'Falta un paso en la base de datos (supabase/cuenta-segura.sql).' : 'No se pudo guardar.' };
}
/** "Continuar con Google": Supabase sends the reader to Google and back to this same page. */
export function signInWithGoogle() {
  try { sessionStorage.setItem('nc-auth-back', location.href); } catch { /* storage blocked */ }
  location.href = `${base()}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin + location.pathname)}`;
}
/** Back from Google (or an email link): the login arrives in the address (#access_token=…).
 *  Returns 'recovery' when it's a password-reset link (the reader then picks a new password). */
export async function finishRedirect(): Promise<false | 'login' | 'recovery'> {
  if (!location.hash.includes('access_token=')) return false;
  const p = new URLSearchParams(location.hash.slice(1));
  const kind = p.get('type') === 'recovery' ? 'recovery' : 'login';
  const s = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600), user: null as any };
  const u = await fetch(`${base()}/auth/v1/user`, { headers: head(s.access_token!) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!u) return false;
  s.user = u; write(SESSION, s);
  history.replaceState(null, '', location.pathname + location.search);
  await syncProfile(); changed();
  return kind;
}
/** New password (after a reset link, or from the profile). */
export async function setPassword(password: string): Promise<{ ok?: boolean; error?: string }> {
  if (password.length < 8) return { error: 'La contraseña necesita al menos 8 caracteres.' };
  const t = await token(); if (!t) return { error: 'El enlace venció. Pide otro correo para cambiar tu contraseña.' };
  const r = await fetch(`${base()}/auth/v1/user`, { method: 'PUT', headers: head(t), body: JSON.stringify({ password }) });
  if (r.ok) void forgetDevices(); // a new password: every remembered device asks for the code again
  return r.ok ? { ok: true } : { error: await why(r) };
}
/** Forgets every device remembered for 30 days (Mi perfil → Ajustes, and after a password change). */
export async function forgetDevices(): Promise<boolean> {
  const t = await token(); if (!t) return false;
  const r = await codeFor(t, 'forget');
  try { const uid = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; if (uid) dropDevice(uid); } catch { /* not a token */ }
  return !!r.ok;
}
export async function signOut() {
  const t = await token();
  if (sameSession()) write('nc-site-out', sidOf(t)); // the panel keeps its sign-in; don't bring it back to the site
  else if (t) fetch(`${base()}/auth/v1/logout`, { method: 'POST', headers: head(t) }).catch(() => {});
  write(SESSION, null);
  const prev = read<any>('nc-profile', {}); write('nc-profile', { color: prev.color }); // keep only the color choice
  dispatchEvent(new Event('nc-profile-change')); changed();
}
export async function sendReset(email: string): Promise<{ ok?: boolean; error?: string }> {
  const r = await fetch(`${base()}/auth/v1/recover`, { method: 'POST', headers: head(), body: JSON.stringify({ email }) });
  return r.ok ? { ok: true } : { error: await why(r) };
}

/** Change the public username and/or photo (a data URL is uploaded to the "avatars" bucket). */
export async function updateProfile(p: { username?: string; photo?: string | null }): Promise<{ ok?: boolean; error?: string }> {
  const id = userId(); const t = await token(); if (!id || !t) return { error: 'Entra a tu cuenta otra vez.' };
  const patch: Record<string, string | null> = {};
  if (p.username !== undefined) {
    if (!/^[a-z0-9._]{3,20}$/.test(p.username)) return { error: 'El nombre de usuario: 3 a 20 letras minúsculas, números, punto o guion bajo.' };
    patch.username = p.username;
  }
  if (p.photo !== undefined) {
    if (p.photo && p.photo.startsWith('data:')) {
      const blob = await (await fetch(p.photo)).blob();
      const name = `${id}/${Date.now().toString(36)}.jpg`;
      const up = await fetch(`${base()}/storage/v1/object/avatars/${name}`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${t}`, 'Content-Type': blob.type || 'image/jpeg' }, body: blob });
      if (!up.ok) return { error: 'No se pudo subir la foto.' };
      patch.photo = `${base()}/storage/v1/object/public/avatars/${name}`;
    } else patch.photo = p.photo;
  }
  const r = await fetch(`${base()}/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', headers: head(t), body: JSON.stringify(patch) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); return { error: e.code === '23505' ? 'Ese nombre de usuario ya existe. Prueba otro.' : 'No se pudo guardar.' }; }
  await syncProfile();
  return { ok: true };
}

/** Logged-in REST helper for the comment and notification tables. */
export async function api(path: string, init: RequestInit = {}, auth = true): Promise<Response | null> {
  const t = auth ? await token() : undefined;
  if (auth && !t) return null;
  return fetch(`${base()}/rest/v1/${path}`, { ...init, headers: { ...head(t), ...(init.headers || {}) } }).catch(() => null);
}
/** Opens the "Entrar / Crear cuenta" box (src/components/AuthDialog.astro). */
export const askLogin = (why?: string, o: { mode?: 'in' | 'up'; email?: string } = {}) => dispatchEvent(new CustomEvent('nc-auth-open', { detail: { why, ...o } })); // mode 'up': opens on «Crear cuenta»

/** A photo for a comment (data URL, already shrunk) → uploaded to the "comentarios" bucket; returns its address. */
export async function uploadCommentPhoto(dataUrl: string): Promise<string | null> {
  const id = userId(); const t = await token(); if (!id || !t) return null;
  const blob = await (await fetch(dataUrl)).blob();
  const name = `${id}/${Date.now().toString(36)}.jpg`;
  const r = await fetch(`${base()}/storage/v1/object/comentarios/${name}`, { method: 'POST', headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${t}`, 'Content-Type': 'image/jpeg' }, body: blob }).catch(() => null);
  return r?.ok ? `${base()}/storage/v1/object/public/comentarios/${name}` : null;
}

/** "Borrar mi cuenta": deletes the reader's photos, then the account and everything tied to it (delete_my_account()). */
export async function deleteAccount(): Promise<{ ok?: boolean; error?: string }> {
  const id = userId(); const t = await token(); if (!id || !t) return { error: 'Entra a tu cuenta otra vez.' };
  const h = { apikey: BACKEND.anonKey, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
  // Profile photo and photos in comments live in folders named after the account
  for (const bucket of ['avatars', 'comentarios']) {
    const l = await fetch(`${base()}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: h, body: JSON.stringify({ prefix: `${id}/`, limit: 1000 }) }).catch(() => null);
    const names: string[] = l?.ok ? (await l.json()).map((f: { name: string }) => `${id}/${f.name}`) : [];
    if (names.length) await fetch(`${base()}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: h, body: JSON.stringify({ prefixes: names }) }).catch(() => null);
  }
  const r = await fetch(`${base()}/rest/v1/rpc/delete_my_account`, { method: 'POST', headers: h, body: '{}' }).catch(() => null);
  if (!r?.ok) return { error: r?.status === 404 ? 'Falta activar esta opción en el sitio. Inténtalo más tarde.' : 'No se pudo borrar. Intenta otra vez.' };
  const msg = await r.json();
  if (msg !== 'ok') return { error: String(msg) };
  // Signed out, and this device forgets the account's copies (saved stories, points, notifications, profile)
  write(SESSION, null);
  try { Object.keys(localStorage).filter((k) => k.startsWith('nc-') && !['nc-theme-manual', 'nc-font', 'nc-lang'].includes(k)).forEach((k) => localStorage.removeItem(k)); } catch { /* storage blocked */ }
  dispatchEvent(new Event('nc-profile-change')); changed();
  return { ok: true };
}

/** Is "Continuar con Google" turned on in Supabase? (the button stays hidden until it is) */
let googleOn: Promise<boolean> | null = null;
export const googleEnabled = () => (googleOn ??= fetch(`${base()}/auth/v1/settings`, { headers: { apikey: BACKEND.anonKey } })
  .then((r) => r.json()).then((d) => !!d?.external?.google).catch(() => false));

// After everything above is defined: pick up the panel's sign-in on every page load
adoptPanel();
