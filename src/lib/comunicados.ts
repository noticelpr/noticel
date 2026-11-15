// Comunicados de prensa pagados (user, 2026-11-02). A business pays to publish a press release: on Anúnciate (paid
// online) or through Ventas ("+ Anuncio vendido" → Comunicado). Either way it's an ad order (ad_requests) with format
// 'comunicado', so commissions, Ingresos and the client emails work as for any ad. Prices: COMUNICADO_PRICES in
// src/lib/ads.ts. Two kinds:
//   ready (art.mode 'upload') — the client sends it written; an editor reviews and formats it
//   written (art.mode 'design') — the client gives the facts; our team writes it
// Ventas (or the administrator) sends the order to Escribir as a story "En revisión" marked paidBy, so an editor
// publishes it in its topic's section with the "Comunicado pagado" label (never placed as news: src/lib/site.ts).
import type { AdRequest } from './adrequests';
import { putArticle } from './backend';

export const isComunicado = (r: AdRequest) => r.formats.includes('comunicado');
const line = (r: AdRequest, k: string) => (r.lines ?? []).find((x) => x.startsWith(`${k}: `))?.slice(k.length + 2).trim() ?? '';
/** The section the client chose ("Sección: economia" in the order's lines). */
export const comunicadoSection = (r: AdRequest) => line(r, 'Sección') || 'puerto-rico';
const esc = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Puts the comunicado in Escribir as a story waiting for an editor ("En revisión"). Returns the story's id, or ''. */
export async function comunicadoToEscribir(r: AdRequest, staffName: string): Promise<string> {
  const paidBy = (r.client.business || r.client.name || 'Cliente').trim();
  const written = r.art.mode === 'design';
  const text = String(r.art.msg ?? '').trim();
  // The client's text as paragraphs; for "we write it", the facts go in as a note for whoever writes it
  const paras = text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  const body = written
    ? `<p><b>[Por escribir: datos del cliente]</b></p>${paras.map((p) => `<p>${esc(p)}</p>`).join('')}`
    : paras.map((p) => `<p>${esc(p)}</p>`).join('');
  const photo = r.art.files?.find((f) => /^https?:/.test(f.data))?.data ?? '';
  const id = `A-${r.id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-10)}`;
  const doc = {
    id, updated: Date.now(), owner: staffName, title: r.art.title || `Comunicado de ${paidBy}`, description: String(r.art.cta ?? '').trim(),
    section: comunicadoSection(r), league: '', place: 'Puerto Rico', author: paidBy, date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    image: '', imageUrl: photo, imageCaption: '', imageCredit: photo ? `Foto: ${paidBy}` : '',
    breaking: false, trending: false, featured: false, live: false, pinned: false, homeLead: false, sectionLead: false, sectionPinned: false,
    sources: [{ name: `Comunicado de ${paidBy}` }], related: [], correction: '', body, paidBy,
    note: `Comunicado pagado (${r.id}, ${written ? 'lo escribimos nosotros' : 'escrito por el cliente'}). ${r.art.notes ? `Notas del cliente: ${r.art.notes}` : ''}`.trim(),
  };
  return (await putArticle(id, 'review', doc)) ? id : '';
}
