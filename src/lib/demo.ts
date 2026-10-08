// Demo mode for a guest (e.g. an investor): sample ads, sample comments and a sample staff panel, all labeled.
// On: the guest password of the Cloudflare gate sets the nc_demo cookie until its deadline (cloudflare/password-gate.js).
// To preview it yourself on this device: open any page with ?demo=1 (and ?demo=0 to go back to the real site).
// In demo mode hasBackend() is false, so nothing reads from or writes to the real database or publishes anything.
export function isDemo(): boolean {
  if (typeof document === 'undefined') return false; // building the site: always the real version
  try {
    const q = new URLSearchParams(location.search).get('demo');
    if (q === '1') localStorage.setItem('nc-demo', '1');
    if (q === '0') localStorage.removeItem('nc-demo');
    return /(?:^|;\s*)nc_demo=1(?:;|$)/.test(document.cookie) || localStorage.getItem('nc-demo') === '1';
  } catch { return false; }
}

// ---- Sample visitor numbers for the panel (Analítica, Escribir → Publicadas). Labeled DEMO wherever they show. ----
import type { Analytics } from './backend';
const rnd = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }; // same numbers on every visit
const HOUR = [0.9, 0.6, 0.4, 0.3, 0.3, 0.6, 1.6, 2.6, 3.0, 2.9, 2.7, 2.6, 2.9, 2.8, 2.5, 2.4, 2.5, 2.8, 3.1, 3.3, 3.2, 2.7, 2.0, 1.4];
const dayKey = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
export function demoAnalytics(days: 1 | 7 | 28, storyPaths: string[], top = 50): Analytics {
  const now = new Date();
  const dayUsers = (d: Date) => { const n = Math.floor(d.valueOf() / 864e5); const wk = d.getDay() === 0 || d.getDay() === 6 ? 0.82 : 1; return Math.round((2900 + 1100 * rnd(n)) * wk); };
  let series: Analytics['series'];
  if (days === 1) {
    const full = dayUsers(now), sum = HOUR.reduce((a, v) => a + v, 0);
    series = Array.from({ length: now.getHours() + 1 }, (_, h) => { const u = Math.round((full * HOUR[h] / sum) * (0.85 + 0.3 * rnd(h + now.getDate()))); return { at: String(h).padStart(2, '0'), users: u, views: Math.round(u * 2.5) }; });
  } else {
    series = Array.from({ length: days }, (_, i) => { const d = new Date(now.valueOf() - (days - 1 - i) * 864e5); let u = dayUsers(d); if (i === days - 1) u = Math.round(u * Math.min(1, (now.getHours() + 1) / 24)); return { at: dayKey(d), users: u, views: Math.round(u * 2.6) }; });
  }
  const sumU = series.reduce((a, s) => a + s.users, 0);
  const users = Math.round(days === 1 ? sumU : sumU * 0.78), views = series.reduce((a, s) => a + s.views, 0);
  const share = (rows: Array<[string, number]>, total: number) => rows.map(([name, p]) => ({ name, n: Math.round(total * p) }));
  return {
    days, now: 45 + Math.round(40 * rnd(now.getHours() + now.getMinutes() / 10)), at: now.toISOString(),
    totals: { users, views, sessions: Math.round(users * 1.35), avgSeconds: 104, newUsers: Math.round(users * 0.57) },
    series,
    pages: storyPaths.slice(0, top).map((path, k) => { const v = Math.round((views * 0.07) / Math.pow(k + 1, 0.75) * (0.8 + 0.4 * rnd(k))); return { path, views: v, users: Math.round(v * 0.8) }; }),
    channels: share([['Organic Social', 0.38], ['Organic Search', 0.27], ['Direct', 0.21], ['Referral', 0.09], ['Unassigned', 0.05]], users * 1.35).map((x) => ({ name: x.name, sessions: x.n })),
    devices: share([['mobile', 0.76], ['desktop', 0.2], ['tablet', 0.04]], users).map((x) => ({ name: x.name, users: x.n })),
    countries: share([['Puerto Rico', 0.71], ['United States', 0.24], ['Dominican Republic', 0.02], ['Spain', 0.01], ['Mexico', 0.01]], users).map((x) => ({ name: x.name, users: x.n })),
  };
}
