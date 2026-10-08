// Saved stories follow the reader to any device (saved_stories table, supabase/connect-all.sql).
// The list the site uses stays in this browser ('nc-saved', instant); when the reader is logged in, this keeps it in
// step with their account: on login the two lists are merged, and each save or unsave is sent in the background.
import { accountsOn, loggedIn, api } from './account';

type Saved = { u: string; t: string; s: string; d: string; i: string; at: number };
const KEY = 'nc-saved';
const read = (): Saved[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
let known: Set<string> | null = null; // urls the account has (after the first sync)
let busy = false;

/** Merge the account's list with this device's, then remember what the account has. */
export async function pullSaved() {
  if (!accountsOn() || !loggedIn() || busy) return;
  busy = true;
  const r = await api('saved_stories?select=url,data,created_at&order=created_at.desc&limit=200');
  if (r?.ok) {
    const server: Saved[] = (await r.json()).map((x: { url: string; data: Saved }) => ({ ...x.data, u: x.url }));
    const local = read();
    const urls = new Set(server.map((x) => x.u));
    const onlyHere = local.filter((x) => !urls.has(x.u));
    if (onlyHere.length) await api('saved_stories', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(onlyHere.map((x) => ({ url: x.u, data: x }))) });
    const merged = [...onlyHere, ...server].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 100);
    known = new Set(merged.map((x) => x.u));
    try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch { /* storage blocked */ }
    dispatchEvent(new Event('nc-saved-change'));
  }
  busy = false;
}

/** After a save or unsave on this device: send the difference to the account. */
export async function pushSaved() {
  if (!accountsOn() || !loggedIn() || !known || busy) return;
  const local = read(); const now = new Set(local.map((x) => x.u));
  const added = local.filter((x) => !known!.has(x.u));
  const removed = [...known].filter((u) => !now.has(u));
  known = now;
  if (added.length) await api('saved_stories', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(added.map((x) => ({ url: x.u, data: x }))) });
  for (const u of removed) await api(`saved_stories?url=eq.${encodeURIComponent(u)}`, { method: 'DELETE' });
}

/** Called once per page: keeps the saved list and the account in step. */
export function startSavedSync() {
  if (!accountsOn()) return;
  addEventListener('nc-saved-change', () => void pushSaved());
  addEventListener('nc-account', () => { known = null; void pullSaved(); });
  if (loggedIn()) void pullSaved();
}
