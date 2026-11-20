import { describe, expect, it } from 'vitest';
import { checkPairs, fetchPairs, mapLimit, type PriceMatch } from '../src/prices';

const rune: PriceMatch = { name: 'Rune of Acrobatics', divine: 1.05, exalted: 548, change7d: 12, ninjaRef: { type: 'Runes', id: 'rune-of-acrobatics' } };

describe('poe.ninja trade pairs', () => {
  it('reads every pair and converts it to Divine', async () => {
    const quotes = await fetchPairs(
      async (url) => {
        expect(url).toContain('/exchange/current/details?league=Forbidden%20Rites&type=Runes&id=rune-of-acrobatics');
        return {
          core: { rates: { exalted: 520, chaos: 10 } },
          pairs: [
            { id: 'chaos', rate: 10.5 },
            { id: 'exalted', rate: 10 },
            { id: 'divine', rate: 0.02 },
            { id: 'mirror', rate: 1 }, // ohne Kurs → ignoriert
            { id: 'exalted', rate: 0 },
          ],
        };
      },
      'Forbidden Rites',
      rune.ninjaRef!,
    );
    expect(quotes.map((q) => q.currency)).toEqual(['chaos', 'exalted', 'divine']);
    expect(quotes[0].divine).toBeCloseTo(1.05);
    expect(quotes[1].divine).toBeCloseTo(10 / 520);
  });

  it('shows the lower price with a warning when the pairs disagree', () => {
    const quotes = [
      { currency: 'chaos', rate: 10.5, divine: 1.05 },
      { currency: 'exalted', rate: 10, divine: 10 / 520 },
    ];
    const checked = checkPairs(rune, quotes, 520);
    expect(checked.divine).toBeCloseTo(10 / 520);
    expect(checked.exalted).toBeCloseTo(10);
    expect(checked.warning).toContain('10 Exalted vs 10.5 Chaos');
  });

  it('keeps the poe.ninja price when the pairs roughly agree or only one exists', () => {
    const close = [
      { currency: 'exalted', rate: 540, divine: 540 / 520 },
      { currency: 'divine', rate: 1.05, divine: 1.05 },
    ];
    expect(checkPairs(rune, close, 520)).toBe(rune);
    expect(checkPairs(rune, close.slice(0, 1), 520)).toBe(rune);
  });
});

describe('mapLimit', () => {
  it('keeps the order and never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, n));
      running--;
      return n * 2;
    });
    expect(out).toEqual([10, 2, 8, 4, 6]);
    expect(peak).toBe(2);
  });
});
