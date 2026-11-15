// Draws a simple, clean ad on a <canvas> from the client's text, logo and colors.
// Used by the Anúnciate page (live preview when we create the ad) and the approval page
// (the employee adjusts it and downloads the PNG). Runs in the browser only.

export type AdText = { title: string; msg: string; cta: string; business: string };
export type AdTheme = { id: string; name: string; a: string; b: string; fg: string; btn: string; btnFg: string };
/** Extra options (panel → Anuncios → Crear anuncio): a photo behind the text, an offer tag, a phone/web line, the
 *  font style and the text alignment. All optional, so the client's own "Créenlo por mí" ads look as before. */
export type AdExtra = { photo?: HTMLImageElement | null; dim?: number; badge?: string; contact?: string; font?: 'moderna' | 'clasica' | 'fuerte'; align?: 'center' | 'left' };
export const FONTS = [{ id: 'moderna', name: 'Moderna' }, { id: 'clasica', name: 'Clásica' }, { id: 'fuerte', name: 'Fuerte' }] as const;

export const THEMES: AdTheme[] = [
  { id: 'morado', name: 'NotiCel', a: '#000000', b: '#007BB6', fg: '#FFFFFF', btn: '#92D000', btnFg: '#000000' }, // id kept so saved ads still match
  { id: 'rojo', name: 'Rojo', a: '#B3122A', b: '#F28C28', fg: '#FFFFFF', btn: '#FFFFFF', btnFg: '#B3122A' },
  { id: 'verde', name: 'Verde', a: '#0E5A37', b: '#1B8A5A', fg: '#FFFFFF', btn: '#FFE27A', btnFg: '#0E3D27' },
  { id: 'cafe', name: 'Café', a: '#5B3A1E', b: '#B45309', fg: '#FFF8EC', btn: '#FFF8EC', btnFg: '#5B3A1E' },
  { id: 'negro', name: 'Negro', a: '#111827', b: '#374151', fg: '#FFFFFF', btn: '#D7263D', btnFg: '#FFFFFF' },
  { id: 'claro', name: 'Claro', a: '#FFFFFF', b: '#E6F5FD', fg: '#000000', btn: '#007BB6', btnFg: '#FFFFFF' },
];

// Break text into lines that fit `maxW`, shrinking the font until it fits `maxLines`
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number, min: number, maxW: number, maxLines: number) {
  for (let px = start; px >= min; px--) {
    ctx.font = font(px);
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxW || !line) line = test; else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) return { px, lines };
    if (px === min) return { px, lines: lines.slice(0, maxLines) };
  }
  return { px: min, lines: [text] };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Draws the ad at its real size (w × h); the canvas is scaled for sharp screens. */
