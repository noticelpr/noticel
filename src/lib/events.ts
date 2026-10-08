/* Upcoming entertainment events (src/data/eventos.json).
   Each event links to the story it came from; only facts published in that story.
   "date" is "YYYY-MM-DD", or "YYYY-MM" when only the month is known.
   Past events drop off automatically on the next build (the site rebuilds every hour). */
import data from '../data/eventos.json';

export type EventItem = {
  title: string;
  kind: string; // "Concierto", "Desfile", "Teatro"...
  date: string;
  time?: string; // "8:00 p.m."
  venue: string;
  city: string;
  tickets?: string; // where tickets are sold, e.g. "Ticketera"
  ticketsUrl?: string;
  story?: string; // id of the story in src/content/noticias
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const parts = (d: string) => { const [y, m, day] = d.split('-').map(Number); return { y, m, day }; };
// Last moment the event can still be upcoming (end of the day, or of the month)
const endOf = (d: string) => { const { y, m, day } = parts(d); return day ? Date.UTC(y, m - 1, day + 1, 4) : Date.UTC(y, m, 1, 4); };

export function upcomingEvents(now = Date.now()): EventItem[] {
  return (data as EventItem[]).filter((e) => endOf(e.date) > now).sort((a, b) => endOf(a.date) - endOf(b.date));
}

/** Short pieces for the date tile: { top: "OCT", big: "24", year: "2026" } */
export function dateTile(d: string) {
  const { y, m, day } = parts(d);
  return { top: MONTHS[m - 1].toUpperCase(), big: day ? String(day) : MONTHS[m - 1].toUpperCase(), year: String(y), exact: !!day };
}

/** "sábado, 24 de octubre de 2026" or "enero de 2028" */
export function dateLong(d: string) {
  const { y, m, day } = parts(d);
  if (!day) return `${MONTHS_LONG[m - 1]} de ${y}`;
  return new Date(Date.UTC(y, m - 1, day, 16)).toLocaleDateString('es-PR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Puerto_Rico' });
}

/** Google Calendar "add event" link (all-day), only for exact dates */
export function calendarLink(e: EventItem) {
  const { y, m, day } = parts(e.date);
  if (!day) return undefined;
  const f = (dt: Date) => dt.toISOString().slice(0, 10).replace(/-/g, '');
  const start = new Date(Date.UTC(y, m - 1, day));
  const end = new Date(Date.UTC(y, m - 1, day + 1));
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${f(start)}/${f(end)}`, location: `${e.venue}, ${e.city}` });
  return `https://calendar.google.com/calendar/render?${q}`;
}
