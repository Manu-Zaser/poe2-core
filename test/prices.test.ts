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
            { id: 'chaos', rate: 10.5, volumePrimaryValue: 0.63 },
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
    expect(quotes[0].volumeDivine).toBe(0.63);
    expect(quotes[1].volumeDivine).toBeUndefined();
  });

  it('shows the lower price with a warning when well traded pairs disagree', () => {
    const quotes = [
      { currency: 'chaos', rate: 10.5, divine: 1.05, volumeDivine: 40 },
      { currency: 'exalted', rate: 10, divine: 10 / 520, volumeDivine: 30 },
    ];
    const checked = checkPairs(rune, quotes, 520);
    expect(checked.divine).toBeCloseTo(10 / 520);
    expect(checked.exalted).toBeCloseTo(10);
    expect(checked.warning).toContain('10 Exalted vs 10.5 Chaos');
    expect(checked.priceAdjusted).toBe(true);
  });

  it('ignores pairs with hardly any volume (single orders) – Omen of Whittling', () => {
    // Echte Daten: 14.87 Div bei 9220 Div Volumen, 161 Chaos bei 926 Div, "1751 Exalted" bei 0.54 Div.
    const whittling: PriceMatch = { name: 'Omen of Whittling', divine: 15.04, exalted: 15.04 * 538.1, volumeDivine: 10737 };
    const quotes = [
      { currency: 'divine', rate: 14.87, divine: 14.87, volumeDivine: 9220 },
      { currency: 'exalted', rate: 1751, divine: 1751 / 538.1, volumeDivine: 0.5423 },
      { currency: 'chaos', rate: 161.3, divine: 161.3 / 11.44, volumeDivine: 926.1 },
    ];
    expect(checkPairs(whittling, quotes, 538.1)).toBe(whittling);
  });

  it('keeps the price but warns when the item is hardly traded at all', () => {
    // Echte Daten Rune of Acrobatics: alle Paare zusammen gut 1 Div Volumen bei 1 Div Preis.
    const acrobatics: PriceMatch = { ...rune, divine: 1, exalted: 538.1 };
    const quotes = [
      { currency: 'divine', rate: 1, divine: 1, volumeDivine: 0.5 },
      { currency: 'exalted', rate: 1, divine: 1 / 538.1, volumeDivine: 0.0003097 },
      { currency: 'chaos', rate: 14.33, divine: 14.33 / 11.44, volumeDivine: 0.6266 },
    ];
    const checked = checkPairs(acrobatics, quotes, 538.1);
    expect(checked.divine).toBe(1);
    expect(checked.priceAdjusted).toBeUndefined();
    expect(checked.warning).toBe('Only ≈ 1.1 traded on poe.ninja – the price may be off, check the in-game exchange.');
  });

  it('keeps the poe.ninja price when the pairs roughly agree or only one exists', () => {
    const close = [
      { currency: 'exalted', rate: 540, divine: 540 / 520, volumeDivine: 50 },
      { currency: 'divine', rate: 1.05, divine: 1.05, volumeDivine: 80 },
    ];
    expect(checkPairs(rune, close, 520)).toBe(rune);
    expect(checkPairs(rune, close.slice(0, 1), 520)).toBe(rune);
  });

  it('without volume data, all pairs count (older answers)', () => {
    const quotes = [
      { currency: 'chaos', rate: 10.5, divine: 1.05 },
      { currency: 'exalted', rate: 10, divine: 10 / 520 },
    ];
    expect(checkPairs(rune, quotes, 520).exalted).toBeCloseTo(10);
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