export function drawAd(canvas: HTMLCanvasElement, w: number, h: number, t: AdText, theme: AdTheme, logo?: HTMLImageElement | null, scale = 2, x: AdExtra = {}) {
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, theme.a); g.addColorStop(1, theme.b);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (x.photo) {
    // Photo behind the text, covering the space, darkened so the words stay readable
    const iw = x.photo.naturalWidth || x.photo.width, ih = x.photo.naturalHeight || x.photo.height, k = Math.max(w / iw, h / ih);
    ctx.drawImage(x.photo, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k);
    ctx.fillStyle = `rgba(0,0,0,${x.dim ?? 0.45})`; ctx.fillRect(0, 0, w, h);
  }
  ctx.textBaseline = 'top';
  const head = (px: number) => x.font === 'clasica' ? `700 ${px}px Georgia, "Times New Roman", serif` : x.font === 'fuerte' ? `900 ${px}px "Arial Black", Impact, system-ui, sans-serif` : `800 ${px}px Poppins, system-ui, sans-serif`;
  const body = (px: number) => x.font === 'clasica' ? `400 ${px}px Georgia, serif` : `500 ${px}px "Noto Sans", system-ui, sans-serif`;
  const title = t.title.trim() || t.business.trim() || 'Tu negocio';
  const contact = (x.contact ?? '').trim();
  const msg = [t.msg.trim(), w / h > 2.5 ? contact : ''].filter(Boolean).join(' · '); const cta = t.cta.trim();
  const left = x.align === 'left';
  const wide = w / h > 2.5;
  const pad = Math.round(Math.min(w, h) * (wide ? 0.12 : 0.07));

  const button = (x: number, y: number, maxW: number, px: number) => {
    if (!cta) return { w: 0, h: 0 };
    ctx.font = head(px);
    const bw = Math.min(maxW, ctx.measureText(cta).width + px * 1.6), bh = px * 2;
    roundRect(ctx, x, y, bw, bh, bh / 2); ctx.fillStyle = theme.btn; ctx.fill();
    ctx.fillStyle = theme.btnFg; ctx.textAlign = 'center'; ctx.fillText(cta, x + bw / 2, y + px * 0.45, bw - px); ctx.textAlign = 'left';
    return { w: bw, h: bh };
  };

  if (wide) {
    // Horizontal banner: logo | title + message | button
    let x = pad;
    const lh = h - pad * 2;
    if (logo) { const lw = Math.min(lh * (logo.width / logo.height), w * 0.2); ctx.drawImage(logo, x, pad, lw, lh); x += lw + pad; }
    ctx.font = head(Math.round(h * 0.2));
    const btnW = cta ? Math.min(w * 0.28, ctx.measureText(cta).width + h * 0.32) : 0;
    const textW = w - x - pad - (btnW ? btnW + pad : 0);
    let tt = fit(ctx, title, head, Math.round(h * 0.3), Math.round(h * 0.16), textW, msg ? 1 : 2);
    let mm = msg ? fit(ctx, msg, body, Math.round(h * 0.2), Math.round(h * 0.12), textW, 1) : null;
    // A title that doesn't fit on one line gets two, and the message is left out (never a cut-off title)
    if (msg && tt.lines.join(' ') !== title) { tt = fit(ctx, title, head, Math.round(h * 0.3), Math.round(h * 0.16), textW, 2); mm = null; }
    const blockH = tt.lines.length * tt.px * 1.1 + (mm ? mm.px * 1.3 : 0);
    let y = (h - blockH) / 2;
    ctx.fillStyle = theme.fg; ctx.font = head(tt.px);
    tt.lines.forEach((l) => { ctx.fillText(l, x, y); y += tt.px * 1.1; });
    if (mm) { ctx.font = body(mm.px); ctx.globalAlpha = 0.92; ctx.fillText(mm.lines[0], x, y + mm.px * 0.15); ctx.globalAlpha = 1; }
    if (cta) { const px = Math.round(h * 0.18); button(w - pad - btnW, (h - px * 2) / 2, btnW, px); }
  } else {
    // Box or tall: logo on top, title, message, button at the bottom
    let y = pad;
    if (logo) { const lh = Math.min(h * (h > w * 1.5 ? 0.16 : 0.24), (w - pad * 2) * (logo.height / logo.width)); const lw = lh * (logo.width / logo.height); ctx.drawImage(logo, (w - lw) / 2, y, lw, lh); y += lh + pad * 0.7; }
    const maxW = w - pad * 2;
    const btnPx = Math.round(w * 0.055);
    const bottom = h - pad - (cta ? btnPx * 2 + pad * 0.6 : 0);
    const tt = fit(ctx, title, head, Math.round(w * 0.12), Math.round(w * 0.065), maxW, 3);
    const mm = msg ? fit(ctx, msg, body, Math.round(w * 0.065), Math.round(w * 0.042), maxW, h > w * 1.5 ? 6 : 3) : null;
    const cc = contact ? fit(ctx, contact, body, Math.round(w * 0.05), Math.round(w * 0.038), maxW, 1) : null;
    const blockH = tt.lines.length * tt.px * 1.12 + (mm ? pad * 0.4 + mm.lines.length * mm.px * 1.35 : 0) + (cc ? pad * 0.35 + cc.px * 1.3 : 0);
    y = y + Math.max(0, (bottom - y - blockH) / 2);
    const tx = left ? pad : w / 2;
    ctx.textAlign = left ? 'left' : 'center'; ctx.fillStyle = theme.fg;
    ctx.font = head(tt.px); tt.lines.forEach((l) => { ctx.fillText(l, tx, y); y += tt.px * 1.12; });
    if (mm) { y += pad * 0.4; ctx.font = body(mm.px); ctx.globalAlpha = 0.92; mm.lines.forEach((l) => { ctx.fillText(l, tx, y); y += mm.px * 1.35; }); ctx.globalAlpha = 1; }
    if (cc) { y += pad * 0.35; ctx.font = `700 ${cc.px}px "Noto Sans", system-ui, sans-serif`; ctx.fillText(cc.lines[0], tx, y); }
    ctx.textAlign = 'left';
    if (cta) { ctx.font = head(btnPx); const bw = Math.min(maxW, ctx.measureText(cta).width + btnPx * 1.6); button(left ? pad : (w - bw) / 2, h - pad - btnPx * 2, maxW, btnPx); }
  }
  // Offer tag in the top corner (e.g. "−20%", "Nuevo"), in the button's colors
  const badge = (x.badge ?? '').trim();
  if (badge) {
    const px = Math.max(9, Math.round(Math.min(w, h) * (w / h > 2.5 ? 0.15 : 0.075)));
    ctx.font = head(px); const bw = ctx.measureText(badge).width + px * 1.2, bh = px * 1.7;
    ctx.save(); ctx.translate(w - bw - 6, 6); roundRect(ctx, 0, 0, bw, bh, bh / 2); ctx.fillStyle = theme.btn; ctx.fill();
    ctx.fillStyle = theme.btnFg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(badge, bw / 2, bh / 2 + 1); ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }
  // Small "Anuncio" mark so readers know it's paid
  ctx.font = `600 ${Math.max(8, Math.round(Math.min(w, h) * 0.07))}px system-ui, sans-serif`;
  ctx.fillStyle = theme.fg; ctx.globalAlpha = 0.55; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText('Anuncio', w - 4, h - 2); ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
}

