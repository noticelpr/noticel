// Draws a simple, clean ad on a <canvas> from the client's text, logo and colors.
// Used by the Anúnciate page (live preview when we create the ad) and the approval page
// (the employee adjusts it and downloads the PNG). Runs in the browser only.

export type AdText = { title: string; msg: string; cta: string; business: string };
export type AdTheme = { id: string; name: string; a: string; b: string; fg: string; btn: string; btnFg: string };

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
export function drawAd(canvas: HTMLCanvasElement, w: number, h: number, t: AdText, theme: AdTheme, logo?: HTMLImageElement | null, scale = 2) {
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, theme.a); g.addColorStop(1, theme.b);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'top';
  const head = (px: number) => `800 ${px}px Barlow Condensed, system-ui, sans-serif`;
  const body = (px: number) => `500 ${px}px "Barlow", system-ui, sans-serif`;
  const title = t.title.trim() || t.business.trim() || 'Tu negocio';
  const msg = t.msg.trim(); const cta = t.cta.trim();
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
    const tt = fit(ctx, title, head, Math.round(h * 0.3), Math.round(h * 0.16), textW, msg ? 1 : 2);
    const mm = msg ? fit(ctx, msg, body, Math.round(h * 0.2), Math.round(h * 0.12), textW, 1) : null;
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
    const blockH = tt.lines.length * tt.px * 1.12 + (mm ? pad * 0.4 + mm.lines.length * mm.px * 1.35 : 0);
    y = y + Math.max(0, (bottom - y - blockH) / 2);
    ctx.textAlign = 'center'; ctx.fillStyle = theme.fg;
    ctx.font = head(tt.px); tt.lines.forEach((l) => { ctx.fillText(l, w / 2, y); y += tt.px * 1.12; });
    if (mm) { y += pad * 0.4; ctx.font = body(mm.px); ctx.globalAlpha = 0.92; mm.lines.forEach((l) => { ctx.fillText(l, w / 2, y); y += mm.px * 1.35; }); ctx.globalAlpha = 1; }
    ctx.textAlign = 'left';
    if (cta) { ctx.font = head(btnPx); const bw = Math.min(maxW, ctx.measureText(cta).width + btnPx * 1.6); button((w - bw) / 2, h - pad - btnPx * 2, maxW, btnPx); }
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
