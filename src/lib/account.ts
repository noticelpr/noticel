// Reader accounts (Supabase Auth): sign up with email + password + public username, or "Continuar con Google";
// the login is kept in this browser ('nc-session') and renewed by itself. The public profile (username, photo)
// lives in the `profiles` table (supabase/comments.sql) and is mirrored in 'nc-profile' so the existing header,
// comments and /perfil code keep working. Without Supabase (BACKEND empty) everything stays in preview mode.
import { BACKEND, hasBackend } from './backend';

const SESSION = 'nc-session';
const base = () => BACKEND.url.replace(/\/$/, '');
const head = (token?: string) => ({ apikey: BACKEND.anonKey, Authorization: `Bearer ${token || BACKEND.anonKey}`, 'Content-Type': 'application/json' });
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export type Me = { id: string; email: string; username: string; photo?: string };
export const accountsOn = hasBackend;
export const loggedIn = () => !!read<any>(SESSION, null)?.access_token;
const changed = () => dispatchEvent(new Event('nc-account'));

/** The login token, renewed first when it's about to expire. */
export async function token(): Promise<string | undefined> {
  const s = read<any>(SESSION, null);
  if (!s?.access_token) return undefined;
  if (!s.expires_at || s.expires_at * 1000 > Date.now() + 60_000 || !s.refresh_token) return s.access_token;
  const r = await fetch(`${base()}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: head(), body: JSON.stringify({ refresh_token: s.refresh_token }) }).catch(() => null);
  if (!r?.ok) { if (r && r.status >= 400 && r.status < 500) { write(SESSION, null); changed(); } return undefined; }
  const next = await r.json(); write(SESSION, next); return next.access_token;
}
const userId = () => read<any>(SESSION, null)?.user?.id as string | undefined;
export const myId = userId;

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
export async function signIn(email: string, password: string): Promise<{ ok?: boolean; error?: string }> {
  const r = await fetch(`${base()}/auth/v1/token?grant_type=password`, { method: 'POST', headers: head(), body: JSON.stringify({ email, password }) });
  if (!r.ok) return { error: await why(r) };
  write(SESSION, await r.json()); await syncProfile(); changed();
  return { ok: true };
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
  return r.ok ? { ok: true } : { error: await why(r) };
}
export async function signOut() {
  const t = await token();
  if (t) fetch(`${base()}/auth/v1/logout`, { method: 'POST', headers: head(t) }).catch(() => {});
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
export const askLogin = (why?: string) => dispatchEvent(new CustomEvent('nc-auth-open', { detail: { why } }));

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
