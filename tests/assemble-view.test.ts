import { describe, expect, it } from 'vitest';
import { assembleFull, assembleFullLocalized } from '../src/toolkit/index.js';
import type { Food } from '../src/toolkit/index.js';

const core: Food = {
  fdc_id: 1,
  slug: 'salt-pork',
  nutrients: {
    calories: 748, fat: 80.5, saturated_fat: 29.4, trans_fat: null, cholesterol: 86,
    sodium: 2684, carbohydrate: 0, fiber: 0, sugars: null, protein: 5.05,
    vitamin_d: null, calcium: 5, iron: 0.26, potassium: 66,
  },
  density: null,
};
const extra = {
  fdc_id: 1,
  ndb_number: '10165',
  remaining_nutrients: [
    { nutrientId: 1210, name: 'Tryptophan', unit: 'G', amount: 0.05 },
    { nutrientId: 1062, name: 'Energy', unit: 'kJ', amount: 3127 },
  ],
};

describe('assembleFull', () => {
  it('keys the panel by slug and the extras by lowercased name, on one map', () => {
    const full = assembleFull(core, extra);
    expect(full.nutrients.protein).toBe(5.05); // panel slug
    expect(full.nutrients['tryptophan']).toBe(0.05); // extra by name
    expect(full.nutrients['energy']).toBe(3127);
    expect((full as { ndb_number?: string }).ndb_number).toBe('10165'); // extra fields ride along
  });
});

describe('assembleFullLocalized', () => {
  const labels = { nutrients: { '1003': 'たんぱく質', '1210': 'トリプトファン', '1062': 'エネルギー（kJ）' } };

  it('keys the panel by slug AND localized name, extras by localized name', () => {
    const full = assembleFullLocalized(core, extra, { locale: 'ja-JP', name: '塩豚' }, labels);
    expect(full.nutrients.protein).toBe(5.05); // stable slug
    expect(full.nutrients['たんぱく質']).toBe(5.05); // localized panel
    expect(full.nutrients['トリプトファン']).toBe(0.05); // localized extra
    expect(full.nutrients['エネルギー（kj）']).toBe(3127); // lowercased
    expect(full.locale).toBe('ja-JP'); // strings ride along
  });

  it('falls back to the USDA name for an extra the locale has not labeled', () => {
    const sparse = { nutrients: { '1003': 'たんぱく質' } };
    const full = assembleFullLocalized(core, extra, {}, sparse);
    expect(full.nutrients['tryptophan']).toBe(0.05); // USDA-name fallback
  });
});
