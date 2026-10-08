// Holiday logos: a small decoration added to the normal logo on Puerto Rico and U.S. holidays (the logo itself never changes).
// Festive days get playful touches; solemn days get respectful ones (black ribbon, flag at half-staff).
// Chosen automatically at build time in Puerto Rico time (the site rebuilds every 15 minutes), and switched off while an
// ÚLTIMA HORA alert is active. Preview of every design: /logos-festivos/ (internal).

export type Spot = 'top' | 'side' | 'sky';
export type Deco = { spot: Spot; svg: string; vb?: string };
export type Holiday = {
  id: string; name: string; tone: 'festivo' | 'solemne'; when: string;
  dates: (y: number) => [string, string]; // first and last day (YYYY-MM-DD), inclusive
  title: string; // tooltip / screen reader text on the logo
  decos: Deco[];
};

// ---- date helpers ----
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const day = (y: number, m: number, d: number): [string, string] => [iso(y, m, d), iso(y, m, d)];
/** n-th weekday (0 = Sunday) of a month; n = -1 for the last one. */
function nth(y: number, m: number, wd: number, n: number) {
  if (n > 0) { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return 1 + ((wd - first + 7) % 7) + 7 * (n - 1); }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return lastDay - ((last - wd + 7) % 7);
}
const nthDay = (y: number, m: number, wd: number, n: number) => day(y, m, nth(y, m, wd, n));

// ---- drawings (each in its own small box; 'top' sits on the X, 'side' under the ®, 'sky' above the word) ----
const PR_FLAG = `<g><rect x="6" y="20" width="4" height="74" rx="2" fill="#6B5B3E"/>
  <g transform="translate(10 22)"><rect width="84" height="56" fill="#fff"/>
  <rect y="0" width="84" height="11.2" fill="#D7263D"/><rect y="22.4" width="84" height="11.2" fill="#D7263D"/><rect y="44.8" width="84" height="11.2" fill="#D7263D"/>
  <path d="M0 0L44 28L0 56z" fill="#0050F0"/><path d="M14 20.5l2.4 5 5.5.6-4.1 3.7 1.2 5.4-5-2.8-5 2.8 1.2-5.4-4.1-3.7 5.5-.6z" fill="#fff"/></g></g>`;
const US_FLAG = (y = 22) => `<g><rect x="6" y="14" width="4" height="80" rx="2" fill="#6B5B3E"/>
  <g transform="translate(10 ${y})"><rect width="84" height="56" fill="#fff"/>
  ${[0, 2, 4, 6, 8, 10, 12].map((i) => `<rect y="${(i * 56) / 13}" width="84" height="${56 / 13}" fill="#B22234"/>`).join('')}
  <rect width="38" height="30" fill="#3C3B6E"/>
  ${[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3, 4].map((c) => `<circle cx="${5 + c * 7 + (r % 2) * 3.5}" cy="${5 + r * 7}" r="1.6" fill="#fff"/>`)).join('')}</g></g>`;
// U.S. flag at half-staff: tall pole with a gold ball, the flag lowered to the middle
const HALF_STAFF = `<rect x="14" y="4" width="4" height="92" rx="2" fill="#6B5B3E"/><circle cx="16" cy="5" r="4.5" fill="#E0A100"/>
  <g transform="translate(18 44) scale(.82)"><rect width="84" height="52" fill="#fff"/>
  ${[0, 2, 4, 6, 8, 10, 12].map((i) => `<rect y="${(i * 52) / 13}" width="84" height="${52 / 13}" fill="#B22234"/>`).join('')}
  <rect width="38" height="28" fill="#3C3B6E"/>
  ${[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3, 4].map((c) => `<circle cx="${5 + c * 7 + (r % 2) * 3.5}" cy="${5 + r * 6.5}" r="1.6" fill="#fff"/>`)).join('')}</g>`;
// Roberto Clemente: the back of a black jersey with a gold 21 (Pittsburgh colors, no team logo)
const JERSEY_21 = `<path d="M30 10l12-5c3 6 13 6 16 0l12 5 22 18-10 15-10-7v58H28V36l-10 7L8 28z" fill="#16161D" stroke="#FDB827" stroke-width="4" stroke-linejoin="round"/>
  <path d="M42 5c3 6 13 6 16 0" stroke="#FDB827" stroke-width="4" fill="none"/>
  <text x="50" y="76" text-anchor="middle" font-family="Poppins,Arial,sans-serif" font-weight="800" font-size="40" fill="#FDB827">21</text>`;
