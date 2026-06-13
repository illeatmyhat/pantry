import { describe, expect, it } from 'vitest';
import { localizeNutrients } from '../src/toolkit/index.js';
import type { Food, NutrientLabels } from '../src/toolkit/index.js';

// A locale nutrient table keyed by stable USDA id (the shipped labels.nutrients
// shape). Partial on purpose — to exercise the English fallback.
const jaLabels: NutrientLabels = {
  nutrients: { '1003': 'タンパク質', '1004': '脂質', '1210': 'トリプトファン' },
};

const core: Food = {
  nutrients: {
    calories: 212, fat: 80.5, saturated_fat: null, trans_fat: null, cholesterol: null,
    sodium: 2684, carbohydrate: 0, fiber: null, sugars: null, protein: 5.05,
    vitamin_d: null, calcium: null, iron: null, potassium: null,
  },
  density: null,
};

const full: Food = {
  ...core,
  remaining_nutrients: [
    { nutrientId: 1210, name: 'Tryptophan', unit: 'G', amount: 0.05 },
    { nutrientId: 1051, name: 'Water', unit: 'G', amount: 12.3 },
  ],
};

describe('localizeNutrients', () => {
  it('returns the 14-key panel in label order, amount null where SR has no row', () => {
    const rows = localizeNutrients(core, jaLabels);
    expect(rows).toHaveLength(14);
    expect(rows[0]).toEqual({ id: 1008, name: 'Calories', amount: 212, unit: 'kcal' });
    expect(rows.find((r) => r.id === 1003)).toEqual({ id: 1003, name: 'タンパク質', amount: 5.05, unit: 'g' });
    expect(rows.find((r) => r.id === 1258)?.amount).toBeNull(); // saturated_fat: no SR row
  });

  it('resolves panel names from the table, falling back to FDA wording when unlabeled', () => {
    const rows = localizeNutrients(core, jaLabels);
    expect(rows.find((r) => r.id === 1004)?.name).toBe('脂質'); // labeled
    expect(rows.find((r) => r.id === 1093)?.name).toBe('Sodium'); // unlabeled → FDA fallback
  });

  it('appends the extras for a /full view, localized or USDA-name fallback', () => {
    const rows = localizeNutrients(full, jaLabels);
    expect(rows).toHaveLength(16); // 14 panel + 2 extra
    expect(rows.find((r) => r.id === 1210)).toEqual({ id: 1210, name: 'トリプトファン', amount: 0.05, unit: 'G' });
    expect(rows.find((r) => r.id === 1051)).toEqual({ id: 1051, name: 'Water', amount: 12.3, unit: 'G' }); // unlabeled → USDA
  });

  it('returns only the panel for a core view (no remaining_nutrients)', () => {
    expect(localizeNutrients(core, jaLabels)).toHaveLength(14);
  });
});
