// Juegos NotiCel points follow the reader's account (game_points table, supabase/connect-all.sql) so they count on the
// real leaderboards and on any device. The games keep using the instant copy in this browser ('nc-points');
// after each game it's sent to the account, and on login the higher total (this device or the account) wins.
import { accountsOn, loggedIn, api, myId } from './account';
import { getPoints, type PointsState } from './points';

const KEY = 'nc-points';
let ready = false; // true once this device and the account agree

async function pushPoints(s: PointsState = getPoints()) {
  if (!accountsOn() || !loggedIn()) return;
  const { once: _once, ...state } = s; // daily "already counted" marks stay on the device
  await api('game_points', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: myId(), total: s.total, state, updated_at: new Date().toISOString() }) });
}
async function pullPoints() {
  if (!accountsOn() || !loggedIn()) return;
  const r = await api(`game_points?user_id=eq.${myId()}&select=total,state`);
  if (!r?.ok) return;
  const row = (await r.json())[0] as { total: number; state: Omit<PointsState, 'once'> } | undefined;
  const local = getPoints();
  if (row && row.total >= local.total) {
    try { localStorage.setItem(KEY, JSON.stringify({ ...row.state, total: row.total, once: local.once })); } catch { /* storage blocked */ }
    dispatchEvent(new CustomEvent('nc-points', { detail: { added: 0, total: row.total, why: '' } }));
  } else if (local.total > 0) await pushPoints(local);
  ready = true;
}

/** Called once per page: keeps the points and the account in step. */
export function startPointsSync() {
  if (!accountsOn()) return;
  addEventListener('nc-points', (e) => { if (ready && (e as CustomEvent).detail?.added) void pushPoints(); });
  addEventListener('nc-account', () => { ready = false; void pullPoints(); });
  if (loggedIn()) void pullPoints();
}

/** Real leaderboard: all games or one, all time or today. */
export async function leaders(game: string, day?: string): Promise<Array<{ username: string; photo: string | null; points: number }>> {
  const r = await api('rpc/game_leaders', { method: 'POST', body: JSON.stringify({ game: game || null, day: day ?? null, lim: 10 }) }, false);
  return r?.ok ? await r.json() : [];
}
