// Comment moderation. Used when a comment is posted (block the clearly bad) and when one is reported
// (hide the clearly bad, keep the clearly fine, send doubtful cases to the review queue: /comentarios/revisar).
// PREVIEW: these are word and pattern rules that run in the browser. The real version sends the text to an AI
// moderation service from the server and keeps these rules as a first filter; reports are then shared by all readers.

export type Verdict = 'ok' | 'review' | 'block';
export type Assessment = { verdict: Verdict; score: number; reasons: string[] };

// Comment rule (user, 2026-11-06): every comment stays, strong words and insults included, except ads, spam and scams.
// Also removed, because they can be crimes: real threats of violence, someone's private data to harass them, and
// anything sexual involving minors.
export const REPORT_REASONS = [
  { id: 'spam', name: 'Anuncio, spam o estafa (cripto, premios, dinero fácil)' },
  { id: 'amenaza', name: 'Amenaza de violencia contra alguien' },
  { id: 'personal', name: 'Datos privados de alguien (dirección, teléfono)' },
  { id: 'menores', name: 'Contenido sexual con menores' },
  { id: 'otro', name: 'Otra cosa' },
] as const;
// Reasons readers could pick before 2026-11-06 (older reports still show their name)
const OLD_REASONS: Record<string, string> = { insulto: 'Insulto o acoso', odio: 'Odio o discriminación', falso: 'Información falsa' };
export const HIDE_AFTER_REPORTS = 3; // different readers reporting the same comment → hidden until reviewed

// Word lists (lowercase, without accents). Kept short and clear on purpose: real moderation adds AI.
const INSULTS = ['pendej', 'cabron', 'punet', 'mamao', 'charro', 'idiota', 'estupid', 'imbecil', 'bruto', 'animal', 'basura', 'cerdo', 'puerc', 'mierd', 'carajo', 'hdp', 'hijo de puta', 'puta', 'maric', 'loca de remate'];
const HATE = ['negro de mierda', 'sudaca', 'maricon', 'pato', 'gringo asqueroso', 'dominicano de mierda', 'raza inferior'];
const THREATS = ['te voy a matar', 'te mato', 'te voy a dar', 'ojala te mueras', 'ojala se muera', 'hay que matarl', 'te voy a buscar', 'se que donde vives', 'se donde vives', 'te voy a romper'];
// Scams: crypto, forex or "investments" with promised earnings or a contact request, fake prizes
const SCAM = /(bitcoin|btc|usdt|cripto|forex|binance|inversion|invierte|trading)[^.!?]{0,80}(gana|ganancia|ganar|rendimiento|ingreso|escrib|contact|telegram|whatsapp|dm\b|inbox|privado)|(ganaste|has sido seleccionad|reclama tu premio|premio de \$)/;
const SPAM = ['ganancias diarias', 'ingresos pasivos', 'gane desde casa', 'telegram', 'whatsapp', 'gana dinero', 'dinero facil', 'trabaja desde casa', 'haz clic', 'compra ahora', 'oferta exclusiva', 'whatsapp me', 'escribeme al', 'inversion segura', 'cripto gratis', 'bitcoin gratis'];

const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const has = (t: string, list: string[]) => list.filter((w) => new RegExp(`(^|[^a-z])${w.replace(/ /g, '\\s+')}`).test(t));

export function assess(text: string): Assessment {
  const t = plain(text);
  const reasons: string[] = [];
  let score = 0;
  // Insults and strong words don't count (user, 2026-11-06): only ads, spam, scams, threats and private data
  const thr = has(t, THREATS); if (thr.length) { score += 80; reasons.push('Amenaza'); }
  const sp = [...has(t, SPAM), ...(SCAM.test(t) ? ['estafa'] : [])]; const links = (t.match(/https?:\/\/|www\./g) ?? []).length;
  if (sp.length || links >= 2) { score += 40 + (links >= 2 ? 20 : 0); reasons.push('Spam o publicidad'); } else if (links === 1) { score += 15; reasons.push('Incluye un enlace'); }
  // Personal information: phone numbers, emails, social security, street addresses
  if (/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/.test(t)) { score += 45; reasons.push('Número de teléfono'); }
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/.test(t)) { score += 35; reasons.push('Correo electrónico'); }
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(t)) { score += 90; reasons.push('Seguro social'); }
  if (/\b(calle|ave\.?|avenida|urb\.?|urbanizacion|carr\.?|carretera)\s+[\w\d]+.*\b\d{1,5}\b/.test(t)) { score += 30; reasons.push('Posible dirección'); }
  // Shouting and flooding
  const letters = text.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  if (letters.length > 15 && letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length / letters.length > 0.8) { score += 10; reasons.push('Todo en mayúsculas'); }
  if (/(.)\1{7,}/.test(t)) { score += 10; reasons.push('Letras repetidas'); }
  const verdict: Verdict = score >= 60 ? 'block' : score >= 25 ? 'review' : 'ok';
  return { verdict, score: Math.min(100, score), reasons };
}

