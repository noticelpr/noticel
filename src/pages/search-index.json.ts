import { getStories, section, url , storyUrl } from '../lib/site';

// A small list of all stories that the search page loads in the browser.
export async function GET() {
  const stories = await getStories();
  const items = stories.map((s) => ({
    url: storyUrl(s),
    title: s.data.title,
    description: s.data.description,
    section: section(s.data.section).name,
    place: s.data.place,
    date: s.data.date.toISOString(),
    text: (s.body ?? '').slice(0, 1500),
  }));
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
}
