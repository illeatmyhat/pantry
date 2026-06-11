import { describe, expect, it } from 'vitest';
import { buildLabelNutrients, LABEL_SET } from '../src/generator/label-set.js';

describe('LABEL_SET', () => {
  it('pins the 14 US Nutrition Facts keys to their SR nutrient ids and units', () => {
    expect(LABEL_SET.map((e) => [e.key, e.nutrientId, e.unit])).toEqual([
      ['calories', 1008, 'kcal'],
      ['fat', 1004, 'g'],
      ['saturated_fat', 1258, 'g'],
      ['trans_fat', 1257, 'g'],
      ['cholesterol', 1253, 'mg'],
      ['sodium', 1093, 'mg'],
      ['carbohydrate', 1005, 'g'],
      ['fiber', 1079, 'g'],
      ['sugars', 2000, 'g'],
      ['protein', 1003, 'g'],
      ['vitamin_d', 1114, 'mcg'],
      ['calcium', 1087, 'mg'],
      ['iron', 1089, 'mg'],
      ['potassium', 1092, 'mg'],
    ]);
  });
});

describe('buildLabelNutrients', () => {
  it('maps SR nutrient rows onto the label set, null where SR has no row', () => {
    const result = buildLabelNutrients([
      { nutrientId: 1008, amount: 212 },
      { nutrientId: 1003, amount: 5.05 },
      { nutrientId: 1004, amount: 80.5 },
      { nutrientId: 1005, amount: 0 },
      { nutrientId: 1093, amount: 2684 },
    ]);
    expect(result.calories).toBe(212);
    expect(result.protein).toBe(5.05);
    expect(result.sodium).toBe(2684);
    expect(result.carbohydrate).toBe(0); // zero is data, not missing
    expect(result.vitamin_d).toBeNull(); // missing row is null
    expect(Object.keys(result)).toHaveLength(14); // structurally complete, always
  });

  it('ignores nutrient rows outside the label set', () => {
    const result = buildLabelNutrients([{ nutrientId: 1062, amount: 887 }]); // Energy kJ
    expect(result.calories).toBeNull();
  });
});