/** Comments and the Foro (user, 2026-11-03): no word filter before posting, only no ads. Returns what was found
 *  ('' when the text is fine). Same rules as nx_has_ad() in the database (supabase/anti-spam.sql). */
export function adIn(text: string): string {
  const t = text || '';
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|pr|io|info|biz|shop|store|online|site|app|xyz)\b)/i.test(t)) return 'enlaces';
  if (/(^|[^0-9])(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}($|[^0-9])/.test(t) || /(^|[^0-9])\d{3}-\d{4}($|[^0-9])/.test(t)) return 'números de teléfono';
  if (/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i.test(t)) return 'correos electrónicos';
  if (SCAM.test(plain(t))) return 'ofertas de inversión, cripto o premios'; // scams (user, 2026-11-06)
  return '';
}

/** Decision for a report. The reason picked by the reader adds doubt but never hides a comment alone.
 *  weak = this reader's earlier reports were mostly wrong, so their report alone doesn't send it to review. */
/** The server applies the same rules plus speed limits (supabase/anti-spam.sql); its Spanish message is shown as is. */
export async function serverSays(r: Response | null, fallback: string): Promise<string> {
  const m = r && r.status === 400 ? ((await r.json().catch(() => ({}))) as { code?: string; message?: string }) : {};
  return m.code === 'P0001' && m.message ? m.message : fallback;
}

export function judgeReport(text: string, reasonIds: string[], reportCount: number, weak = false): { action: 'hide' | 'keep' | 'review'; a: Assessment } {
  const a = assess(text);
  if (a.verdict === 'block') return { action: 'hide', a };
  if (reportCount >= HIDE_AFTER_REPORTS) return { action: 'review', a }; // hidden until someone reviews it
  if (a.verdict === 'review') return { action: 'review', a };
  const serious = reasonIds.some((r) => ['amenaza', 'personal', 'menores'].includes(r));
  if (serious && !weak) return { action: 'review', a };
  return { action: 'keep', a };
}

// ---- Review queue (PREVIEW: kept in this browser, localStorage 'nc-reports') ----
// status: auto = hidden automatically (clear violation) · review = waiting for the employee ·
//         kept = the check found nothing (report rejected) · restored / removed / warned = the employee decided
export type Report = {
  id: string; at: number; storyId: string; storyUrl: string; title: string; commentId: string; author: string; text: string; media?: string;
  mine: boolean; // the comment is this reader's own (its reputation pays if it gets removed)
  source: 'report' | 'post'; // reported by readers, or flagged by the check when it was posted
  reasons: string[]; count: number; score: number; flags: string[];
  status: 'auto' | 'review' | 'kept' | 'restored' | 'removed' | 'warned';
  decided?: number;
};
const KEY = 'nc-reports';
export function getReports(): Report[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function saveReports(list: Report[]) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 150))); } catch { /* storage blocked */ } }
export function upsertReport(r: Report) { saveReports([r, ...getReports().filter((x) => x.id !== r.id)]); }
/** Is the comment hidden from readers right now? */
export const isHidden = (r: Report) => r.status === 'auto' || r.status === 'removed' || (r.status === 'review' && r.count >= HIDE_AFTER_REPORTS);
export const reasonName = (id: string) => REPORT_REASONS.find((x) => x.id === id)?.name ?? OLD_REASONS[id] ?? id;

// Reports this reader made, and how many turned out wrong (comment kept). 3+ wrong out of 4+ = weak reporter.
const MINE_KEY = 'nc-my-reports';
export function myReports(): { ids: string[]; wrong: number } { try { return { ids: [], wrong: 0, ...JSON.parse(localStorage.getItem(MINE_KEY) || '{}') }; } catch { return { ids: [], wrong: 0 }; } }
export function saveMyReports(m: { ids: string[]; wrong: number }) { try { localStorage.setItem(MINE_KEY, JSON.stringify(m)); } catch { /* storage blocked */ } }
export const isWeakReporter = (m = myReports()) => m.ids.length >= 4 && m.wrong >= 3;
