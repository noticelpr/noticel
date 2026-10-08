/* =========================================================
   Red bar at the top of every page. Chosen at build time (the site rebuilds every hour):
   1. SITE.breaking, if an editor set one by hand            -> "ÚLTIMA HORA"
   2. A story marked `breaking: true` from the last 12 hours -> "ÚLTIMA HORA"
   3. Our story from the last 48 hours that best matches what
      people in Puerto Rico are searching on Google right now -> "TENDENCIA"
   4. Our newest story from the last 24 hours                -> "LO ÚLTIMO"
   The bar only ever links to our own stories, never to outside content.
   ========================================================= */
import { SITE, getStories, storyUrl, type Story } from './site';

export type Breaking = { label: string; text: string; id: string; href: string } | null;

const TRENDS_URL = 'https://trends.google.com/trending/rss?geo=PR';
const HOUR = 36e5;

// Common Spanish/English words that should not count as a match
const STOP = new Set(
  'para pero como sobre entre desde hasta este esta estos estas tras cuando donde porque puede pueden tiene tienen sera seran fueron habia hacia ante bajo segun durante mientras todos todas otro otra otros otras mismo misma ahora tambien despues antes hacer dijo dice the and with from that this will have after over into about their what when'.split(' '),
);

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ');
const words = (s: string, min: number) => norm(s).split(/\s+/).filter((w) => w.length >= min && !STOP.has(w));

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"');
const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? '';

type Trend = { term: string; traffic: number; headlines: string[] };

async function getTrends(): Promise<Trend[]> {
  try {
    const res = await fetch(TRENDS_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const xml = await res.text();
    return (xml.match(/<item>[\s\S]*?<\/item>/gi) ?? []).map((b) => ({
      term: decode(tag(b, 'title')),
      traffic: Number(tag(b, 'ht:approx_traffic').replace(/\D/g, '')) || 0,
      headlines: [...b.matchAll(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/gi)].map((m) => decode(m[1])),
    }));
  } catch {
    return []; // offline or Google changed the feed: fall back to the newest story
  }
}

/** How strongly one of our stories matches a trending search (0 = no match). */
function score(story: Story, t: Trend): number {
  const text = new Set(words(`${story.data.title} ${story.data.description}`, 3));
  const term = words(t.term, 3);
  // Every word of the search term appears in our story: strong match
  if (term.length && term.every((w) => text.has(w))) return t.traffic * 2 + 1;
  // Otherwise: our story shares several important words with the headlines people are reading
  const shared = new Set(words(t.headlines.join(' '), 5).filter((w) => text.has(w)));
  return shared.size >= 3 ? t.traffic + shared.size : 0;
}

async function pick(): Promise<Breaking> {
  const now = Date.now();
  const stories = await getStories(); // newest first
  if (SITE.breaking) {
    const s = stories.find((x) => x.id === SITE.breaking!.id);
    return { label: 'ÚLTIMA HORA', ...SITE.breaking, href: s ? storyUrl(s) : '' };
  }
  const within = (h: number) => stories.filter((s) => s.data.section !== 'opiniones' && now - s.data.date.valueOf() < h * HOUR);
  const bar = (label: string, s: Story) => ({ label, text: s.data.title, id: s.id, href: storyUrl(s) });

  const urgent = within(12).find((s) => s.data.breaking);
  if (urgent) return bar('ÚLTIMA HORA', urgent);

  const recent = within(48);
  if (recent.length) {
    let best: { s: Story; n: number } | undefined;
    for (const t of await getTrends()) {
      for (const s of recent) {
        const n = score(s, t);
        if (n > (best?.n ?? 0)) best = { s, n };
      }
    }
    if (best) return bar('TENDENCIA', best.s);
  }

  const latest = within(24)[0];
  if (latest) return bar('LO ÚLTIMO', latest);
  // NotiCel: while the test copy only has older imported stories, show the newest one instead of no bar
  const newest = stories.find((s) => s.data.section !== 'opiniones');
  return newest ? bar('LO ÚLTIMO', newest) : null;
}

let cached: Promise<Breaking> | undefined;
/** Same result for every page in one build (Google is asked only once). */
export const getBreaking = () => (cached ??= pick());