// Descubrimiento de Puerto Rico: a caravel with red-cross sails
const CARABELA = `<path d="M10 66h80l-10 16H22z" fill="#7A4A21" stroke="#4A2C12" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M50 14v52M30 26v40M70 26v40" stroke="#4A2C12" stroke-width="3"/>
  <path d="M38 20h24c2 10 2 22 0 34H38c-2-12-2-24 0-34z" fill="#FBF7EE" stroke="#C9C2B1" stroke-width="1.5"/><path d="M50 28v18M43 37h14" stroke="#D7263D" stroke-width="4"/>
  <path d="M22 32h16c1.5 7 1.5 15 0 22H22c-1.5-7-1.5-15 0-22zM62 32h16c1.5 7 1.5 15 0 22H62c-1.5-7-1.5-15 0-22z" fill="#FBF7EE" stroke="#C9C2B1" stroke-width="1.5"/>
  <path d="M2 86c8-5 16-5 24 0s16 5 24 0 16-5 24 0 16 5 24 0" stroke="#1F90DA" stroke-width="4" fill="none" stroke-linecap="round"/>`;
const RIBBON = (fill = '#16161D') => `<path stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round" d="M50 8c-12 0-20 9-20 21 0 11 7 22 14 32L22 92l12 4 16-24 16 24 12-4-22-31c7-10 14-21 14-32 0-12-8-21-20-21zm0 12c5 0 8 4 8 9 0 6-4 13-8 19-4-6-8-13-8-19 0-5 3-9 8-9z" fill="${fill}"/>`;
const BURST = (cx: number, cy: number, r: number, c: string) => `<g stroke="${c}" stroke-width="3" stroke-linecap="round">${Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2; const x1 = cx + Math.cos(a) * r * 0.35, y1 = cy + Math.sin(a) * r * 0.35, x2 = cx + Math.cos(a) * r, y2 = cy + Math.sin(a) * r;
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
}).join('')}</g><circle cx="${cx}" cy="${cy}" r="3" fill="${c}"/>`;
const HAT = `<path d="M8 66C14 38 34 12 62 8c14-2 24 6 26 18-10-6-20-4-26 6L52 64z" fill="#D7263D"/>
  <path d="M62 8c14-2 24 6 26 18" stroke="#A9172B" stroke-width="3" fill="none"/>
  <rect x="2" y="58" width="60" height="16" rx="8" fill="#fff" stroke="#E5E1D8" stroke-width="1.5"/>
  <circle cx="88" cy="30" r="10" fill="#fff" stroke="#E5E1D8" stroke-width="1.5"/>`;
const CROWN = `<path d="M6 70L10 22l20 22L50 8l20 36 20-22 4 48z" fill="#F2B705" stroke="#B8860B" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="6" y="66" width="88" height="14" rx="3" fill="#E0A100" stroke="#B8860B" stroke-width="2.5"/>
  <circle cx="30" cy="73" r="4" fill="#D7263D"/><circle cx="50" cy="73" r="4" fill="#1F90DA"/><circle cx="70" cy="73" r="4" fill="#0E8A5F"/>
  <circle cx="10" cy="20" r="5" fill="#F2B705"/><circle cx="50" cy="7" r="5" fill="#F2B705"/><circle cx="90" cy="20" r="5" fill="#F2B705"/>`;

