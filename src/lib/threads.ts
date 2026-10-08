// Reddit-style conversations (Foro NotiCel and story comments): sorting, reply trees, ▲▼ vote buttons and folding.

/** "Lo más caliente": newer and well-voted rise together (Reddit's formula: each 10× votes ≈ 12.5 hours newer). */
export const hot = (votes: number, at: number) => Math.sign(votes) * Math.log10(Math.max(Math.abs(votes), 1)) + (at / 1000 - 1.7e9) / 45000;

/** "hace 3 h", "ayer"… (sample data) → a time in milliseconds. */
export function parseAgo(s = ''): number {
  const m = /(\d+)\s*(min|h|d)/.exec(s);
  if (m) return Date.now() - Number(m[1]) * (m[2] === 'min' ? 6e4 : m[2] === 'h' ? 36e5 : 864e5);
  return Date.now() - (/ayer/i.test(s) ? 864e5 : 0);
}
export const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`;
};

export type Sort = 'best' | 'new' | 'old';
type Node = { id: string; parent: string | null; score: number; at: number };
/** A reply tree in reading order: each item with its depth (0 = answers the topic/story directly), children under their parent. */
export function tree<T extends Node>(items: T[], sort: Sort): Array<{ item: T; depth: number; kids: number }> {
  const ids = new Set(items.map((x) => x.id));
  const by = new Map<string | null, T[]>();
  // A reply whose parent is gone (deleted) moves up to the top level
  items.forEach((x) => { const p = x.parent && ids.has(x.parent) ? x.parent : null; (by.get(p) ?? by.set(p, []).get(p)!).push(x); });
  const cmp = sort === 'new' ? (a: T, b: T) => b.at - a.at : sort === 'old' ? (a: T, b: T) => a.at - b.at : (a: T, b: T) => b.score - a.score || b.at - a.at;
  const count = (id: string): number => (by.get(id) ?? []).reduce((n, c) => n + 1 + count(c.id), 0);
  const out: Array<{ item: T; depth: number; kids: number }> = [];
  const walk = (p: string | null, d: number) => [...(by.get(p) ?? [])].sort(cmp).forEach((x) => { out.push({ item: x, depth: d, kids: count(x.id) }); walk(x.id, d + 1); });
  walk(null, 0);
  return out;
}

/** ▲ score ▼ (my vote: 1, -1 or 0). The buttons carry data-vote="1" / "-1". */
export function voteBox(score: number, mine: number, cls = 'rv'): HTMLElement {
  const box = document.createElement('div'); box.className = cls;
  const b = (v: number, label: string, ch: string) => {
    const x = document.createElement('button'); x.type = 'button'; x.dataset.vote = String(v); x.className = v > 0 ? 'up' : 'dn';
    x.setAttribute('aria-label', label); x.setAttribute('aria-pressed', String(mine === v)); x.textContent = ch; return x;
  };
  const n = document.createElement('b'); n.textContent = String(score);
  box.classList.toggle('on-up', mine > 0); box.classList.toggle('on-dn', mine < 0);
  box.append(b(1, 'Votar a favor', '▲'), n, b(-1, 'Votar en contra', '▼'));
  return box;
}

/**
 * Folding: items rendered as a flat list with data-depth; clicking [data-fold] (or the thread line) on one hides
 * everything nested under it, and shows "+ N respuestas" to open it again. Folded ids stay folded across re-renders.
 */
export function foldable(list: HTMLElement, folded: Set<string>) {
  const apply = () => {
    let hideBelow = Infinity;
    list.querySelectorAll<HTMLElement>(':scope > [data-depth]').forEach((li) => {
      const d = Number(li.dataset.depth);
      if (d <= hideBelow) hideBelow = Infinity;
      li.hidden = d > hideBelow;
      const f = folded.has(li.dataset.id!);
      li.classList.toggle('folded', f);
      // The fold button's text: data-open / data-closed when given ("{n}" = replies inside), otherwise − / +
      const lab = li.querySelector<HTMLElement>('[data-fold-label]'); if (lab) lab.textContent = (f ? lab.dataset.closed ?? '+' : lab.dataset.open ?? '−').replace('{n}', li.dataset.kids ?? '');
      if (!li.hidden && f) hideBelow = d;
    });
  };
  list.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-fold]'); if (!t) return;
    const li = t.closest<HTMLElement>('[data-depth]')!; const id = li.dataset.id!;
    folded.has(id) ? folded.delete(id) : folded.add(id); apply();
  });
  return apply;
}
