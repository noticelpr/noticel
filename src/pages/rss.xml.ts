import type { APIContext } from 'astro';
import { getStories, section, url, SITE , storyUrl } from '../lib/site';

// RSS feed. Useful for Google News, newsletter tools, and social media schedulers
// (Buffer, Zapier, Make, etc. can post new stories automatically from this feed).
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export async function GET(context: APIContext) {
  const site = context.site!;
  const stories = (await getStories()).slice(0, 50);
  const items = stories
    .map((s) => {
      const link = new URL(storyUrl(s), site).toString();
      return `<item><title>${esc(s.data.title)}</title><link>${link}</link><guid>${link}</guid><description>${esc(s.data.description)}</description><category>${esc(section(s.data.section).name)}</category><pubDate>${s.data.date.toUTCString()}</pubDate></item>`;
    })
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(SITE.name)}</title><link>${new URL(url(), site)}</link><description>${esc(SITE.tagline)}</description><language>es-pr</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
