/**
 * Currency exchange rates from poe.ninja (PoE2 economy API, "exchange/current/overview?type=Currency").
 * Used to turn a budget in Divine into the Exalted equivalent the trade site filters on, and listing
 * prices into a common unit. poe.ninja updates PoE2 data about hourly – callers should cache.
 */

const BASE = 'https://poe.ninja/poe2/api/economy';

export interface CurrencyRates {
  league: string;
  /** Exalted Orbs per Divine Orb. */
  exaltedPerDivine: number;
  /** Trade currency id (e.g. "exalted", "chaos") → value in Divine Orbs. */
  divineValue: Record<string, number>;
  fetchedAt: number;
}

interface ExchangeResponse {
  core?: { rates?: { exalted?: number } };
  lines?: { id: string; primaryValue: number }[];
}

export async function fetchCurrencyRates(league: string, userAgent: string, fetchImpl: typeof fetch = fetch): Promise<CurrencyRates> {
  const url = `${BASE}/exchange/current/overview?league=${encodeURIComponent(league)}&type=Currency`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`poe.ninja responded with HTTP ${res.status}`);
  const data = (await res.json()) as ExchangeResponse;
  const exaltedPerDivine = data.core?.rates?.exalted ?? 0;
  if (!(exaltedPerDivine > 0)) throw new Error('poe.ninja returned no Divine → Exalted rate');
  const divineValue: Record<string, number> = { divine: 1, exalted: 1 / exaltedPerDivine };
  for (const line of data.lines ?? []) if (line.primaryValue > 0) divineValue[line.id] = line.primaryValue;
  return { league, exaltedPerDivine, divineValue, fetchedAt: Date.now() };
}

/** Price of a listing in Divine Orbs, or null if the currency is unknown. */
export function toDivine(rates: CurrencyRates, amount: number, currency: string): number | null {
  const v = rates.divineValue[currency];
  return v === undefined ? null : amount * v;
}

/** A budget in Divine or Exalted as the Exalted equivalent (what the trade price filter compares against). */
export function budgetInExalted(rates: CurrencyRates, amount: number, currency: 'divine' | 'exalted'): number {
  return currency === 'exalted' ? amount : Math.floor(amount * rates.exaltedPerDivine);
}

/** Current PoE2 leagues as poe.ninja lists them (challenge league first) – the names the trade site uses. */
export async function fetchLeagues(userAgent: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const res = await fetchImpl(`${BASE}/leagues`, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`poe.ninja responded with HTTP ${res.status}`);
  const data = (await res.json()) as { id?: string }[];
  const ids = Array.isArray(data) ? data.map((l) => l.id).filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  if (ids.length === 0) throw new Error('poe.ninja returned no leagues');
  return ids;
}
