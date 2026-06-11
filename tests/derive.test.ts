import { describe, expect, it } from 'vitest';
import { derive } from '../src/toolkit/index.js';
import type { Food } from '../src/toolkit/index.js';

const saltPork: Food = {
  fdc_id: 167914,
  slug: 'pork-cured-salt-pork-raw',
  description: 'Pork, cured, salt pork, raw',
  category: 'Pork Products',
  nutrients: {
    calories: 748,
    fat: 80.5,
    saturated_fat: 29.4,
    trans_fat: null,
    cholesterol: 86,
    sodium: 2684,
    carbohydrate: 0,
    fiber: 0,
    sugars: null,
    protein: 5.05,
    vitamin_d: null,
    calcium: 5,
    iron: 0.26,
    potassium: 66,
  },
  density: null,
};

describe('derive', () => {
  it('naming alone needs no basis — name and aliases are curation, not claims', () => {
    const food = derive(saltPork, { name: 'guanciale', aliases: ['hog jowl'] });
    expect(food.name).toBe('guanciale');
    expect(food.aliases).toEqual(['hog jowl']);
    expect(food.nutrients).toEqual(saltPork.nutrients);
    expect(food.provenance?.source).toEqual({
      fdc_id: 167914,
      slug: 'pork-cured-salt-pork-raw',
      description: 'Pork, cured, salt pork, raw',
    });
    expect(food.provenance?.overrides).toEqual([]);
  });

  it('throws when a data field is stated without basis', () => {
    expect(() => derive(saltPork, { name: 'guanciale', density_g_per_ml: 0.9 })).toThrow(/basis/i);
    expect(() => derive(saltPork, { name: 'guanciale', nutrients: { sodium: 1600 } })).toThrow(
      /basis/i,
    );
  });

  it('applies field-level overrides with basis, recording provenance', () => {
    const food = derive(saltPork, {
      name: 'guanciale',
      density_g_per_ml: 0.9,
      nutrients: { sodium: 1600 },
      basis: 'cured-jowl correction; producer labels cluster ~1400-1800mg',
    });
    expect(food.density?.density_g_per_ml).toBe(0.9);
    expect(food.nutrients.sodium).toBe(1600);
    expect(food.nutrients.calories).toBe(748); // untouched fields flow through
    expect(food.provenance?.overrides).toEqual(['density_g_per_ml', 'nutrients.sodium']);
    expect(food.provenance?.basis).toMatch(/cured-jowl/);
  });

  it('does not inherit the source name, aliases, or locale surface', () => {
    const localized: Food = {
      ...saltPork,
      name: '塩漬け豚',
      aliases: ['ソルトポーク'],
      locale: 'ja-JP',
    };
    const food = derive(localized, { name: 'guanciale' });
    expect(food.name).toBe('guanciale');
    expect(food.aliases).toBeUndefined();
    expect(food.locale).toBeUndefined();
  });

  it('stacks: deriving from a derived food keeps working, later layers win', () => {
    const first = derive(saltPork, { name: 'guanciale', density_g_per_ml: 0.9, basis: 'x' });
    const second = derive(first, { name: 'guanciale di casa', nutrients: { sodium: 1500 }, basis: 'y' });
    expect(second.name).toBe('guanciale di casa');
    expect(second.density?.density_g_per_ml).toBe(0.9); // inherited data persists
    expect(second.nutrients.sodium).toBe(1500);
  });
});