/** Reads a picked file as an <img> (for logos and uploaded ads). */
export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img); img.onerror = fail;
    img.src = URL.createObjectURL(file);
  });
}

/** Fits any image into an ad space of exactly w × h without stretching or cutting it: the picture is centered at the
 *  largest size that fits, and the empty sides are filled with a blurred, darker copy of the same picture. Images that
 *  already have the space's shape simply fill it. Used when staff upload a finished design or a client's art has the
 *  wrong size (panel → Anuncios). */
export function fitImage(canvas: HTMLCanvasElement, w: number, h: number, img: HTMLImageElement, scale = 2) {
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const same = Math.abs(iw / ih - w / h) / (w / h) < 0.04;
  if (!same) {
    // Background: the same picture, covering the space, blurred and darkened
    const cover = Math.max(w / iw, h / ih);
    ctx.save(); ctx.filter = 'blur(14px) brightness(0.7)';
    ctx.drawImage(img, (w - iw * cover) / 2, (h - ih * cover) / 2, iw * cover, ih * cover);
    ctx.restore();
  }
  const fit = same ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  ctx.drawImage(img, (w - iw * fit) / 2, (h - ih * fit) / 2, iw * fit, ih * fit);
}
/** An image from a data: or https: address (for drawing on a canvas). */
export function imageFrom(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = fail; i.src = src; });
}

/** Places an image in an ad space chosen by hand (panel → Anuncios → Por diseñar → "Subir diseño"): it fills the space
 *  (cropping what doesn't fit), `zoom` 1 = just fills it, and `x`/`y` move it (in the space's pixels; kept so the image
 *  always covers the whole space). Returns the offsets actually used. */
export function placeImage(canvas: HTMLCanvasElement, w: number, h: number, img: HTMLImageElement, p: { zoom?: number; x?: number; y?: number }, scale = 2) {
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.max(w / iw, h / ih) * Math.max(1, p.zoom ?? 1);
  const dw = iw * k, dh = ih * k;
  const maxX = (dw - w) / 2, maxY = (dh - h) / 2;
  const x = Math.max(-maxX, Math.min(maxX, p.x ?? 0)), y = Math.max(-maxY, Math.min(maxY, p.y ?? 0));
  ctx.drawImage(img, (w - dw) / 2 + x, (h - dh) / 2 + y, dw, dh);
  return { x, y };
}
