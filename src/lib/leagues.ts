/* =========================================================
   Sports leagues for the Deportes hub (src/pages/seccion/deportes.astro)
   and the league pages (src/pages/deportes/[liga].astro).
   No Astro imports here: src/content.config.ts reads LEAGUE_IDS too.
   Only add an `url` after checking it is the league's real official site.
   `logoBg` is the badge background behind a logo made for dark backgrounds.
   `abbr` is shown in the league badge until an official logo is added as
   public/logos/<id>.png or .svg (see src/components/deportes/LeagueBadge.astro).
   `season` is a short note shown on the league page (only facts we have checked);
   `starts` (ISO date) shows the "la temporada arranca" banner on Deportes until that day.
   ========================================================= */

export const LEAGUES = [
  // Puerto Rico
  { id: 'bsn', youtube: 'UCZOFf3DbBqAMSwmzYl8RPnA', name: 'BSN', abbr: 'BSN', full: 'Baloncesto Superior Nacional', local: true, color: '#F26B1D', photo: 'basketball',
    about: 'La liga de baloncesto profesional de Puerto Rico.', url: 'https://www.bsnpr.com' },
  { id: 'doble-a', name: 'Doble A', abbr: 'LBSDA', full: 'Liga de Béisbol Superior Doble A', local: true, color: '#1B3A8C', photo: 'baseball',
    about: 'El béisbol de los pueblos, organizado por la Federación de Béisbol de Puerto Rico.', season: 'Campeón 2026: Comerío.', url: 'https://beisboldobleapr.com' },
  { id: 'invernal', youtube: 'UCyX4hGEy4iXVW5q8H_jf2jg', name: 'La Pro', abbr: 'LBPRC', full: 'Liga de Béisbol Profesional Roberto Clemente', local: true, color: '#C8202F', logoBg: '#14213D', photo: 'baseball',
    about: 'La Pro: el béisbol profesional de invierno de Puerto Rico, con seis equipos.', url: 'https://www.ligapr.com',
    season: 'Temporada 2026-27: arranca el 4 de noviembre; la fase regular termina el 28 de diciembre y las semifinales empiezan el 2 de enero de 2027.', starts: '2026-11-04T00:00:00-04:00' },
  { id: 'boxeo', name: 'Boxeo', abbr: 'BOX', full: 'Boxeo', local: true, color: '#9C1F2E', photo: 'boxing', logoShape: 'full',
    about: 'Los boxeadores boricuas en Puerto Rico y en el mundo.' },
  { id: 'tenis', name: 'Tenis', abbr: 'TEN', full: 'Tenis', local: true, color: '#2E7D32', photo: 'tennis', logoShape: 'full',
    about: 'Los tenistas boricuas en Puerto Rico y en los torneos del mundo.' },
  // Beyond the island
  { id: 'mlb', youtube: 'UCoLrcjPV5PbUrUyXq5mjc_A', name: 'Grandes Ligas', abbr: 'MLB', full: 'Grandes Ligas (MLB)', local: false, color: '#13274F', photo: 'baseball',
    about: 'Los peloteros boricuas en las Grandes Ligas.' },
  { id: 'nba', youtube: 'UCWJ2lWNubArHWmf3FIHbfcQ', name: 'NBA', abbr: 'NBA', full: 'NBA', local: false, color: '#C8102E', logoBg: '#FFFFFF', logoShape: 'tall', photo: 'basketball',
    about: 'La NBA y los boricuas en el mejor baloncesto del mundo.' },
  { id: 'nfl', name: 'NFL', abbr: 'NFL', full: 'NFL (fútbol americano)', local: false, color: '#013369', logoBg: '#FFFFFF', photo: 'football',
    about: 'La NFL: resultados, posiciones y estadísticas del fútbol americano profesional de Estados Unidos.', url: 'https://www.nfl.com' },

  { id: 'lvsm', name: 'Voleibol M', abbr: 'LVSM', full: 'Liga de Voleibol Superior Masculino', local: true, color: '#0F8C8C', logoBg: '#FFFFFF', photo: 'volleyball',
    about: 'El voleibol superior masculino de Puerto Rico, organizado por la Federación Puertorriqueña de Voleibol.', url: 'https://fedpurvoli.com/lvsm/',
    season: 'Temporada 2026: arranca el 23 de octubre con seis equipos; cada uno juega 15 partidos en la fase regular. Campeones defensores: Cafeteros de Yauco.', starts: '2026-10-23T00:00:00-04:00' },
  { id: 'lvsf', name: 'Voleibol F', abbr: 'LVSF', full: 'Liga de Voleibol Superior Femenino', local: true, color: '#B0306A', logoBg: '#FFFFFF', photo: 'volleyball',
    about: 'El voleibol superior femenino de Puerto Rico, organizado por la Federación Puertorriqueña de Voleibol.', url: 'https://fedpurvoli.com/lvsf/',
    season: 'Campeonas 2026: Cangrejeras de Santurce. La temporada 2027 arranca el 8 de enero de 2027.', starts: '2027-01-08T00:00:00-04:00' },] as const satisfies ReadonlyArray<{
  id: string; name: string; abbr: string; full: string; local: boolean; color: string; about: string; url?: string; season?: string; starts?: string; logoBg?: string; logoShape?: 'tall' | 'full'; youtube?: string; photo?: 'basketball' | 'baseball' | 'volleyball' | 'boxing' | 'tennis' | 'football';
}>;

export const LEAGUE_IDS = LEAGUES.map((l) => l.id) as unknown as readonly [(typeof LEAGUES)[number]['id'], ...(typeof LEAGUES)[number]['id'][]];
export type LeagueId = (typeof LEAGUES)[number]['id'];
export type League = (typeof LEAGUES)[number];

export const league = (id?: string): League | undefined => LEAGUES.find((l) => l.id === id);
