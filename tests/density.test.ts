import { describe, expect, it } from 'vitest';
import { deriveDensity, type DensityPortion } from '../src/generator/density.js';

// In the real distribution every portion row has measure_unit_id 9999
// ("undetermined") and the measure lives in the free-text modifier.
function portion(overrides: Partial<DensityPortion>): DensityPortion {
  return {
    id: 1,
    amount: 1,
    unitName: 'undetermined',
    modifier: 'cup',
    portionDescription: '',
    gramWeight: 240,
    ...overrides,
  };
}

describe('deriveDensity', () => {
  it('derives g/ml from a plain volume modifier, citing its row', () => {
    const result = deriveDensity([portion({ id: 81549, gramWeight: 236.5882365 })]);
    expect(result).not.toBeNull();
    expect(result?.density_g_per_ml).toBeCloseTo(1.0, 6);
    expect(result?.citation.portionId).toBe(81549);
  });

  it('scales by the portion amount (0.5 cup)', () => {
    const result = deriveDensity([portion({ amount: 0.5, gramWeight: 118.29411825 })]);
    expect(result?.density_g_per_ml).toBeCloseTo(1.0, 6);
  });

  it('accepts the volume vocabulary SR actually uses', () => {
    for (const [mod, ml] of [
      ['tbsp', 14.78676478125],
      ['tablespoon', 14.78676478125],
      ['tsp', 4.92892159375],
      ['teaspoon', 4.92892159375],
      ['fl oz', 29.5735295625],
      ['ml', 1],
      ['liter', 1000],
      ['quart', 946.352946],
      ['cubic inch', 16.387064],
    ] as const) {
      const result = deriveDensity([portion({ modifier: mod, gramWeight: ml })]);
      expect(result?.density_g_per_ml, mod).toBeCloseTo(1.0, 6);
    }
  });

  it('excludes qualified portions — "cup, chopped" is not the plain measure', () => {
    expect(deriveDensity([portion({ modifier: 'cup, chopped' })])).toBeNull();
    expect(deriveDensity([portion({ modifier: 'cup (8 fl oz)' })])).toBeNull();
    expect(deriveDensity([portion({ modifier: 'cup slices' })])).toBeNull();
  });

  it('excludes non-volume modifiers', () => {
    expect(deriveDensity([portion({ modifier: 'serving' })])).toBeNull();
    expect(deriveDensity([portion({ modifier: 'slice' })])).toBeNull();
    expect(deriveDensity([portion({ modifier: '' })])).toBeNull();
  });

  it('excludes rows with a portion description', () => {
    expect(deriveDensity([portion({ portionDescription: 'about half' })])).toBeNull();
  });

  it('returns null when no portion qualifies', () => {
    expect(deriveDensity([])).toBeNull();
  });

  it('reconciles multiple qualifying portions by lower median, citing the chosen row', () => {
    const result = deriveDensity([
      portion({ id: 10, modifier: 'tbsp', gramWeight: 14.78676478125 * 0.9 }),
      portion({ id: 11, modifier: 'cup', gramWeight: 236.5882365 * 1.0 }),
      portion({ id: 12, modifier: 'fl oz', gramWeight: 29.5735295625 * 1.1 }),
      portion({ id: 13, modifier: 'tsp', gramWeight: 4.92892159375 * 1.2 }),
    ]);
    // densities 0.9, 1.0, 1.1, 1.2 → lower median = 1.0, from row 11
    expect(result?.density_g_per_ml).toBeCloseTo(1.0, 6);
    expect(result?.citation.portionId).toBe(11);
  });

  it('excludes the known-bad USDA rows by id, not by plausibility heuristics', () => {
    // Portion 92790 (Pregestimil, fdc 173527) says "100 ml = 1 g" — a data
    // error. Ultra-light real foods (freeze-dried chives, 0.0135 g/ml) must
    // survive, so the rule names the bad row instead of using a band.
    expect(
      deriveDensity([portion({ id: 92790, modifier: 'ml', amount: 100, gramWeight: 1 })]),
    ).toBeNull();
    const chives = deriveDensity([
      portion({ id: 7, modifier: 'tbsp', amount: 1, gramWeight: 0.2 }),
    ]);
    expect(chives?.density_g_per_ml).toBeCloseTo(0.0135, 3);
  });

  it('ignores zero/garbage rows instead of dividing by zero', () => {
    expect(deriveDensity([portion({ amount: 0 })])).toBeNull();
    expect(deriveDensity([portion({ gramWeight: 0 })])).toBeNull();
  });
});
