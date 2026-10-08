// HTML for a list of notifications (profile menu and /perfil share it). All reader text is escaped.
import { ago, type Notif } from './notifications';

const esc = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const ICON: Record<Notif['kind'], string> = {
  mention: '<path d="M16 12a4 4 0 1 1-1.2-2.8M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1" />',
  reply: '<path d="M10 8L5 13l5 5" /><path d="M5 13h9a5 5 0 0 1 5 5v1" />',
  like: '<path d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.2 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.8 0 6 3.8 4.5 7.3C19.5 16.4 12 21 12 21z" />',
  badge: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />',
  mod: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M12 8v5M12 16h.01" />',
};

/** Plain sentence, e.g. "A lectora_bayamon le gustó tu comentario." (used for the toast). */
export const sentence = (n: Notif) => (n.who ? `${n.kind === 'like' ? 'A ' : ''}${n.who} ${n.text}` : n.text);

export function renderNotifs(list: Notif[]) {
  return list.map((n) => `<li class="nf-item${n.read ? '' : ' new'}">
    <a href="${esc(n.url || '#')}" data-nf-id="${esc(n.id)}">
      <span class="nf-ic k-${n.kind}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n.kind]}</svg></span>
      <span class="nf-txt">${n.who ? `${n.kind === 'like' ? 'A ' : ''}<b>${esc(n.who)}</b> ` : ''}${esc(n.text)}${n.quote ? `<q>${esc(n.quote)}</q>` : ''}<small>${ago(n.at)}${n.demo ? ' · <span class="sp-demo">EJEMPLO</span>' : ''}</small></span>
      ${n.read ? '' : '<i class="nf-new" aria-label="Nueva"></i>'}
    </a></li>`).join('');
}
