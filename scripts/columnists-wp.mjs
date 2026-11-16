// Columnists from noticel.com (2026-11-16): everyone who wrote an Opinión column since 2025, with their job title and
// bio (their noticel.com author page), their photo (their WordPress profile picture, on cdn.noticel.com) and the videos
// inside their columns (YouTube, Facebook, Vimeo). Writes supabase/columnistas-noticel.sql for the owner to run once
// (it adds or updates the profiles in panel → Columnistas; it never deletes one). Usage: node scripts/columnists-wp.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { wp, SITE } from './wp-lib.mjs';

const users = (await wp('users?per_page=100&_fields=id,name,slug,description,avatar_urls')).data;
const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&#8217;|&#039;|&#39;/g, '’').replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim();
// Opinión columns since 2025 (the built stories and the archive copy), with their authors and bodies
const cols = [];
for (const f of readdirSync('src/content/noticias').filter((x) => x.endsWith('.md'))) {
  const t = readFileSync(join('src/content/noticias', f), 'utf8');
  if (!/^categories: .*"opiniones"/m.test(t)) continue;
  cols.push({ author: JSON.parse(t.match(/^author: (.+)$/m)?.[1] ?? '"NotiCel"'), date: t.match(/^date: "?([^"\n]+)/m)?.[1] ?? '', body: t.split(/^---$/m).slice(2).join('---'), path: JSON.parse(t.match(/^path: (.+)$/m)?.[1] ?? '""') });
}
const byAuthor = new Map();
for (const c of cols) { if (c.author === 'NotiCel' || c.date < '2025') continue; (byAuthor.get(c.author) ?? byAuthor.set(c.author, []).get(c.author)).push(c); }
// Videos inside a column: YouTube (any address form), Facebook and Vimeo players
const videosIn = (html) => {
  const out = new Set();
  for (const m of html.matchAll(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g)) out.add(`https://www.youtube.com/watch?v=${m[1]}`);
  for (const m of html.matchAll(/https?:\/\/(?:www\.)?facebook\.com\/[^"'\s<]+\/videos\/[^"'\s<]+/g)) out.add(m[0]);
  for (const m of html.matchAll(/player\.vimeo\.com\/video\/(\d+)/g)) out.add(`https://vimeo.com/${m[1]}`);
  return [...out];
};
const plainName = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(lcdo|lcda|lic|dr|dra)\.?\s+/, '').replace(/[^a-z ]/g, '').trim();
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const photoOf = (u) => { const a = u?.avatar_urls?.['96'] ?? ''; const m = a.match(/s3useast2:\/\/(?:cdn\.noticel\.com|noticel-production-uploads)\/(.+)$/); return m ? `https://cdn.noticel.com/${m[1]}` : ''; };
const out = [];
for (const [author, list] of byAuthor) {
  const u = users.find((x) => plainName(x.name) === plainName(author));
  let role = 'Columnista', bio = decode(u?.description ?? '');
  if (u) {
    const html = await fetch(`${SITE}/author/${u.slug}/`, { headers: { 'User-Agent': 'NotiCel archive copy (new NotiCel site)' } }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
    const t = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n').split('\n').map((l) => decode(l)).filter(Boolean);
    const i = t.findIndex((l, k) => k > 40 && plainName(l) === plainName(u.name));
    if (i > 0 && t[i + 1] && t[i + 1] !== 'Fondo' && t[i + 1].length < 90) role = t[i + 1];
    const f = t.indexOf('Fondo', i > 0 ? i : 0);
    if (f > 0 && t[f + 1] && !/^Últimos artículos$/.test(t[f + 1])) bio = t[f + 1];
    await new Promise((ok) => setTimeout(ok, 500));
  }
  const videos = [...new Set(list.sort((a, b) => b.date.localeCompare(a.date)).flatMap((c) => videosIn(c.body)))].slice(0, 12);
  out.push({ slug: slugify(author.replace(/^(Lcdo|Lcda|Lic)\.?\s+/i, '')), name: author, role, bio, photo: photoOf(u), videos, columns: list.length, last: list[0].date });
}
out.sort((a, b) => b.last.localeCompare(a.last));
writeFileSync('archive/columnistas-noticel.json', JSON.stringify(out, null, 1));
for (const c of out) console.log(`${c.name} | ${c.role} | bio ${c.bio.length} chars | photo ${c.photo ? 'yes' : 'NO'} | ${c.videos.length} videos | ${c.columns} columns`);

// ---- supabase/columnistas-noticel.sql: adds the missing columnists and fills EMPTY fields only (never overwrites the panel)
const seed = ['Luisito Vigoreaux', 'Lcdo. Ramón Alejandro Pabón', 'Carlos Salgado', 'Enid M. Gavilán', 'Heriberto N. Saurí', 'Lcda. Lisoannette González', 'Lcdo Josué Cardona Hernández', 'Carlos Narvaez', 'Lcdo. Walter Pérez'];
const merged = new Map(); // one profile per person ("Walter Pérez" = "Lcdo. Walter Pérez")
for (const c of out) {
  const known = seed.find((n) => plainName(n) === plainName(c.name));
  const name = known ?? c.name, slug = known ? slugify(known) : slugify(c.name);
  const m = merged.get(slug) ?? { slug, name, role: 'Columnista', bio: '', photo: '', videos: [] };
  if (c.role && c.role !== 'Últimos artículos' && m.role === 'Columnista') m.role = c.role;
  m.bio ||= c.bio; m.photo ||= c.photo; m.videos = [...new Set([...m.videos, ...c.videos])];
  merged.set(slug, m);
}
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const rowsSql = [...merged.values()].map((m, i) => `(${q(m.slug)}, ${q(m.name)}, ${q(m.role)}, ${m.bio ? q(m.bio) : 'null'}, ${m.photo ? q(m.photo) : 'null'}, ${q(JSON.stringify(m.videos))}::jsonb, true, ${seed.some((n) => slugify(n) === m.slug) ? seed.findIndex((n) => slugify(n) === m.slug) + 1 : 10 + i})`);
writeFileSync('supabase/columnistas-noticel.sql', `-- NotiCel · columnists from noticel.com (made by scripts/columnists-wp.mjs on ${new Date().toISOString().slice(0, 10)}).
-- Run ONCE in Supabase → SQL Editor (safe to run again). Adds the columnists who write on noticel.com and are missing,
-- and fills each profile's EMPTY fields with noticel.com's own: job title, bio (their author page), photo (their
-- WordPress picture, on cdn.noticel.com) and the videos in their columns. Anything already written in the panel stays.
alter table columnists add column if not exists videos jsonb not null default '[]';
insert into columnists (slug, name, role, bio, photo, videos, active, sort) values
${rowsSql.join(',\n')}
on conflict (slug) do update set
  role = case when coalesce(columnists.role, '') in ('', 'Columnista') then excluded.role else columnists.role end,
  bio = coalesce(nullif(columnists.bio, ''), excluded.bio),
  photo = coalesce(nullif(columnists.photo, ''), excluded.photo),
  videos = case when columnists.videos is null or columnists.videos = '[]'::jsonb then excluded.videos else columnists.videos end;
`);
console.log(`supabase/columnistas-noticel.sql: ${merged.size} profiles`);