export const HOLIDAYS: Holiday[] = [
  { id: 'ano-nuevo', name: 'Año Nuevo', tone: 'festivo', when: '31 de diciembre y 1 de enero', title: '¡Feliz Año Nuevo!',
    dates: (y) => [iso(y - 1, 12, 31), iso(y, 1, 1)],
    decos: [{ spot: 'sky', vb: '0 0 200 60', svg: BURST(30, 30, 24, '#F2B705') + BURST(100, 26, 20, '#1F90DA') + BURST(168, 32, 24, '#D7263D') }] },
  { id: 'reyes', name: 'Día de Reyes', tone: 'festivo', when: '5 y 6 de enero', title: '¡Feliz Día de Reyes!',
    dates: (y) => [iso(y, 1, 5), iso(y, 1, 6)], decos: [{ spot: 'top', svg: CROWN }] },
  { id: 'amor-amistad', name: 'Día del Amor y la Amistad', tone: 'festivo', when: '14 de febrero', title: '¡Feliz Día del Amor y la Amistad!',
    dates: (y) => day(y, 2, 14),
    decos: [{ spot: 'side', svg: `<path d="M38 88S8 66 8 44c0-12 8-20 18-20 6 0 10 3 12 7 2-4 6-7 12-7 10 0 18 8 18 20 0 22-30 44-30 44z" fill="#D7263D"/><path d="M70 60S52 47 52 34c0-7 5-12 11-12 3.5 0 6 2 7 4 1-2 3.5-4 7-4 6 0 11 5 11 12 0 13-18 26-18 26z" fill="#F4A7B4"/>` }] },
  { id: 'abolicion', name: 'Día de la Abolición de la Esclavitud', tone: 'solemne', when: '22 de marzo', title: 'Día de la Abolición de la Esclavitud en Puerto Rico (1873)',
    dates: (y) => day(y, 3, 22),
    decos: [{ spot: 'side', svg: `<g fill="none" stroke="#8A8F98" stroke-width="7" stroke-linecap="round"><path d="M14 30a12 12 0 0 1 22-6l8 12"/><path d="M14 30a12 12 0 0 0 10 16"/><rect x="34" y="40" width="30" height="18" rx="9" transform="rotate(35 49 49)"/><path d="M86 70a12 12 0 0 1-22 6l-8-12"/><path d="M86 70a12 12 0 0 0-10-16"/></g><g stroke="#F2B705" stroke-width="3" stroke-linecap="round"><path d="M22 60l-8 6M30 66l-4 9M70 32l8-6M78 40l9-2"/></g>` }] },
  { id: 'madres', name: 'Día de las Madres', tone: 'festivo', when: 'Segundo domingo de mayo', title: '¡Feliz Día de las Madres!',
    dates: (y) => nthDay(y, 5, 0, 2),
    decos: [{ spot: 'side', svg: `<path d="M50 52c-2 14-6 28-14 40" stroke="#0E8A5F" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M40 78c-10-2-16-8-16-14 8 0 14 4 16 14z" fill="#0E8A5F"/>
      ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="50" cy="22" rx="13" ry="20" fill="#E8456B" transform="rotate(${a} 50 42)"/>`).join('')}<circle cx="50" cy="42" r="8" fill="#F2B705"/>` }] },
  { id: 'memorial', name: 'Memorial Day', tone: 'solemne', when: 'Último lunes de mayo', title: 'Memorial Day: en memoria de los caídos',
    dates: (y) => nthDay(y, 5, 1, -1), decos: [{ spot: 'side', svg: HALF_STAFF }] },
  { id: 'padres', name: 'Día de los Padres', tone: 'festivo', when: 'Tercer domingo de junio', title: '¡Feliz Día de los Padres!',
    dates: (y) => nthDay(y, 6, 0, 3),
    decos: [{ spot: 'side', svg: `<path d="M38 8h24l-4 14H42z" fill="#2B1185"/><path d="M42 22h16l12 52-20 20-20-20z" fill="#1F90DA"/><path d="M36 50l28-12M33 64l34-14M38 80l26-11" stroke="#fff" stroke-width="4" opacity=".55"/>` }] },
  { id: 'san-juan', name: 'Noche de San Juan', tone: 'festivo', when: '23 y 24 de junio', title: '¡Feliz Noche de San Juan! A tirarse de espaldas al mar',
    dates: (y) => [iso(y, 6, 23), iso(y, 6, 24)],
    decos: [{ spot: 'side', svg: `<circle cx="66" cy="30" r="16" fill="#F2B705"/><g stroke="#F2B705" stroke-width="4" stroke-linecap="round"><path d="M66 4v6M90 30h6M84 12l4-4M48 12l-4-4"/></g>
      <path d="M2 60c10-10 20-10 30 0s20 10 30 0 20-10 30 0 8 6 8 6v36H2z" fill="#1F90DA"/><path d="M2 76c10-8 20-8 30 0s20 8 30 0 20-8 30 0 8 4 8 4v24H2z" fill="#0E5BA8"/>` }] },
  { id: 'cuatro-julio', name: 'Cuatro de Julio', tone: 'festivo', when: '4 de julio', title: '¡Feliz Día de la Independencia de Estados Unidos!',
    dates: (y) => day(y, 7, 4),
    decos: [{ spot: 'side', svg: US_FLAG() }, { spot: 'sky', vb: '0 0 200 60', svg: BURST(40, 30, 22, '#B22234') + BURST(110, 26, 18, '#1F90DA') + BURST(175, 32, 20, '#B22234') }] },
  { id: 'constitucion', name: 'Día de la Constitución', tone: 'festivo', when: '25 de julio', title: 'Día de la Constitución del Estado Libre Asociado de Puerto Rico',
    dates: (y) => day(y, 7, 25), decos: [{ spot: 'side', svg: PR_FLAG }] },
  { id: 'clemente', name: 'Día de Roberto Clemente', tone: 'festivo', when: '18 de agosto (su natalicio)', title: 'Día de Roberto Clemente: ¡el orgullo de Carolina, el 21!',
    dates: (y) => day(y, 8, 18),
    decos: [{ spot: 'side', svg: JERSEY_21 }] },
  { id: '911', name: '11 de septiembre', tone: 'solemne', when: '11 de septiembre', title: '11 de septiembre: recordamos a las víctimas',
    dates: (y) => day(y, 9, 11), decos: [{ spot: 'side', svg: RIBBON() }] },
  { id: 'maria', name: 'Aniversario del huracán María', tone: 'solemne', when: '20 de septiembre', title: 'Huracán María (2017): recordamos a las víctimas',
    dates: (y) => day(y, 9, 20),
    decos: [{ spot: 'side', svg: RIBBON() + `<path d="M50 24l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="#fff"/>` }] },
  { id: 'lares', name: 'Grito de Lares', tone: 'festivo', when: '23 de septiembre', title: 'Grito de Lares (1868)',
    dates: (y) => day(y, 9, 23),
    decos: [{ spot: 'side', svg: `<rect x="6" y="20" width="4" height="74" rx="2" fill="#6B5B3E"/><g transform="translate(10 22)">
      <rect width="84" height="56" fill="#fff"/><rect width="36" height="22" fill="#0050A0"/><rect x="48" width="36" height="22" fill="#0050A0"/>
      <rect y="34" width="36" height="22" fill="#D7263D"/><rect x="48" y="34" width="36" height="22" fill="#D7263D"/>
      <path d="M18 3.5l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5-4.5 2.5 1-5-3.7-3.4 5-.6z" fill="#fff"/></g>` }] },
  { id: 'veteranos', name: 'Día del Veterano', tone: 'solemne', when: '11 de noviembre', title: 'Día del Veterano: gracias por su servicio',
    dates: (y) => day(y, 11, 11),
    decos: [{ spot: 'side', svg: `<path d="M34 6h32L58 40H42z" fill="#1F4E9E"/><path d="M42 6h4L44 40h-2zM54 6h4l-2 34h-2z" fill="#fff"/><path d="M48 6h4v34h-4z" fill="#D7263D"/>
      <circle cx="50" cy="66" r="26" fill="#F2B705" stroke="#B8860B" stroke-width="3"/><path d="M50 50l4.7 9.5 10.5 1.5-7.6 7.4 1.8 10.5L50 74l-9.4 5 1.8-10.5-7.6-7.4 10.5-1.5z" fill="#B8860B"/>` }] },
  { id: 'descubrimiento', name: 'Descubrimiento de Puerto Rico', tone: 'festivo', when: '19 de noviembre', title: 'Día del Descubrimiento de Puerto Rico',
    dates: (y) => day(y, 11, 19),
    decos: [{ spot: 'side', svg: CARABELA }] },
  { id: 'accion-gracias', name: 'Acción de Gracias', tone: 'festivo', when: 'Cuarto jueves de noviembre', title: '¡Feliz Día de Acción de Gracias! Que no falte el pavochón',
    dates: (y) => nthDay(y, 11, 4, 4),
    decos: [{ spot: 'side', svg: `${['#C2410C', '#E0A100', '#D7263D', '#E0A100', '#C2410C'].map((c, i) => `<ellipse cx="50" cy="24" rx="11" ry="24" fill="${c}" transform="rotate(${-60 + i * 30} 50 56)"/>`).join('')}
      <ellipse cx="50" cy="64" rx="24" ry="22" fill="#7A4A21"/><circle cx="50" cy="40" r="12" fill="#8B5A2B"/><circle cx="46" cy="37" r="2.4" fill="#16161D"/><circle cx="54" cy="37" r="2.4" fill="#16161D"/>
      <path d="M47 43l3 6 3-6z" fill="#F2B705"/><path d="M53 46c3 2 3 7 0 9" stroke="#D7263D" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M42 86v8M58 86v8" stroke="#E0A100" stroke-width="4" stroke-linecap="round"/>` }] },
  { id: 'navidad', name: 'Navidad', tone: 'festivo', when: '15 al 30 de diciembre', title: '¡Felices Pascuas y Feliz Navidad!',
    dates: (y) => [iso(y, 12, 15), iso(y, 12, 30)], decos: [{ spot: 'top', svg: HAT }] },
];

/** The holiday for a given day (YYYY-MM-DD), if any. Checks this year and next (Año Nuevo starts the year before). */
export function holidayOn(d: string): Holiday | undefined {
  const y = Number(d.slice(0, 4));
  return HOLIDAYS.find((h) => [y, y + 1].some((yy) => { const [a, b] = h.dates(yy); return d >= a && d <= b; }));
}
export const todayPR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' });
