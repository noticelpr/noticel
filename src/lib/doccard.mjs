// A document attached to a story (PDF): a clean card in the story; clicking "Ver documento" opens the whole
// document (a viewer over the page on computers, the phone's own PDF viewer on phones; see DocViewer.astro).
// One line of HTML on purpose: it sits inside the story's Markdown as a raw HTML block.

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ICON = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';

export const docSize = (bytes) => (!bytes ? '' : bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`);

/** { src, title, pages?, size? (bytes), source? } → card HTML */
export function docCard({ src, title, pages, size, source }) {
  const meta = ['PDF', pages ? `${pages} ${pages === 1 ? 'página' : 'páginas'}` : '', docSize(size), source || ''].filter(Boolean).join(' · ');
  return `<figure class="doc-card"><a class="doc-open" href="${esc(src)}" target="_blank" rel="noopener" data-doc-title="${esc(title)}"><span class="doc-ic">${ICON}</span><span class="doc-tx"><b>${esc(title)}</b><small>${esc(meta)}</small></span><span class="doc-go">Ver documento</span></a></figure>`;
}
