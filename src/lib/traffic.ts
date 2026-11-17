/* Traffic by spot (owner, 2026-11-17; copied from the sister platform and fitted to NotiCel's pages; supabase/trafico.sql).
   On every page, counts which spots readers actually saw (half of it on screen; ads: a whole second) and which they
   clicked: the main story, the side spots, each section box, Tendencias, Lo último, related stories, the ads… plus the
   two-headline tests. Sent as totals when the reader leaves the page; nothing about the reader. Only on the real site
   (noticel.com), never in demo mode, never with the Global Privacy Control signal, never on the staff panel. */
import { BACKEND, hasBackend } from './backend';

type Item = { p?: string; s?: string; d?: 'm' | 'd'; h?: string; x?: 'A' | 'B'; v: number; c: number };

// Where a link sits → the spot's name. First match (closest box) wins; '*' = numbered by position (lado-1, lado-2…)
const SPOTS: Array<[string, string]> = [
  // Home page
  ['.lead .related', 'principal-relacionadas*'],
  ['.lead-extra-grid', 'mas-titulares*'],
  ['.lead', 'principal'],
  ['.stack', 'lado*'],
  ['.home-row', 'fila*'],
  ['.home-more', 'mas-noticias*'],
  ['.live-row', 'recien-publicado*'],
  ['.hs-pop-list', 'tira-lista*'],
  ['.hs-band', 'tira'],
  ['.vx-home', 'videos'],
  ['.ncs-tape', 'mercados'],
  // Section pages
  ['.bb-lead', 'principal'],
  ['.bb-more', 'principal-relacionadas*'],
  ['.bb-center', 'centro*'],
  ['.bb-side', 'lado*'],
  ['.bb-row4', 'fila*'],
  ['.ncs-box', 'caja-seccion'],
  ['.sec-subs', 'subsecciones'],
  ['.sec-pager', 'paginas'],
  // Story pages
  ['.art .body', 'enlaces-en-el-texto'],
  ['.crumbs', 'migas'],
  ['.cm', 'comentarios'],
  ['.rel-box .rel-list', 'relacionadas*'],
  ['.grid2', 'tambien*'],
  // Right column and everywhere
  ['.tr-box .tr-list', 'tendencias*'],
  ['.lu-box .lu-list', 'lo-ultimo*'],
  ['.fc-box .fc-list', 'factcheck*'],
  ['.fx-box', 'foro'],
  ['.lvbox', 'en-vivo'],
  ['.hx-box', 'columna-lateral'],
  ['.sc', 'marcadores'],
  ['.gt', 'juegos'],
  ['.breaking', 'barra-ultima-hora'],
  ['.newsletter', 'boletin'],
  ['nav.nav', 'menu'],
  ['.masthead', 'cabecera'],
  ['.tabbar', 'barra-celular'],
  ['footer', 'pie'],
];

function pageName(): string {
  const p = location.pathname.replace(/^\/+|\/+$/g, '');
  if (!p) return 'portada';
  if (document.querySelector('article.art')) return 'noticia'; // a story (built, fast-published or from the archive)
  const parts = p.split('/');
  if (parts[0] === 'category') return `seccion-${parts[parts.length - 1]}`.replace(/[^a-z0-9-]/g, '').slice(0, 60);
  if (parts[0] === 'author') return 'autor';
  if (parts[0] === 'opinion') return 'columnista';
  return parts[0].replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'otra';
}

function spotOf(el: Element): string | null {
  const sec = el.closest('.sec-block');
  if (sec) return `seccion-${[...sec.classList].find((c) => c.startsWith('sec-') && c !== 'sec-block')?.slice(4) ?? 'x'}`;
  for (const [sel, name] of SPOTS) {
    const box = el.closest(sel);
    if (!box) continue;
    if (!name.endsWith('*')) return name;
    const kids = [...box.children].filter((k) => k.querySelector('a') || k.tagName === 'A');
    const i = kids.findIndex((k) => k === el || k.contains(el));
    return `${name.slice(0, -1)}-${i >= 0 ? Math.min(i + 1, 20) : 'x'}`;
  }
  return null;
}

