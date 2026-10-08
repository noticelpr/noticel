import { getStories, mainCategory, CATEGORIES, url } from '../lib/site';

// For the photo library (panel → Fotos): the photos already used in published stories, with their captions and
// credits, so they can be found and reused. Everything here is already public on the site. (Same as Noticias Xtra.)
export async function GET() {
  const stories = await getStories();
  const abs = (src: string) => (/^https?:/.test(src) ? src : url(src.replace(/^\//, '')));
  const seen = new Set<string>();
  const photos = stories.filter((s) => s.data.image).map((s) => ({
    src: abs(s.data.image!), caption: s.data.imageCaption ?? '', credit: s.data.imageCredit ?? '', creditUrl: s.data.imageCreditUrl ?? '',
    story: s.data.title, storyUrl: url(s.data.path), section: CATEGORIES[mainCategory(s)] ?? '', date: s.data.date.toISOString(),
  })).filter((p) => !seen.has(p.src) && seen.add(p.src));
  return new Response(JSON.stringify(photos), { headers: { 'Content-Type': 'application/json' } });
}
