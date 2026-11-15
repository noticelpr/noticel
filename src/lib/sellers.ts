// Who sold what, and what a salesperson sees (user, 2026-11-02): someone with the Ventas role sees only their own
// clients, orders, live ads and commissions; the administrator sees everyone's.
// An order is a salesperson's when they recorded it ("Vendido por: <name>", DirectSale.astro) or the client ordered
// through their own Anúnciate link ("Referido: <code>", the first 8 characters of their account id). A client inquiry
// (Ventas → Consultas) is theirs when they created it or took it ("owner"); web-form inquiries start unassigned.
import type { AdRequest } from './adrequests';
import { hasBackend, tokenInfo } from './backend';

export type TeamMember = { id?: string; name: string; role: string };
const get = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };

/** The signed-in staff member (name and role as the panel saved them). */
export const staffMe = () => get<{ name: string; role: string } | null>('nc-staff', null);
/** A salesperson (Ventas role): their views show only their own work. */
export const isSeller = () => staffMe()?.role === 'ads';
/** The signed-in account's id ('' in preview without accounts). */
export const myId = () => (hasBackend() ? tokenInfo().id : '');
/** The team, as the panel keeps it ('nc-staff-team'). */
export const teamList = () => get<TeamMember[]>('nc-staff-team', []);
/** A salesperson's link code: the first 8 characters of their account id. */
export const codeOf = (id: string) => id.replace(/-/g, '').slice(0, 8);

const line = (r: AdRequest, k: string) => (r.lines ?? []).find((x) => x.startsWith(`${k}: `))?.slice(k.length + 2).trim() ?? '';
/** Who sold an order: the salesperson who recorded it, or else whose link the client used. */
export function sellerOf(r: AdRequest, team: TeamMember[] = teamList()): TeamMember | undefined {
  const by = line(r, 'Vendido por').toLowerCase();
  return (by && team.find((m) => m.id && m.name.toLowerCase() === by)) || referrerOf(r, team);
}
/** Whose link (or referral) brought the order ("Referido: <code>"). */
export function referrerOf(r: AdRequest, team: TeamMember[] = teamList()): TeamMember | undefined {
  const ref = line(r, 'Referido');
  return ref ? team.find((m) => m.id && codeOf(m.id) === ref) : undefined;
}
/** Everyone credited for an order: the one who sold it and, when someone else referred it, the referrer too. */
export const creditedTo = (r: AdRequest, id: string, team: TeamMember[] = teamList()) => !!id && (sellerOf(r, team)?.id === id || referrerOf(r, team)?.id === id);
/** This order is the signed-in salesperson's (always true for everyone else). */
export function mineRequest(r: AdRequest): boolean {
  if (!isSeller()) return true;
  const id = myId(), s = sellerOf(r);
  if (s) return s.id === id;
  const by = line(r, 'Vendido por').toLowerCase();
  return !!by && by === (staffMe()?.name ?? '').toLowerCase(); // preview: by name
}
/** This client inquiry is the signed-in salesperson's (always true for everyone else). */
type LeadOwner = { owner?: string; ownerName?: string; sale?: { soldBy?: string } };
export const mineLead = (l: LeadOwner) => !isSeller() || (l.owner ? l.owner === myId() : (l.ownerName || l.sale?.soldBy || '') === (staffMe()?.name ?? '-'));
/** Nobody has taken this inquiry yet (web form, or made before inquiries had an owner). */
export const unassignedLead = (l: LeadOwner) => !l.owner && !l.ownerName && !l.sale?.soldBy;

// ---- Commissions (supabase/comisiones.sql; user, 2026-11-02) ----
export type SalesPlan = { new_pct: number; renew_pct: number; bonus_pct: number; goal: number };
export const DEFAULT_PLAN: SalesPlan = { new_pct: 0, renew_pct: 0, bonus_pct: 0, goal: 0 }; // set per person in the panel (owner)
export const clientKey = (r: AdRequest) => (r.client.email || r.client.business || r.id).trim().toLowerCase();
/** A new client: no approved order from the same client before this one. */
export const isNewClient = (r: AdRequest, all: AdRequest[]) => !all.some((o) => o !== r && o.status === 'aprobada' && clientKey(o) === clientKey(r) && Date.parse(o.created) < Date.parse(r.created));
/** One salesperson's month ('2026-11'): each approved sale at the new-client or renewal rate, plus the extra on what
 *  passed the goal (in order of date). Earned = from paid orders; pending = from orders not paid yet. */
export function commissionMonth(all: AdRequest[], mine: (r: AdRequest) => boolean, p: SalesPlan, key: string) {
  const sales = all.filter((r) => r.status === 'aprobada' && r.created.slice(0, 7) === key && mine(r)).sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
  let running = 0;
  const rows = sales.map((r) => {
    const total = Number(r.total || 0), fresh = isNewClient(r, all), pct = fresh ? p.new_pct : p.renew_pct;
    const above = p.goal > 0 ? Math.max(0, Math.min(total, running + total - p.goal)) : 0; running += total;
    return { r, total, fresh, pct, commission: total * pct / 100 + above * p.bonus_pct / 100 };
  });
  const sum = (f: (x: (typeof rows)[number]) => number, paid?: boolean) => rows.filter((x) => paid === undefined || x.r.paid === paid).reduce((a, x) => a + f(x), 0);
  return { rows, sold: sum((x) => x.total), collected: sum((x) => x.total, true), earned: sum((x) => x.commission, true), pending: sum((x) => x.commission, false) };
}

// ---- Referrals by periodistas (user, 2026-11-02) ----
// A periodista shares their own Anúnciate link (?v=<code>, the same kind of link salespeople have); orders through it
// are credited to them. Referral only: Ventas closes the deal. They earn less than salespeople (Ventas does the work),
// and an editor is warned when a story mentions a business its writer referred (a possible conflict of interest).
/** Who earns by referring advertisers (Mis referidos): periodistas, and editors too (user, 2026-11-02). */
export const REFERRERS = ['reporter', 'desk', 'editor'];
export const isReferrer = (role?: string) => REFERRERS.includes(role ?? '');
export const REFERRAL_PLAN: SalesPlan = { new_pct: 0, renew_pct: 0, bonus_pct: 0, goal: 0 }; // set per person in the panel (owner)
/** The default plan for a role: salespeople earn the sales rates, everyone else the referral rates. */
export const defaultPlanFor = (role?: string): SalesPlan => (role === 'ads' || role === 'admin' ? DEFAULT_PLAN : REFERRAL_PLAN);
/** The businesses a team member referred or sold (approved or waiting orders), by name. */
export function clientsOf(memberId: string, all: AdRequest[], team: TeamMember[] = teamList()): string[] {
  return [...new Set(all.filter((r) => r.status !== 'rechazada' && creditedTo(r, memberId, team)).map((r) => (r.client.business || r.client.name || '').trim()).filter((b) => b.length >= 3))];
}
/** Businesses a writer referred that a story's text mentions (a possible conflict of interest for the editor to weigh). */
export function conflictsIn(text: string, writerName: string, all: AdRequest[], team: TeamMember[] = teamList()): string[] {
  const w = team.find((m) => m.id && m.name.toLowerCase() === writerName.trim().toLowerCase()); if (!w?.id) return [];
  const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const body = plain(text);
  return clientsOf(w.id, all, team).filter((b) => { const k = plain(b).replace(/\s*\((ejemplo|demo)\)\s*$/, ''); return k.length >= 4 && body.includes(k); });
}