export function startTraffic() {
  if (!hasBackend() || !/(^|\.)noticel\.com$/.test(location.hostname) || (navigator as any).globalPrivacyControl) return;
  if (location.pathname.startsWith('/redaccion') || /[?&]demo=1/.test(location.search)) return;
  const page = pageName();
  const dev: 'm' | 'd' = matchMedia('(max-width: 760px)').matches ? 'm' : 'd';
  const rows = new Map<string, Item>();
  const add = (key: string, base: Omit<Item, 'v' | 'c'>, v: number, c: number) => {
    const r = rows.get(key) ?? { ...base, v: 0, c: 0 };
    r.v = Math.min(r.v + v, 1); r.c = Math.min(r.c + c, 3); // a spot counts once per page view
    rows.set(key, r);
  };
  const spotRow = (s: string, v: number, c: number) => add(`s:${s}`, { p: page, s, d: dev }, v, c);
  const headRow = (slug: string, x: 'A' | 'B', v: number, c: number) => add(`h:${slug}`, { h: slug, x }, v, c);

  // Two-headline tests: this reader sees A or B (the same all visit long), on cards only (the story page keeps its title)
  let mine: 'A' | 'B' = Math.random() < 0.5 ? 'A' : 'B';
  try { const k = sessionStorage.getItem('nc-hl'); if (k === 'A' || k === 'B') mine = k; else sessionStorage.setItem('nc-hl', mine); } catch { /* storage blocked */ }
  const tests: Record<string, [string, string]> = {}; // story address → [story id, second headline]
  const testOf = (a: HTMLAnchorElement) => (a.origin === location.origin ? tests[a.pathname.replace(/\/?$/, '/')] : undefined);

  // Views: half of the spot on screen (ads: on screen a whole second)
  const seen = new WeakSet<Element>();
  const timers = new WeakMap<Element, number>();
  const io = new IntersectionObserver((list) => {
    for (const e of list) {
      const el = e.target as HTMLElement;
      if (seen.has(el)) continue;
      const done = () => {
        seen.add(el); io.unobserve(el);
        if (el.dataset.trAd) spotRow(el.dataset.trAd, 1, 0);
        else {
          const s = el.dataset.trSpot; if (s) spotRow(s, 1, 0);
          const slug = el.dataset.trHl; if (slug) headRow(slug, mine, 1, 0);
        }
      };
      if (e.isIntersecting) { if (el.dataset.trAd) timers.set(el, window.setTimeout(done, 1000)); else done(); }
      else if (timers.has(el)) { clearTimeout(timers.get(el)); timers.delete(el); }
    }
  }, { threshold: 0.5 });

  const watch = () => {
    const adN: Record<string, number> = {};
    document.querySelectorAll<HTMLElement>('.ad-slot').forEach((ad) => {
      const size = ad.dataset.adSize ?? 'x';
      if (ad.dataset.trAd) { adN[size] = Math.max(adN[size] ?? 0, Number(ad.dataset.trAd.split('-').pop()) || 0); return; }
      if (ad.hidden) return;
      adN[size] = (adN[size] ?? 0) + 1;
      ad.dataset.trAd = `anuncio-${size}-${adN[size]}`; io.observe(ad);
    });
    document.querySelectorAll<HTMLAnchorElement>('main a[href], aside a[href], header a[href], nav a[href], footer a[href], .breaking a[href]').forEach((a) => {
      if (a.dataset.trSpot !== undefined) return;
      if (a.closest('.ad-slot')) { a.dataset.trSpot = ''; return; } // ads are counted as ads
      const s = spotOf(a); a.dataset.trSpot = s ?? '';
      const t = testOf(a);
      if (t) {
        a.dataset.trHl = t[0];
        if (mine === 'B' && !a.dataset.trB) {
          // The headline inside the link (or the link itself when it is just the headline's text)
          const h = a.querySelector('h1, h2, h3, .hl, .tr-title') ?? (a.classList.contains('hl') || !a.children.length ? a : null);
          if (h) { a.dataset.trB = '1'; h.textContent = t[1]; }
        }
      }
      if (s || a.dataset.trHl) io.observe(a);
    });
  };

  document.addEventListener('click', (ev) => {
    const ad = (ev.target as Element).closest<HTMLElement>('[data-tr-ad]');
    if (ad) { spotRow(ad.dataset.trAd!, 0, 1); flush(); return; }
    const a = (ev.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!a || a.closest('.ad-slot')) return;
    const s = a.dataset.trSpot ?? spotOf(a); if (s) spotRow(s, 1, 1);
    const slug = a.dataset.trHl; if (slug) headRow(slug, mine, 1, 1);
    flush(); // the next page may load before the reader "leaves" this one
  }, true);

  let sent = 0;
  function flush() {
    const items = [...rows.values()].filter((r) => r.v || r.c);
    if (!items.length || sent > 6) return;
    rows.clear(); sent++;
    fetch(`${BACKEND.url}/rest/v1/rpc/contar_trafico`, { method: 'POST', keepalive: true,
      headers: { apikey: BACKEND.anonKey, Authorization: `Bearer ${BACKEND.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.slice(0, 80) }) }).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);

  // The running headline tests (built with the site: /titulares-prueba.json), then start watching
  fetch('/titulares-prueba.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((t) => {
    Object.assign(tests, t ?? {});
    watch();
    setTimeout(watch, 3000); // spots filled in after load (Recién publicado, Tendencias, ads)
  });
}
