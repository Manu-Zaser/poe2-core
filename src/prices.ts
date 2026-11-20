/**
 * Preise von poe.ninja (PoE2): Börsen-Items (Währung, Runen, Omen …) und Uniques einer League als Index,
 * dazu die Kurse je Handelspaar, um Ausreißer bei dünnem Handel zu erkennen. Genutzt von Price Check und
 * Loot Overlay. poe.ninja rechnet etwa stündlich neu – Aufrufer sollten zwischenspeichern.
 */

export interface PriceMatch {
  name: string;
  baseType?: string;
  /** Preis pro Stück in Divine Orbs. */
  divine: number;
  /** Preis pro Stück in Exalted Orbs. */
  exalted: number;
  listingCount?: number;
  /** Kursänderung der letzten 7 Tage in Prozent. */
  change7d?: number;
  /** Verlauf der letzten Tage (Änderung in % je Tag, poe.ninja) – für die Mini-Grafik. */
  sparkline?: number[];
  /** Absolute Bild-URL (web.poecdn.com). */
  icon?: string;
  /** Börsen-Items (Währung, Runen …): wo poe.ninja die Kurse je Handelspaar führt. */
  ninjaRef?: { type: string; id: string };
  /** Hinweis, wenn der Preis unsicher ist (z. B. Handelspaare widersprechen sich). */
  warning?: string;
}

/** Ein Eintrag des Index mit seiner poe.ninja-Kategorie (z. B. "Runes", "UniqueArmours"). */
export interface PriceEntry {
  match: PriceMatch;
  type: string;
}

const BASE = 'https://poe.ninja/poe2/api/economy';

/** poe.ninja aktualisiert PoE2-Daten etwa stündlich – öfter abzufragen bringt nichts. */
export const CACHE_TTL_MS = 60 * 60 * 1000;

export const EXCHANGE_TYPES = [
  'Currency', 'Fragments', 'Abyss', 'UncutGems', 'LineageSupportGems', 'Essences', 'SoulCores',
  'Idols', 'Runes', 'Ritual', 'Expedition', 'Delirium', 'Breach', 'Verisium',
] as const;

export const UNIQUE_TYPES = [
  'UniqueWeapons', 'UniqueArmours', 'UniqueAccessories', 'UniqueFlasks', 'UniqueCharms',
  'UniqueJewels', 'UniqueSanctumRelics', 'UniqueTablets', 'PrecursorTablets',
] as const;

// --- Antwortformate (nur die Felder, die wir nutzen) ---

interface Sparkline { totalChange?: number; data?: (number | null)[] }
interface ExchangeResponse {
  core: { rates: { exalted?: number }; primary: string };
  lines: { id: string; primaryValue: number; sparkline?: Sparkline }[];
  items: { id: string; name: string; image?: string }[];
}
interface UniqueResponse {
  core: { rates: { exalted?: number }; primary: string };
  lines: { name: string; baseType: string; primaryValue: number; listingCount?: number; corrupted?: boolean; sparkLine?: Sparkline; icon?: string }[];
}

const IMAGE_HOST = 'https://web.poecdn.com';

/** Verlauf ohne Lücken; zu wenige Punkte = keine Grafik. */
function cleanSparkline(data: (number | null)[] | undefined): number[] | undefined {
  const points = (data ?? []).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return points.length >= 2 ? points : undefined;
}

/** poe.ninja liefert Währungsbilder als relativen Pfad auf web.poecdn.com. */
function absoluteImage(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('https://')) return src;
  return src.startsWith('/') ? IMAGE_HOST + src : undefined;
}

export interface PriceIndex {
  league: string;
  fetchedAt: number;
  /** Exalted pro Divine. */
  exaltedPerDivine: number;
  /** Kleingeschriebener Name → Preis. */
  currency: Map<string, PriceMatch>;
  /** Währungs-ID der Trade-API (z. B. "exalted") → Wert in Divine. */
  currencyById: Map<string, number>;
  /** Kleingeschriebener Unique-Name → Varianten (verschiedene Basistypen). */
  uniquesByName: Map<string, PriceMatch[]>;
  /** Kleingeschriebener Basistyp → Uniques auf dieser Basis (für unidentifizierte Items). */
  uniquesByBase: Map<string, PriceMatch[]>;
  /** Alle Einträge mit Kategorie (z. B. für eine Marktübersicht). */
  entries: PriceEntry[];
}

export type FetchJson = (url: string) => Promise<unknown>;

export function makeFetchJson(userAgent: string): FetchJson {
  return async (url) => {
    const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`poe.ninja responded with HTTP ${res.status} for ${url}`);
    return res.json();
  };
}

