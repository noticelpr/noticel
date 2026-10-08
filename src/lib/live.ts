// Live YouTube helpers (checked when the site builds, every 15 minutes): is a channel live right now?
// "Live" means a running stream, not a scheduled "waiting room" or an ended stream.
export type LiveNow = { id: string; title: string } | null;
const unescape = (t: string) => t.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");

export function checkLive(channel: string): Promise<LiveNow> {
  // One check per channel per build, shared by every page that asks
  const g = globalThis as any;
  g.__nxLive ??= new Map<string, Promise<LiveNow>>();
  if (!g.__nxLive.has(channel)) {
    g.__nxLive.set(channel, (async () => {
      try {
        const html = await (await fetch(`https://www.youtube.com/channel/${channel}/live`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es' }, signal: AbortSignal.timeout(10000) })).text();
        const id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
        const running = /"isLive":true/.test(html) && !/"status":"LIVE_STREAM_OFFLINE"/.test(html) && !/"isUpcoming":true/.test(html);
        return id && running ? { id, title: unescape(html.match(/<meta name="title" content="([^"]*)"/)?.[1] ?? '') } : null;
      } catch { return null; }
    })());
  }
  return g.__nxLive.get(channel);
}

const PARAMS = 'autoplay=1&mute=1&rel=0&playsinline=1';
/** Embed address: the live stream when live, otherwise the channel's newest uploads. */
export const embedFor = (channel: string, live: LiveNow, autoplay = true) =>
  live ? `https://www.youtube-nocookie.com/embed/${live.id}?${autoplay ? PARAMS : 'rel=0&playsinline=1'}`
    : `https://www.youtube-nocookie.com/embed/videoseries?list=UU${channel.slice(2)}&${autoplay ? PARAMS : 'rel=0&playsinline=1'}`;
