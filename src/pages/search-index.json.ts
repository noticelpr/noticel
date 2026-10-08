import { getStories, kicker, url } from '../lib/site';

// A small list of all stories that the search page loads in the browser (same as Noticias Xtra).
// The full archive (~228,900 stories) will be searched in Supabase instead, once it is copied there.
export async function GET() {
  const stories = await getStories();
  const items = stories.map((s) => ({
    url: url(s.data.path),
    title: s.data.title,
    description: s.data.description,
    section: kicker(s)?.name ?? '',
    author: s.data.author,
    date: s.data.date.toISOString(),
    image: s.data.image ?? '',
    tags: s.data.tags,
    text: (s.body ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500),
  }));
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
}
