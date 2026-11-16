import { describe, expect, it } from 'vitest';
import { budgetInExalted, fetchCurrencyRates, fetchLeagues, toDivine } from '../src/ninja';

const fakeFetch = (async (url: string) => {
  expect(url).toContain('league=Forbidden%20Rites');
  expect(url).toContain('type=Currency');
  return new Response(
    JSON.stringify({
      core: { rates: { exalted: 600, chaos: 10 } },
      lines: [
        { id: 'divine', primaryValue: 1 },
        { id: 'chaos', primaryValue: 0.1 },
        { id: 'exalted', primaryValue: 1 / 600 },
      ],
    }),
  );
}) as unknown as typeof fetch;

describe('poe.ninja currency rates', () => {
  it('reads the Divine → Exalted rate and currency values', async () => {
    const rates = await fetchCurrencyRates('Forbidden Rites', 'test', fakeFetch);
    expect(rates.exaltedPerDivine).toBe(600);
    expect(toDivine(rates, 3, 'chaos')).toBeCloseTo(0.3);
    expect(toDivine(rates, 300, 'exalted')).toBeCloseTo(0.5);
    expect(toDivine(rates, 1, 'mirror')).toBeNull();
  });

  it('turns a budget into the Exalted equivalent', async () => {
    const rates = await fetchCurrencyRates('Forbidden Rites', 'test', fakeFetch);
    expect(budgetInExalted(rates, 2, 'divine')).toBe(1200);
    expect(budgetInExalted(rates, 1.5, 'divine')).toBe(900);
    expect(budgetInExalted(rates, 250, 'exalted')).toBe(250);
  });

  it('fails clearly without a rate', async () => {
    const empty = (async () => new Response('{}')) as unknown as typeof fetch;
    await expect(fetchCurrencyRates('X', 'test', empty)).rejects.toThrow(/no Divine/);
  });
});

describe('poe.ninja leagues', () => {
  it('lists the league names, challenge league first', async () => {
    const f = (async () => new Response(JSON.stringify([{ id: 'Forbidden Rites', name: 'Forbidden Rites' }, { id: 'Standard', name: 'Standard' }]))) as unknown as typeof fetch;
    expect(await fetchLeagues('test', f)).toEqual(['Forbidden Rites', 'Standard']);
    const empty = (async () => new Response('[]')) as unknown as typeof fetch;
    await expect(fetchLeagues('test', empty)).rejects.toThrow(/no leagues/);
  });
});
