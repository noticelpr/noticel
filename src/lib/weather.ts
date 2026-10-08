// Live conditions at San Juan airport (TJSJ) from the National Weather Service, read in the reader's browser.
// Used by the "Clima" box (right column) and the small chip at the end of the section bar; one request per page.

export const WEATHER_URL = 'https://api.weather.gov/stations/TJSJ/observations?limit=6';

const SKY: Record<string, string> = {
  clear: 'Despejado', sunny: 'Soleado', 'mostly sunny': 'Mayormente soleado', 'partly sunny': 'Parcialmente soleado',
  'mostly clear': 'Mayormente despejado', 'partly cloudy': 'Parcialmente nublado', 'mostly cloudy': 'Mayormente nublado',
  cloudy: 'Nublado', overcast: 'Cubierto', fair: 'Despejado', rain: 'Lluvia', 'light rain': 'Lluvia ligera',
  showers: 'Aguaceros', 'light showers': 'Aguaceros ligeros', thunderstorm: 'Tormenta eléctrica', fog: 'Neblina', haze: 'Bruma',
};
// Small drawn icons (emoji look different, or are missing, on some devices)
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const CLOUD = '<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/>';
const PARTLY = '<path d="M8 3v1.5M3.5 8H2M4.6 4.6l1 1M11.4 4.6l-1 1"/><path d="M5.3 10.5A3.5 3.5 0 0 1 11 6.6"/><path d="M9 20h8a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A2.9 2.9 0 0 0 9 20z"/>';
const LOW = '<path d="M7 15h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 15z"/>';
const RAIN = LOW + '<path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>';
const STORM = LOW + '<path d="M12.5 16l-2 3.5h3l-2 3.5"/>';
/** The icon for an NWS description, as an SVG `size` pixels wide. */
export const weatherIcon = (d: string, size = 30) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${/thunder/i.test(d) ? STORM : /rain|shower|drizzle/i.test(d) ? RAIN : /partly|mostly sunny|mostly clear/i.test(d) ? PARTLY : /overcast|cloudy|fog|haze/i.test(d) ? CLOUD : SUN}</svg>`;

export type Weather = { temp: string; feels: string; sky: string; desc: string };
const F = (c: number) => `${Math.round((c * 9) / 5 + 32)}°`;
let once: Promise<Weather | null> | null = null;
/** Current San Juan weather (°F), or null when the weather service doesn't answer. */
export function getWeather(): Promise<Weather | null> {
  return (once ??= (async () => {
    try {
      // Recent readings, newest first; stations sometimes skip a value, so use the newest complete one
      const list = (await (await fetch(WEATHER_URL, { headers: { Accept: 'application/geo+json' } })).json()).features ?? [];
      const p = list.map((f: { properties: any }) => f.properties).find((x: any) => typeof x?.temperature?.value === 'number');
      if (!p) return null;
      const c = p.temperature.value, desc = String(p.textDescription || '');
      return { temp: F(c), feels: F(typeof p.heatIndex?.value === 'number' ? p.heatIndex.value : c), sky: SKY[desc.toLowerCase()] ?? '', desc };
    } catch { return null; }
  })());
}
