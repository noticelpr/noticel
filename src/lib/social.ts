// Social posts made from a story: the Instagram image (photo + headline + logo, drawn in the browser), the captions,
// and the X "compose" link. Posting to Instagram and Facebook happens in the Edge Function "redes".

export type SocialStory = { title: string; description: string; section: string; sectionName: string; photo: string; credit: string; url: string };

const W = 1080, H = 1350; // Instagram portrait, the size it shows largest in the feed
const BLUE = '#009DE9', GREEN = '#92D000'; // NotiCel colors (black background, blue and green accents)

const load = (src: string) => new Promise<HTMLImageElement | null>((ok) => {
  if (!src) return ok(null);
  const im = new Image(); im.crossOrigin = 'anonymous';
  im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src;
});

/** Splits the headline into lines that fit `max` pixels wide at the current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** Draws the Instagram card on `canvas` (1080×1350). Returns false when the photo couldn't be used (a brand background is drawn instead). */
export async function drawInstagram(canvas: HTMLCanvasElement, s: SocialStory, logoSrc: string): Promise<boolean> {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  await Promise.all([document.fonts?.load('800 64px "Barlow Condensed"'), document.fonts?.load('700 30px "Barlow Condensed"')].filter(Boolean)).catch(() => null);
  const [photo, logo] = await Promise.all([load(s.photo), load(logoSrc)]);

  // Background: the photo, cropped to fill; without one, the brand gradient
  const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, BLUE); bg.addColorStop(1, '#000000');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (photo) {
    const area = H * 0.72, r = Math.max(W / photo.width, area / photo.height);
    const w = photo.width * r, h = photo.height * r;
    ctx.drawImage(photo, (W - w) / 2, (area - h) / 2, w, h);
  }
  // Fade into the black panel where the headline sits
  const fade = ctx.createLinearGradient(0, H * 0.42, 0, H * 0.74);
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade; ctx.fillRect(0, H * 0.42, W, H * 0.32);
  ctx.fillStyle = '#000000'; ctx.fillRect(0, H * 0.74, W, H * 0.26);

  // Headline: as big as fits in five lines
  const pad = 64, maxW = W - pad * 2, bottom = H - 150;
  let size = 76, lines: string[] = [];
  for (; size >= 44; size -= 4) {
    ctx.font = `800 ${size}px "Barlow Condensed", sans-serif`;
    lines = wrap(ctx, s.title, maxW);
    if (lines.length <= 5) break;
  }
  if (lines.length > 5) { lines = lines.slice(0, 5); lines[4] = lines[4].replace(/\s*\S*$/, '…'); }
  const lh = size * 1.12, top = bottom - lines.length * lh;
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, pad, top + i * lh));

  // Section label above the headline
  ctx.font = '700 30px "Barlow Condensed", sans-serif';
  const label = s.sectionName.toUpperCase(), lw = ctx.measureText(label).width + 40;
  ctx.fillStyle = GREEN; roundRect(ctx, pad, top - 74, lw, 50, 25); ctx.fill();
  ctx.fillStyle = '#000'; ctx.textBaseline = 'middle'; ctx.fillText(label, pad + 20, top - 49);

  // Logo, and the photo credit in small print
  if (logo) { const lh2 = 64, lw2 = (logo.width / logo.height) * lh2; ctx.drawImage(logo, pad, H - 108, lw2, lh2); }
  if (s.credit) {
    ctx.font = '400 22px Barlow, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    const cr = s.credit.replace(/,? ?vía Wikimedia Commons/i, ''); ctx.fillText(cr.length > 60 ? `${cr.slice(0, 59)}…` : cr, W - pad, H - 52); ctx.textAlign = 'left';
  }
  return !!photo;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const tag = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '');
/** Instagram caption: headline, summary, where to read it, photo credit and a few hashtags. */
export const instagramCaption = (s: SocialStory) =>
  `${s.title}\n\n${s.description}\n\n📲 Lee la noticia completa: enlace en la bio.${s.credit ? `\n\n📷 ${s.credit}` : ''}\n\n#NotiCel #PuertoRico #${tag(s.sectionName)}`.slice(0, 2200);
/** Facebook: the summary as the post text; Facebook adds the photo, headline and link preview from the story page. */
export const facebookMessage = (s: SocialStory) => s.description;
/** X: opens the composer with the headline and link already written (the person taps "Post"). */
export const xComposeUrl = (s: SocialStory) => `https://x.com/intent/post?text=${encodeURIComponent(s.title)}&url=${encodeURIComponent(s.url)}`;
