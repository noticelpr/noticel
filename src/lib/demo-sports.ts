/* =========================================================
   DEMO sports data (scores, standings, team stats, brackets, game pages).
   Used only while SITE.sportsDemo is true (src/lib/site.ts). Every place that
   shows it labels it "DEMO". Results are invented; no player names are used.
   Dates are built relative to today so the demo always looks current.
   ========================================================= */
import type { Game, Standings, Bracket, TeamStats } from './scores';

// "YYYY-MM-DDTHH:MM:00-04:00" for today + `days` in Puerto Rico
function at(days: number, time: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' });
  const d = new Date(`${today}T12:00:00-04:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.toISOString().slice(0, 10)}T${time}:00-04:00`;
}

const inningLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const DEMO_GAMES: Game[] = [
  // La Pro (Liga de Béisbol Profesional Roberto Clemente): six real teams and stadiums, invented results
  {
    id: 'demo-lbprc-1', demo: true, league: 'invernal', status: 'en-vivo', note: 'Alta 7ma',
    date: at(0, '19:21'), away: 'Cangrejeros', home: 'Criollos', awayScore: 3, homeScore: 2,
    awayFull: 'Cangrejeros de Santurce', homeFull: 'Criollos de Caguas', venue: 'Estadio Yldefonso Solá Morales, Caguas',
    awayRecord: '12-6', homeRecord: '11-7',
    linescore: { labels: inningLabels, away: [0, 1, 0, 0, 2, 0, 0, '', ''], home: [1, 0, 0, 1, 0, 0, '', '', ''], totals: ['C', 'H', 'E'], awayTotals: [3, 7, 0], homeTotals: [2, 6, 1] },
    stats: [
      { label: 'Hits', away: '7', home: '6' }, { label: 'Jonrones', away: '1', home: '0' },
      { label: 'Bases por bolas', away: '3', home: '2' }, { label: 'Ponches', away: '5', home: '8' },
      { label: 'Errores', away: '0', home: '1' }, { label: 'Corredores dejados en base', away: '5', home: '4' },
    ],
    plays: [
      { when: 'Alta 7ma', text: 'Santurce tiene corredor en primera con un out.' },
      { when: 'Baja 6ta', text: 'Caguas deja dos corredores en base tras un elevado al jardín central.' },
      { when: 'Alta 5ta', text: 'Jonrón de dos carreras al jardín izquierdo pone arriba a Santurce, 3-2.' },
      { when: 'Baja 4ta', text: 'Doble al jardín derecho empuja la segunda carrera de Caguas.' },
      { when: 'Alta 2da', text: 'Sencillo productor empata el juego 1-1.' },
      { when: 'Baja 1ra', text: 'Caguas anota primero con un elevado de sacrificio.' },
    ],
  },
  {
    id: 'demo-lbprc-2', demo: true, league: 'invernal', status: 'final', note: '10 entradas',
    date: at(0, '16:21'), away: 'Indios', home: 'Leones', awayScore: 5, homeScore: 4,
    awayFull: 'Indios de Mayagüez', homeFull: 'Leones de Ponce', venue: 'Estadio Francisco "Paquito" Montaner, Ponce',
    awayRecord: '9-9', homeRecord: '8-10',
    linescore: { labels: [...inningLabels, '10'], away: [0, 0, 2, 0, 0, 1, 0, 1, 0, 1], home: [1, 0, 0, 0, 2, 0, 0, 0, 1, 0], totals: ['C', 'H', 'E'], awayTotals: [5, 11, 1], homeTotals: [4, 9, 0] },
    stats: [
      { label: 'Hits', away: '11', home: '9' }, { label: 'Jonrones', away: '0', home: '1' },
      { label: 'Bases por bolas', away: '4', home: '3' }, { label: 'Ponches', away: '9', home: '7' },
      { label: 'Errores', away: '1', home: '0' }, { label: 'Corredores dejados en base', away: '10', home: '6' },
    ],
    plays: [
      { when: 'Baja 10ma', text: 'Rodado a segunda termina el juego. Mayagüez gana 5-4.' },
      { when: 'Alta 10ma', text: 'Sencillo al jardín central impulsa la carrera de la ventaja para Mayagüez.' },
      { when: 'Baja 9na', text: 'Ponce empata 4-4 con un doble al jardín izquierdo.' },
      { when: 'Alta 8va', text: 'Mayagüez se va arriba 4-3 con un toque de sacrificio.' },
    ],
  },
  {
    id: 'demo-lbprc-3', demo: true, league: 'invernal', status: 'programado',
    date: at(1, '19:21'), away: 'Senadores', home: 'Gigantes', awayFull: 'Senadores de San Juan', homeFull: 'Gigantes de Carolina',
    venue: 'Estadio Roberto Clemente Walker, Carolina', awayRecord: '10-8', homeRecord: '4-14',
  },
  {
    id: 'demo-lbprc-4', demo: true, league: 'invernal', status: 'programado',
    date: at(2, '19:21'), away: 'Criollos', home: 'Indios', awayFull: 'Criollos de Caguas', homeFull: 'Indios de Mayagüez',
    venue: 'Estadio Isidoro "Cholo" García, Mayagüez', awayRecord: '11-7', homeRecord: '9-9',
  },
  // BSN
  {
    id: 'demo-bsn-1', demo: true, league: 'bsn', status: 'en-vivo', note: '4to parcial · 3:12',
    date: at(0, '20:00'), away: 'Santeros', home: 'Vaqueros', awayScore: 74, homeScore: 78,
    awayFull: 'Santeros de Aguada', homeFull: 'Vaqueros de Bayamón', venue: 'Coliseo Rubén Rodríguez, Bayamón',
    awayRecord: '20-12', homeRecord: '22-10',
    linescore: { labels: ['1', '2', '3', '4'], away: [19, 22, 18, 15], home: [21, 18, 20, 19], totals: ['T'], awayTotals: [74], homeTotals: [78] },
    stats: [
      { label: 'Tiros de campo', away: '28-61 (45.9%)', home: '29-58 (50.0%)' }, { label: 'Triples', away: '8-24', home: '7-19' },
      { label: 'Tiros libres', away: '10-13', home: '13-16' }, { label: 'Rebotes', away: '33', home: '37' },
      { label: 'Asistencias', away: '16', home: '19' }, { label: 'Pérdidas de balón', away: '11', home: '9' },
    ],
    plays: [
      { when: '4to · 3:12', text: 'Tiempo pedido por Aguada. Bayamón arriba por cuatro.' },
      { when: '4to · 3:40', text: 'Triple desde la esquina para Bayamón, 78-74.' },
      { when: '4to · 5:05', text: 'Aguada empata 72-72 con una bandeja en contraataque.' },
      { when: '3ro · 0:00', text: 'El tercer parcial termina empatado 59-59.' },
    ],
  },
  {
    id: 'demo-bsn-2', demo: true, league: 'bsn', status: 'final',
    date: at(-1, '20:00'), away: 'Piratas', home: 'Capitanes', awayScore: 88, homeScore: 91,
    awayFull: 'Piratas de Quebradillas', homeFull: 'Capitanes de Arecibo', venue: 'Coliseo Manuel "Petaca" Iguina, Arecibo',
    awayRecord: '18-14', homeRecord: '19-13',
    linescore: { labels: ['1', '2', '3', '4'], away: [22, 20, 25, 21], home: [18, 26, 22, 25], totals: ['T'], awayTotals: [88], homeTotals: [91] },
    stats: [
      { label: 'Tiros de campo', away: '32-70 (45.7%)', home: '33-66 (50.0%)' }, { label: 'Triples', away: '11-30', home: '9-24' },
      { label: 'Tiros libres', away: '13-17', home: '16-20' }, { label: 'Rebotes', away: '35', home: '40' },
      { label: 'Asistencias', away: '18', home: '21' }, { label: 'Pérdidas de balón', away: '12', home: '10' },
    ],
    plays: [
      { when: 'Final', text: 'Arecibo resiste en el último minuto y gana 91-88.' },
      { when: '4to · 0:24', text: 'Dos tiros libres de Arecibo para la ventaja de tres.' },
    ],
  },
  {
    id: 'demo-bsn-3', demo: true, league: 'bsn', status: 'programado',
    date: at(1, '20:00'), away: 'Mets', home: 'Atléticos', awayFull: 'Mets de Guaynabo', homeFull: 'Atléticos de San Germán',
    venue: 'Coliseo Arquelio Torres Ramírez, San Germán', awayRecord: '14-18', homeRecord: '16-16',
  },
  // NBA: real teams, invented results
  {
    id: 'demo-nba-1', demo: true, league: 'nba', status: 'en-vivo', note: '3er cuarto · 5:12',
    date: at(0, '19:30'), away: 'New York Knicks', home: 'Boston Celtics', awayScore: 71, homeScore: 76,
    venue: 'TD Garden, Boston', awayRecord: '3-1', homeRecord: '4-0',
    linescore: { labels: ['1', '2', '3', '4'], away: [26, 24, 21, ''], home: [22, 30, 24, ''], totals: ['T'], awayTotals: [71], homeTotals: [76] },
    stats: [
      { label: '% tiros de campo', away: '45.2', home: '48.9' }, { label: 'Triples', away: '9', home: '11' },
      { label: 'Rebotes', away: '31', home: '34' }, { label: 'Asistencias', away: '15', home: '19' }, { label: 'Pérdidas', away: '8', home: '6' },
    ],
  },
  {
    id: 'demo-nba-2', demo: true, league: 'nba', status: 'final',
    date: at(-1, '20:00'), away: 'Miami Heat', home: 'Orlando Magic', awayScore: 108, homeScore: 112,
    venue: 'Kia Center, Orlando', awayRecord: '2-2', homeRecord: '3-1',
    linescore: { labels: ['1', '2', '3', '4'], away: [28, 25, 27, 28], home: [24, 31, 29, 28], totals: ['T'], awayTotals: [108], homeTotals: [112] },
  },
  {
    id: 'demo-nba-3', demo: true, league: 'nba', status: 'programado',
    date: at(1, '22:30'), away: 'Golden State Warriors', home: 'Los Angeles Lakers', awayRecord: '2-1', homeRecord: '2-2',
    venue: 'Crypto.com Arena, Los Ángeles',
  },
  // Voleibol: real teams, invented results (the score is sets won)
  {
    id: 'demo-lvsm-1', demo: true, league: 'lvsm', status: 'en-vivo', note: '4to set',
    date: at(0, '20:00'), away: 'Patriotas', home: 'Cafeteros', awayScore: 1, homeScore: 2,
    awayFull: 'Patriotas de Lares', homeFull: 'Cafeteros de Yauco', awayRecord: '3-1', homeRecord: '4-0',
    linescore: { labels: ['1', '2', '3', '4', '5'], away: [25, 21, 22, 14, ''], home: [22, 25, 25, 12, ''], totals: ['Sets'], awayTotals: [1], homeTotals: [2] },
  },
  {
    id: 'demo-lvsm-2', demo: true, league: 'lvsm', status: 'final',
    date: at(-1, '20:00'), away: 'Changos', home: 'Plataneros', awayScore: 3, homeScore: 1,
    awayFull: 'Changos de Naranjito', homeFull: 'Plataneros de Corozal', awayRecord: '3-1', homeRecord: '1-3',
    linescore: { labels: ['1', '2', '3', '4', '5'], away: [25, 23, 25, 25, ''], home: [20, 25, 19, 22, ''], totals: ['Sets'], awayTotals: [3], homeTotals: [1] },
  },
  {
    id: 'demo-lvsf-1', demo: true, league: 'lvsf', status: 'final',
    date: at(-1, '19:00'), away: 'Criollas', home: 'Cangrejeras', awayScore: 1, homeScore: 3,
    awayFull: 'Criollas de Caguas', homeFull: 'Cangrejeras de Santurce', awayRecord: '2-2', homeRecord: '4-0',
    linescore: { labels: ['1', '2', '3', '4', '5'], away: [25, 18, 21, 22, ''], home: [23, 25, 25, 25, ''], totals: ['Sets'], awayTotals: [1], homeTotals: [3] },
  },
  {
    id: 'demo-lvsf-2', demo: true, league: 'lvsf', status: 'programado',
    date: at(2, '19:30'), away: 'Leonas', home: 'Valencianas', awayFull: 'Leonas de Ponce', homeFull: 'Valencianas de Juncos',
    awayRecord: '3-1', homeRecord: '1-3',
  },
];

const s = (team: string, w: number, l: number, gb: string, l10: string, streak: string) => ({ team, w, l, gb, extra: [l10, streak] });

export const DEMO_STANDINGS: Record<string, Standings> = {
  invernal: {
    groups: [{ columns: ['ÚLT. 10', 'RACHA'], rows: [
      s('Cangrejeros de Santurce', 12, 6, '—', '7-3', 'G3'), s('Criollos de Caguas', 11, 7, '1.0', '6-4', 'P1'),
      s('Senadores de San Juan', 10, 8, '2.0', '6-4', 'G1'), s('Indios de Mayagüez', 9, 9, '3.0', '5-5', 'G2'),
      s('Leones de Ponce', 8, 10, '4.0', '4-6', 'P2'), s('Gigantes de Carolina', 4, 14, '8.0', '2-8', 'P4'),
    ] }],
  },
  bsn: {
    groups: [
      { name: 'Sección A', columns: ['ÚLT. 10', 'RACHA'], rows: [
        s('Vaqueros de Bayamón', 22, 10, '—', '8-2', 'G4'), s('Capitanes de Arecibo', 19, 13, '3.0', '6-4', 'G1'),
        s('Cangrejeros de Santurce', 17, 15, '5.0', '5-5', 'P1'), s('Mets de Guaynabo', 14, 18, '8.0', '4-6', 'P2'),
        s('Criollos de Caguas', 13, 19, '9.0', '3-7', 'P3'), s('Gigantes de Carolina', 12, 20, '10.0', '4-6', 'G1'),
      ] },
      { name: 'Sección B', columns: ['ÚLT. 10', 'RACHA'], rows: [
        s('Santeros de Aguada', 20, 12, '—', '7-3', 'P1'), s('Piratas de Quebradillas', 18, 14, '2.0', '6-4', 'P1'),
        s('Atléticos de San Germán', 16, 16, '4.0', '5-5', 'G2'), s('Indios de Mayagüez', 15, 17, '5.0', '5-5', 'G1'),
        s('Leones de Ponce', 14, 18, '6.0', '4-6', 'P2'), s('Osos de Manatí', 11, 21, '9.0', '2-8', 'P5'),
      ] },
    ],
  },
  nba: {
    groups: [
      { name: 'Conferencia Este', columns: ['ÚLT. 10', 'RACHA'], rows: [s('Boston Celtics', 4, 0, '—', '4-0', 'G1'), s('New York Knicks', 3, 1, '1.0', '3-1', 'G1'), s('Orlando Magic', 3, 1, '1.0', '3-1', 'G1'), s('Cleveland Cavaliers', 3, 1, '1.0', '3-1', 'G1'), s('Milwaukee Bucks', 2, 2, '2.0', '2-2', 'G1'), s('Indiana Pacers', 2, 2, '2.0', '2-2', 'G1'), s('Philadelphia 76ers', 2, 2, '2.0', '2-2', 'G1'), s('Miami Heat', 2, 2, '2.0', '2-2', 'G1'), s('Atlanta Hawks', 2, 2, '2.0', '2-2', 'G1'), s('Chicago Bulls', 1, 3, '3.0', '1-3', 'P1'), s('Detroit Pistons', 1, 3, '3.0', '1-3', 'P1'), s('Toronto Raptors', 1, 3, '3.0', '1-3', 'P1'), s('Brooklyn Nets', 1, 3, '3.0', '1-3', 'P1'), s('Charlotte Hornets', 0, 4, '4.0', '0-4', 'P1'), s('Washington Wizards', 0, 4, '4.0', '0-4', 'P1')] },
      { name: 'Conferencia Oeste', columns: ['ÚLT. 10', 'RACHA'], rows: [s('Oklahoma City Thunder', 4, 0, '—', '4-0', 'G1'), s('Denver Nuggets', 3, 1, '1.0', '3-1', 'G1'), s('Minnesota Timberwolves', 3, 1, '1.0', '3-1', 'G1'), s('Los Angeles Lakers', 2, 2, '2.0', '2-2', 'G1'), s('Golden State Warriors', 2, 1, '1.5', '2-1', 'G1'), s('Houston Rockets', 2, 2, '2.0', '2-2', 'G1'), s('Dallas Mavericks', 2, 2, '2.0', '2-2', 'G1'), s('LA Clippers', 2, 2, '2.0', '2-2', 'G1'), s('Memphis Grizzlies', 2, 2, '2.0', '2-2', 'G1'), s('Phoenix Suns', 1, 3, '3.0', '1-3', 'P1'), s('Sacramento Kings', 1, 3, '3.0', '1-3', 'P1'), s('San Antonio Spurs', 1, 3, '3.0', '1-3', 'P1'), s('New Orleans Pelicans', 1, 3, '3.0', '1-3', 'P1'), s('Portland Trail Blazers', 0, 4, '4.0', '0-4', 'P1'), s('Utah Jazz', 0, 3, '3.5', '0-3', 'P1')] },
    ],
  },
  lvsm: {
    groups: [{ columns: ['ÚLT. 10', 'RACHA'], rows: [
      s('Cafeteros de Yauco', 4, 0, '—', '4-0', 'G4'), s('Patriotas de Lares', 3, 1, '1.0', '3-1', 'G2'),
      s('Changos de Naranjito', 3, 1, '1.0', '3-1', 'G1'), s('Gigantes de Carolina', 2, 2, '2.0', '2-2', 'P1'),
      s('Plataneros de Corozal', 1, 3, '3.0', '1-3', 'P2'), s('Gigantes de Adjuntas', 0, 4, '4.0', '0-4', 'P4'),
    ] }],
  },
};

export const DEMO_STATS: Record<string, TeamStats> = {
  invernal: { columns: ['PRO', 'HR', 'CA', 'EFE'], rows: [
    { team: 'Cangrejeros de Santurce', values: ['.271', '18', '96', '3.21'] }, { team: 'Criollos de Caguas', values: ['.265', '15', '88', '3.45'] },
    { team: 'Senadores de San Juan', values: ['.261', '13', '84', '3.70'] }, { team: 'Indios de Mayagüez', values: ['.258', '12', '81', '3.88'] },
    { team: 'Leones de Ponce', values: ['.249', '14', '77', '4.02'] }, { team: 'Gigantes de Carolina', values: ['.237', '9', '61', '4.66'] },
  ] },
  bsn: { columns: ['PPJ', 'REB', 'AST', '% TC'], rows: [
    { team: 'Vaqueros de Bayamón', values: ['92.4', '39.1', '20.3', '48.9'] }, { team: 'Santeros de Aguada', values: ['90.8', '37.6', '19.1', '47.5'] },
    { team: 'Capitanes de Arecibo', values: ['89.7', '38.4', '18.8', '47.0'] }, { team: 'Piratas de Quebradillas', values: ['88.2', '36.9', '19.7', '46.4'] },
    { team: 'Atléticos de San Germán', values: ['86.5', '36.2', '17.9', '45.8'] }, { team: 'Cangrejeros de Santurce', values: ['86.1', '35.8', '18.2', '45.1'] },
  ] },
  nba: { columns: ['PPJ', 'REB', 'AST', '% TC'], rows: [
    { team: 'Boston Celtics', values: ['118.5', '46.2', '27.1', '48.8'] }, { team: 'Oklahoma City Thunder', values: ['117.9', '44.8', '26.4', '49.2'] },
    { team: 'Denver Nuggets', values: ['116.2', '45.5', '29.0', '50.1'] }, { team: 'New York Knicks', values: ['114.0', '47.1', '24.3', '47.4'] },
    { team: 'Orlando Magic', values: ['110.8', '45.9', '23.8', '46.2'] }, { team: 'Miami Heat', values: ['108.3', '42.7', '25.6', '45.9'] },
  ] },
  lvsm: { columns: ['ATAQUE %', 'BLOQUEOS', 'ACES', 'SETS G-P'], rows: [
    { team: 'Cafeteros de Yauco', values: ['48.1', '38', '22', '12-3'] }, { team: 'Patriotas de Lares', values: ['45.6', '33', '19', '10-6'] },
    { team: 'Changos de Naranjito', values: ['44.9', '35', '17', '10-6'] }, { team: 'Gigantes de Carolina', values: ['42.3', '29', '15', '8-8'] },
    { team: 'Plataneros de Corozal', values: ['40.7', '27', '14', '5-10'] }, { team: 'Gigantes de Adjuntas', values: ['38.2', '24', '11', '2-12'] },
  ] },
  lvsf: { columns: ['ATAQUE %', 'BLOQUEOS', 'ACES', 'SETS G-P'], rows: [
    { team: 'Cangrejeras de Santurce', values: ['46.4', '36', '24', '12-2'] }, { team: 'Criollas de Caguas', values: ['43.8', '31', '18', '10-5'] },
    { team: 'Pinkin de Corozal', values: ['42.1', '29', '17', '9-7'] }, { team: 'Leonas de Ponce', values: ['41.2', '28', '16', '8-8'] },
    { team: 'Atenienses de Manatí', values: ['40.3', '26', '14', '6-10'] }, { team: 'Valencianas de Juncos', values: ['39.5', '25', '13', '4-11'] },
  ] },
  'doble-a': { columns: ['PRO', 'HR', 'CA', 'EFE'], rows: [
    { team: 'Patrulleros de San Sebastián', values: ['.318', '24', '169', '1.92'] }, { team: 'Artesanos de Las Piedras', values: ['.305', '19', '154', '2.31'] },
    { team: 'Poetas de Juana Díaz', values: ['.311', '21', '156', '4.48'] }, { team: 'Toritos de Cayey', values: ['.302', '18', '151', '3.12'] },
    { team: 'Pescadores del Plata de Comerío', values: ['.287', '14', '111', '2.04'] }, { team: 'Arenosos de Camuy', values: ['.296', '20', '138', '4.25'] },
  ] },
};

export const DEMO_BRACKETS: Record<string, Bracket> = {
  bsn: { name: 'Postemporada', rounds: [
    { name: 'Semifinal A', series: [{ a: 'Vaqueros de Bayamón', b: 'Capitanes de Arecibo', aWins: 3, bWins: 1 }] },
    { name: 'Semifinal B', series: [{ a: 'Santeros de Aguada', b: 'Piratas de Quebradillas', aWins: 2, bWins: 2, note: 'Juego 5 el sábado' }] },
    { name: 'Final', series: [{ a: 'Vaqueros de Bayamón', b: 'Por definir' }] },
  ] },
  invernal: { name: 'Postemporada 2026-27', rounds: [
    { name: 'Semifinal', series: [
      { a: 'Cangrejeros de Santurce', b: 'Leones de Ponce', aWins: 2, bWins: 1 },
      { a: 'Criollos de Caguas', b: 'Senadores de San Juan', aWins: 1, bWins: 2 },
    ] },
    { name: 'Serie Final', series: [{ a: 'Por definir', b: 'Por definir', note: 'Al mejor de 7' }] },
  ] },
  lvsm: { name: 'Postemporada', rounds: [
    { name: 'Semifinal', series: [
      { a: 'Cafeteros de Yauco', b: 'Gigantes de Carolina', aWins: 3, bWins: 1 },
      { a: 'Patriotas de Lares', b: 'Changos de Naranjito', aWins: 2, bWins: 3 },
    ] },
    { name: 'Final', series: [{ a: 'Cafeteros de Yauco', b: 'Changos de Naranjito', aWins: 1, bWins: 1, note: 'Juego 3 el viernes' }] },
  ] },
};
