// noticel.com's approved comments (public wp-json/wp/v2/comments, 196 on 2026-11-15) → supabase/comentarios-noticel.sql,
// a script the owner runs once in Supabase. Each comment goes under its story (the same story id the site's comment
// box uses: wp-<id> for stories from the export, wpa-<id> for the rest), with the commenter's NAME and date only
// (emails aren't public and aren't copied); replies stay under their parent. Usage: node scripts/comments-wp.mjs
import { writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { wp, SITE } from './wp-lib.mjs';

const all = [];
for (let page = 1, pages = 1; page <= pages; page++) {
  const r = await wp(`comments?per_page=100&page=${page}&orderby=id&order=asc&_fields=id,post,parent,author_name,date_gmt,content,link`);
  pages = r.pages; all.push(...r.data);
}
// The same id every time (so running the script again doesn't duplicate anything), and replies can point to parents
const uuid = (n) => { const h = createHash('sha1').update(`noticel-comment-${n}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const decode = (s = '') => s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;|&#8216;/g, "'").replace(/&#8220;|&#8221;/g, '"').replace(/&#8230;|&hellip;/g, '…').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const storyId = (post) => (existsSync(`src/content/noticias/wp-${post}.md`) ? `wp-${post}` : `wpa-${post}`);
// Same rules as the new site's comments: no links or email addresses (spam, and private data), no generic English spam
const SPAM = /https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.]+|\b(very interesting news|great (post|article)|nice (post|article)|thanks for sharing)\b/i;
const skipped = all.filter((c) => SPAM.test(decode(c.content?.rendered)));
all.splice(0, all.length, ...all.filter((c) => !skipped.includes(c)));
const known = new Set(all.map((c) => c.id));
const rows = all.sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0) || a.id - b.id).map((c) => {
  const path = new URL(c.link, SITE).pathname;
  return `(${q(uuid(c.id))}, ${q(storyId(c.post))}, ${q(path)}, ${c.parent && known.has(c.parent) ? q(uuid(c.parent)) : 'null'}, ${q(decode(c.content?.rendered))}, ${q(c.author_name || 'Lector')}, ${q(`${c.date_gmt}Z`)})`;
});
const sql = `-- NotiCel · the ${all.length} approved comments from noticel.com (made by scripts/comments-wp.mjs on ${new Date().toISOString().slice(0, 10)}).
-- Run ONCE in Supabase → SQL Editor (safe to run again: nothing is duplicated). Each comment keeps the commenter's
-- name and its date; emails aren't public and weren't copied. Old comments have no account on the new site.
begin;
alter table comments add column if not exists legacy_author text; -- the commenter's name on noticel.com (old comments only)
alter table comments alter column user_id drop not null;            -- old comments belong to no account
alter table comments drop constraint if exists comments_body_check;
alter table comments add constraint comments_body_check check (char_length(body) <= 500 or legacy_author is not null);
-- Only during the import: no spam check, no notifications, no points (these comments are years old)
alter table comments disable trigger user;
insert into comments (id, story, url, parent, body, legacy_author, created_at) values
${rows.join(',\n')}
on conflict (id) do nothing;
alter table comments enable trigger user;
commit;
`;
writeFileSync('supabase/comentarios-noticel.sql', sql);
console.log(`${skipped.length} skipped as spam; ${all.length} comments (${all.filter((c) => c.parent).length} replies) on ${new Set(all.map((c) => c.post)).size} stories → supabase/comentarios-noticel.sql`);
