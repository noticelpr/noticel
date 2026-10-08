// Markdown plugin: a link alone on its own line becomes an embed (like WordPress).
// Supported: YouTube, X/Twitter, Instagram, Facebook, TikTok, Spotify and Google Maps. Anything else stays a link.
// Used by stories written in the staff panel editor (/redaccion/ → Escribir) and by hand in src/content/noticias/.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// Size and position chosen in the editor: size s | m | l (default: the post type's own size), align l | r (default center)
let opts = {};
const layout = () => `${opts.size ? ` sz-${opts.size}` : ''}${opts.align === 'l' || opts.align === 'r' ? ` al-${opts.align}` : ''}`;
const frame = (src, cls, title) => `<figure class="embed ${cls}${layout()}"><iframe src="${esc(src)}" title="${esc(title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></figure>`;

export function embedFor(raw, layoutOpts = {}) {
  opts = layoutOpts;
  let u; try { u = new URL(String(raw).trim()); } catch { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, '');
  let m;
  if (h === 'youtu.be' && (m = u.pathname.match(/^\/([\w-]{6,})/))) return frame(`https://www.youtube-nocookie.com/embed/${m[1]}`, 'video', 'Video de YouTube');
  if (h === 'youtube.com' && u.searchParams.get('v')) return frame(`https://www.youtube-nocookie.com/embed/${u.searchParams.get('v')}`, 'video', 'Video de YouTube');
  if (h === 'youtube.com' && (m = u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/))) return frame(`https://www.youtube-nocookie.com/embed/${m[2]}`, m[1] === 'shorts' ? 'tall' : 'video', 'Video de YouTube');
  if ((h === 'x.com' || h === 'twitter.com') && (m = u.pathname.match(/\/status\/(\d+)/))) return frame(`https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&lang=es`, 'post', 'Publicación en X');
  if (h === 'instagram.com' && (m = u.pathname.match(/^\/(p|reel|tv)\/([\w-]+)/))) return frame(`https://www.instagram.com/${m[1]}/${m[2]}/embed`, 'post tall', 'Publicación en Instagram');
  if (h === 'facebook.com' || h === 'fb.watch') {
    const video = /\/videos\/|\/watch|fb\.watch|\/reel\//.test(u.href);
    return frame(`https://www.facebook.com/plugins/${video ? 'video' : 'post'}.php?href=${encodeURIComponent(u.href)}&show_text=true`, video ? 'video' : 'post', 'Publicación en Facebook');
  }
  if (h === 'tiktok.com' && (m = u.pathname.match(/\/video\/(\d+)/))) return frame(`https://www.tiktok.com/embed/v2/${m[1]}`, 'tall', 'Video de TikTok');
  if (h === 'open.spotify.com' && (m = u.pathname.match(/^\/(track|episode|show|playlist|album)\/(\w+)/))) return frame(`https://open.spotify.com/embed/${m[1]}/${m[2]}`, 'audio', 'Spotify');
  if ((h === 'google.com' || h === 'maps.google.com') && u.pathname.startsWith('/maps')) {
    const q = u.searchParams.get('q') || decodeURIComponent((u.pathname.match(/\/place\/([^/]+)/) || [])[1] || '').replace(/\+/g, ' ');
    if (q) return frame(`https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`, 'map', `Mapa: ${q}`);
  }
  return null;
}

// Plugin for Astro's Markdown engine (Sätteri): a paragraph that is only a supported link becomes the embed
export const embedsPlugin = {
  name: 'noticias-xtra-embeds',
  paragraph(node, ctx) {
    if (node.children.length !== 1) return;
    const only = node.children[0];
    const text = only.type === 'link' && only.children.length === 1 && only.children[0].type === 'text' ? only.children[0].value : null;
    const url = only.type === 'link' && text === only.url ? only.url : only.type === 'text' && /^https?:\/\/\S+$/.test(only.value.trim()) ? only.value.trim() : null;
    const html = url && embedFor(url);
    if (html) ctx.replaceNode(node, { type: 'html', value: html });
  },
};
