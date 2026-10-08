/* Sports data for the score strips, league pages and home page.
   Today these files are typed by an editor; later a licensed data provider can
   fill the same files (same shapes) from a script, without changing the pages.
   Every section hides itself or shows a note when its file is empty,
   so we never show made-up results. */
import realGames from '../data/marcadores.json';
import standingsData from '../data/posiciones.json';
import bracketsData from '../data/llaves.json';
import statsData from '../data/estadisticas.json';
import type { LeagueId } from './leagues';
import { SITE } from './site';
import { DEMO_GAMES, DEMO_STANDINGS, DEMO_STATS, DEMO_BRACKETS } from './demo-sports';

export type Game = {
  league: LeagueId;
  date: string; // e.g. "2026-11-04T19:30:00-04:00"
  away: string; // visitor, e.g. "Cangrejeros"
  home: string;
  awayScore?: number;
  homeScore?: number;
  status: 'final' | 'en-vivo' | 'programado';
  note?: string; // e.g. "4to parcial", "7ma entrada"
  venue?: string;
  // Optional, for the game page (/deportes/juego/<id>/)
  id?: string; // e.g. "bsn-2027-05-10-vaqueros-santeros"
  demo?: boolean;
  awayFull?: string; // e.g. "Vaqueros de Bayamón"
  homeFull?: string;
  awayRecord?: string; // e.g. "22-10"
  homeRecord?: string;
  linescore?: { labels: string[]; away: Array<number | string>; home: Array<number | string>; totals: string[]; awayTotals: Array<number | string>; homeTotals: Array<number | string> };
  stats?: Array<{ label: string; away: string; home: string }>;
  plays?: Array<{ when: string; text: string }>; // newest first
};

export type TeamStats = { columns: string[]; rows: Array<{ team: string; values: string[] }> };

export type Standings = {
  updated?: string; // e.g. "2026-11-20"
  groups: Array<{
    name?: string; // e.g. "Sección A"; leave out if there's only one table
    columns?: string[]; // extra columns, e.g. ["DIF"]; default shows G, P, PCT, DIF
    rows: Array<{ team: string; w: number; l: number; gb?: string; extra?: string[] }>;
  }>;
};

export type Bracket = {
  name?: string; // e.g. "Serie Final 2027"
  updated?: string; // e.g. "1 de octubre de 2026. Fuente: MLB.com"
  rounds: Array<{
    name: string; // e.g. "Semifinal"
    series: Array<{ a: string; b: string; aWins?: number; bWins?: number; note?: string }>;
  }>;
};

const t = (g: Game) => new Date(g.date).valueOf();
const demo = SITE.sportsDemo;
/** Real data plus, while SITE.sportsDemo is on, the demo data. */
const allGames = (): Game[] => [...(realGames as Game[]), ...(demo ? DEMO_GAMES : [])];

/** Live games first, then upcoming (soonest first), then finals (newest first). */
export function scores(league?: string, max = 16): Game[] {
  const list = allGames().filter((g) => !league || g.league === league);
  const live = list.filter((g) => g.status === 'en-vivo');
  const next = list.filter((g) => g.status === 'programado').sort((a, b) => t(a) - t(b));
  const done = list.filter((g) => g.status === 'final').sort((a, b) => t(b) - t(a));
  return [...live, ...next, ...done].slice(0, max);
}

export const games = (): Game[] => allGames().filter((g) => g.id);
export const standings = (league: string): Standings | undefined =>
  (standingsData as Record<string, Standings>)[league] ?? (demo ? DEMO_STANDINGS[league] : undefined);
export const bracket = (league: string): Bracket | undefined =>
  (bracketsData as Record<string, Bracket>)[league] ?? (demo ? DEMO_BRACKETS[league] : undefined);
export const teamStats = (league: string): TeamStats | undefined =>
  (statsData as Record<string, TeamStats>)[league] ?? (demo ? DEMO_STATS[league] : undefined);
/** True when this league's tables are showing demo numbers. */
export const isDemoTable = (kind: 'standings' | 'brackets' | 'stats', league: string) =>
  demo && !({ standings: standingsData, brackets: bracketsData, stats: statsData }[kind] as Record<string, unknown>)[league];

export const gameTime = (d: string) =>
  new Date(d).toLocaleString('es-PR', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Puerto_Rico' });
