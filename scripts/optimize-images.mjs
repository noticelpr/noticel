// Lighter copies of the site's photos and logos for phones and thumbnails.
// Photos: every public/images/<name>.jpg|jpeg|png gets public/images/opt/<name>-480.webp and -960.webp (Ph.astro, srcset).
// Logos: every public/logos/**/<name>.svg|png over 20 KB gets public/logos/opt/<same path>.webp, at most 192px
// (badges show at 26-84px; LeagueBadge.astro and TeamLogo.astro use it when it exists).
// Files are skipped when the copy is already newer than the original.
// Runs before every build (package.json "build"); also safe to run by hand: node scripts/optimize-images.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'public/images';
const OUT = path.join(SRC, 'opt');
export const WIDTHS = [480, 960];

fs.mkdirSync(OUT, { recursive: true });
let made = 0;
for (const file of fs.readdirSync(SRC)) {
  if (!/\.(jpe?g|png)$/i.test(file)) continue;
  const src = path.join(SRC, file);
  const name = file.replace(/\.[^.]+$/, '');
  const changed = fs.statSync(src).mtimeMs;
  for (const w of WIDTHS) {
    const out = path.join(OUT, `${name}-${w}.webp`);
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= changed) continue;
    await sharp(src).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toFile(out);
    made++;
  }
}

// Logos (league and team badges)
const LOGOS = 'public/logos';
const LOGO_OUT = path.join(LOGOS, 'opt');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (path.join(dir, e.name) === LOGO_OUT ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]);
for (const src of walk(LOGOS)) {
  if (!/\.(svg|png)$/i.test(src) || fs.statSync(src).size < 20 * 1024) continue;
  const out = path.join(LOGO_OUT, path.relative(LOGOS, src).replace(/\.[^.]+$/, '.webp'));
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) continue;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(src, { density: 300 }).resize({ width: 192, height: 192, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85, alphaQuality: 100 }).toFile(out);
  made++;
}
console.log(`optimize-images: ${made} new file(s)`);