/** Alle Leagues; der erste Eintrag ist laut poe.ninja-Doku die aktuelle Challenge-League. */
export async function fetchLeagues(fetchJson: FetchJson): Promise<string[]> {
  const leagues = (await fetchJson(`${BASE}/leagues`)) as { id: string }[];
  if (!Array.isArray(leagues) || leagues.length === 0) throw new Error('poe.ninja returned no leagues');
  return leagues.map((l) => l.id);
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Höchstens so viele Anfragen gleichzeitig – schnell genug, ohne poe.ninja zu belasten. */
const CONCURRENCY = 4;

/** Wie Promise.all, aber mit begrenzter Parallelität; Reihenfolge der Ergebnisse bleibt erhalten. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Lädt alle Kurse einer League (23 Anfragen, max. 4 parallel). */
export async function buildPriceIndex(fetchJson: FetchJson, league: string): Promise<PriceIndex> {
  const q = (type: string) => `league=${encodeURIComponent(league)}&type=${type}`;
  const index: PriceIndex = {
    league,
    fetchedAt: Date.now(),
    exaltedPerDivine: 0,
    currency: new Map(),
    currencyById: new Map(),
    uniquesByName: new Map(),
    uniquesByBase: new Map(),
    entries: [],
  };

  const urls = [
    ...EXCHANGE_TYPES.map((t) => `${BASE}/exchange/current/overview?${q(t)}`),
    ...UNIQUE_TYPES.map((t) => `${BASE}/stash/current/item/overview?${q(t)}`),
  ];
  const responses = await mapLimit(urls, CONCURRENCY, fetchJson);
  const exchange = responses.slice(0, EXCHANGE_TYPES.length) as ExchangeResponse[];
  const uniques = responses.slice(EXCHANGE_TYPES.length) as UniqueResponse[];

  // "Currency" zuerst auswerten: liefert den Divine→Exalted-Kurs für alles andere.
  for (const [i, type] of EXCHANGE_TYPES.entries()) {
    const data = exchange[i];
    const rate = data.core?.rates?.exalted ?? 0;
    if (type === 'Currency' && rate > 0) index.exaltedPerDivine = rate;
    const items = new Map(data.items.map((i) => [i.id, i]));
    for (const line of data.lines) {
      index.currencyById.set(line.id, line.primaryValue);
      const meta = items.get(line.id);
      if (!meta) continue;
      const name = meta.name;
      const match: PriceMatch = {
        name,
        ninjaRef: { type, id: line.id },
        icon: absoluteImage(meta.image),
        divine: line.primaryValue,
        exalted: line.primaryValue * (rate || index.exaltedPerDivine),
        change7d: line.sparkline?.totalChange,
        sparkline: cleanSparkline(line.sparkline?.data),
      };
      index.currency.set(name.toLowerCase(), match);
      index.entries.push({ match, type });
    }
  }

  for (const [i, data] of uniques.entries()) {
    const type = UNIQUE_TYPES[i];
    const rate = data.core?.rates?.exalted ?? index.exaltedPerDivine;
    for (const line of data.lines) {
      const match: PriceMatch = {
        name: line.name,
        baseType: line.baseType,
        divine: line.primaryValue,
        exalted: line.primaryValue * rate,
        listingCount: line.listingCount,
        change7d: line.sparkLine?.totalChange,
        sparkline: cleanSparkline(line.sparkLine?.data),
        icon: absoluteImage(line.icon),
      };
      push(index.uniquesByName, line.name.toLowerCase(), match);
      push(index.uniquesByBase, line.baseType.toLowerCase(), match);
      index.entries.push({ match, type });
    }
  }

  return index;
}

// ---------- Kurse je Handelspaar ----------

export interface PairQuote {
  /** Währung des Paares, z. B. "exalted". */
  currency: string;
  /** Preis eines Stücks in dieser Währung. */
  rate: number;
  /** Umgerechnet in Divine. */
  divine: number;
}

interface DetailsResponse {
  core?: { rates?: Record<string, number> };
  pairs?: { id: string; rate: number; volumePrimaryValue?: number }[];
}

/**
 * Kurse eines Börsen-Items je Handelspaar (Divine, Exalted, Chaos …). poe.ninja nimmt als Preis das Paar mit
 * dem meisten Volumen; bei dünnem Handel kann das ein Ausreißer sein (z. B. ein paar Chaos-Tausche).
 */
export async function fetchPairs(fetchJson: FetchJson, league: string, ref: { type: string; id: string }): Promise<PairQuote[]> {
  const data = (await fetchJson(`${BASE}/exchange/current/details?league=${encodeURIComponent(league)}&type=${encodeURIComponent(ref.type)}&id=${encodeURIComponent(ref.id)}`)) as DetailsResponse;
  const rates = data.core?.rates ?? {};
  const out: PairQuote[] = [];
  for (const p of data.pairs ?? []) {
    if (!(p.rate > 0)) continue;
    const perDivine = p.id === 'divine' ? 1 : rates[p.id];
    if (!(perDivine > 0)) continue;
    out.push({ currency: p.id, rate: p.rate, divine: p.rate / perDivine });
  }
  return out;
}

/** Ab diesem Faktor zwischen günstigstem und teuerstem Paar gilt der Preis als widersprüchlich. */
export const PAIR_SPREAD = 3;

const CURRENCY_NAME: Record<string, string> = { divine: 'Divine', exalted: 'Exalted', chaos: 'Chaos' };
const amountText = (q: PairQuote) => `${Number(q.rate.toPrecision(3))} ${CURRENCY_NAME[q.currency] ?? q.currency}`;

/**
 * Widersprechen sich die Paare (Faktor > PAIR_SPREAD), gilt vorsichtshalber der niedrigste Kurs, mit Hinweis.
 * Sonst bleibt der poe.ninja-Preis unverändert.
 */
export function checkPairs(match: PriceMatch, quotes: PairQuote[], exaltedPerDivine: number): PriceMatch {
  if (quotes.length < 2) return match;
  const sorted = [...quotes].sort((a, b) => a.divine - b.divine);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  if (high.divine / low.divine <= PAIR_SPREAD) return match;
  return {
    ...match,
    divine: low.divine,
    exalted: low.divine * exaltedPerDivine,
    warning: `poe.ninja's trades disagree: ${amountText(low)} vs ${amountText(high)} – few trades, check the in-game exchange. Showing the lower price.`,
  };
}
