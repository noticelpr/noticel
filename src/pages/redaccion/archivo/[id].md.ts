// Each story's file as it is (/redaccion/archivo/<id>.md), so the staff panel can open a story that is already on the
// site in Escribir ("Editar o corregir") while NotiCel's GitHub repository doesn't exist yet (src/lib/repo.ts).
import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { getStories, type Story } from '../../../lib/site';

export async function getStaticPaths() {
  return (await getStories()).map((story) => ({ params: { id: story.id }, props: { story } }));
}

export const GET: APIRoute = ({ props }) => {
  const { story } = props as { story: Story };
  return new Response(readFileSync(story.filePath!, 'utf8'), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
