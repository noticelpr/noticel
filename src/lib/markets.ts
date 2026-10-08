// Market quotes for Puerto Rico readers (Yahoo Finance at build time; the site rebuilds every hour).
// Used by the Economía ticker and board (src/components/economia/Markets.astro) and the home "Mercados" card.
export type Info = { sym: string; name: string; group: string; about: string; coin?: string; digits?: number; suf?: string };
export type Quote = Info & { key: string; price: number; prev: number; hi?: number; lo?: number; hi52?: number; lo52?: number; t: number[]; c: number[] };
export const LIST: Info[] = [
  { sym: 'BPOP', name: 'Popular', group: 'pr', about: 'Banco Popular de Puerto Rico, el banco más grande de la isla.' },
  { sym: 'FBP', name: 'FirstBank', group: 'pr', about: 'First BanCorp, la casa matriz de FirstBank Puerto Rico.' },
  { sym: 'OFG', name: 'OFG (Oriental)', group: 'pr', about: 'OFG Bancorp, la casa matriz de Oriental Bank.' },
  { sym: 'EVTC', name: 'Evertec (ATH Móvil)', group: 'pr', about: 'Evertec, la empresa de San Juan detrás de ATH y ATH Móvil.' },
  { sym: 'LILA', name: 'Liberty Latin America', group: 'pr', about: 'La casa matriz de Liberty Puerto Rico (cable, internet y celular).' },
  { sym: '^GSPC', name: 'S&P 500', group: 'us', digits: 0, about: 'Las 500 empresas más grandes de EE. UU. Es el índice que más se sigue.' },
  { sym: '^DJI', name: 'Dow Jones', group: 'us', digits: 0, about: '30 de las empresas más conocidas de EE. UU.' },
  { sym: '^IXIC', name: 'Nasdaq', group: 'us', digits: 0, about: 'La bolsa de las empresas de tecnología.' },
  { sym: '^RUT', name: 'Russell 2000', group: 'us', digits: 0, about: '2,000 empresas pequeñas de EE. UU.; muestra cómo le va a los negocios más pequeños.' },
  { sym: '^TNX', name: 'Tasa del Tesoro (10 años)', group: 'us', digits: 2, suf: '%', about: 'El interés que paga el gobierno de EE. UU. a 10 años. Cuando sube, las hipotecas y los préstamos suelen subir también.' },
  { sym: 'CL=F', name: 'Petróleo (barril)', group: 'mp', about: 'Barril de petróleo de EE. UU. (WTI). Influye en la gasolina y en el ajuste por combustible de la factura de luz.' },
  { sym: 'RB=F', name: 'Gasolina (galón, mayorista)', group: 'mp', digits: 2, about: 'Precio mayorista de la gasolina en EE. UU. por galón. En Puerto Rico se vende por litro (1 galón = 3.785 litros), con impuestos y transporte aparte.' },
  { sym: 'GC=F', name: 'Oro (onza)', group: 'mp', digits: 0, about: 'Precio de una onza de oro.' },
  { sym: 'NG=F', name: 'Gas natural', group: 'mp', digits: 2, about: 'Precio del gas natural en EE. UU. Puerto Rico produce buena parte de su electricidad con gas natural.' },
  { sym: 'SI=F', name: 'Plata (onza)', group: 'mp', digits: 2, about: 'Precio de una onza de plata.' },
  { sym: 'BTC-USD', name: 'Bitcoin', group: 'cr', coin: 'bitcoin', digits: 0, about: 'La criptomoneda más grande. Su precio sube y baja mucho.' },
  { sym: 'ETH-USD', name: 'Ethereum', group: 'cr', coin: 'ethereum', digits: 0, about: 'La segunda criptomoneda más grande.' },
  { sym: 'XRP-USD', name: 'XRP', group: 'cr', coin: 'ripple', digits: 2, about: 'La criptomoneda de la empresa Ripple, pensada para enviar dinero entre países.' },
  { sym: 'SOL-USD', name: 'Solana', group: 'cr', coin: 'solana', digits: 2, about: 'Una criptomoneda rápida y popular para aplicaciones y monedas digitales.' },
  { sym: 'DOGE-USD', name: 'Dogecoin', group: 'cr', coin: 'dogecoin', digits: 4, about: 'Empezó como un chiste con la cara de un perro; su precio sube y baja mucho.' },
];
export const GROUPS: Record<string, string> = { pr: 'Empresas de Puerto Rico', us: 'Bolsa de Nueva York', mp: 'Petróleo, gasolina y oro', cr: 'Criptomonedas' };
export const CHIPS: Record<string, string> = { all: 'Todos', pr: 'Puerto Rico', us: 'Bolsa', mp: 'Petróleo y oro', cr: 'Cripto' };
export const keyOf = (sym: string) => sym.replace(/^\^|=F$|-USD$/g, '');

async function quote(q: Info): Promise<Quote | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(q.sym)}?range=3mo&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    const res = (await r.json()).chart.result[0];
    const ts: number[] = res.timestamp ?? []; const raw: Array<number | null> = res.indicators.quote[0].close ?? [];
    const t: number[] = [], c: number[] = [];
    raw.forEach((v, i) => { if (v != null) { t.push(ts[i]); c.push(Number(v.toFixed(q.digits ?? 2))); } });
    const m = res.meta;
    const price = m.regularMarketPrice ?? c.at(-1);
    if (!price) return null;
    return { ...q, key: keyOf(q.sym), price, prev: c.length > 1 ? c.at(-2)! : price, hi: m.regularMarketDayHigh, lo: m.regularMarketDayLow, hi52: m.fiftyTwoWeekHigh, lo52: m.fiftyTwoWeekLow, t, c };
  } catch { return null; }
}
/** All quotes, fetched once per build and shared by every page that shows them. */
export function getMarkets(): Promise<{ at: Date; list: Quote[] }> {
  const g = globalThis as any;
  g.__nxMarkets ??= Promise.all(LIST.map(quote)).then((l) => ({ at: new Date(), list: l.filter(Boolean) as Quote[] }));
  return g.__nxMarkets;
}
export const fmtPrice = (q: Quote, v = q.price) => v.toLocaleString('en-US', { minimumFractionDigits: q.digits ?? 2, maximumFractionDigits: q.digits ?? 2 });
export const curOf = (q: Quote) => (q.group === 'us' ? '' : '$');
export const pctOf = (q: Quote) => ((q.price - q.prev) / q.prev) * 100;

