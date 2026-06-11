/**
 * The US Nutrition Facts label set ↔ SR nutrient-id mapping, verified
 * against the frozen distribution (2026-06-11):
 *
 * - Sugars is nutrient 2000 ("Sugars, Total", nbr 269); the NLEA row (1063)
 *   never appears in SR Legacy.
 * - Vitamin D ships in mcg via nutrient 1114 (D2+D3); the IU row (1110)
 *   covers 4 fewer foods and IU is the legacy label unit.
 * - Energy is 1008 (kcal); 1062 is the kJ twin and is left to `extra`.
 *
 * Coverage is complete (7,793) only for calories/protein/fat/carbohydrate;
 * everything else is null where SR has no row. Amounts are per 100 g.
 */
export const LABEL_KEYS = [
  'calories',
  'fat',
  'saturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'carbohydrate',
  'fiber',
  'sugars',
  'protein',
  'vitamin_d',
  'calcium',
  'iron',
  'potassium',
] as const;

export type LabelKey = (typeof LABEL_KEYS)[number];
export type LabelNutrients = Record<LabelKey, number | null>;

export interface LabelSetEntry {
  readonly key: LabelKey;
  readonly nutrientId: number;
  readonly unit: 'kcal' | 'g' | 'mg' | 'mcg';
}

export const LABEL_SET: readonly LabelSetEntry[] = [
  { key: 'calories', nutrientId: 1008, unit: 'kcal' },
  { key: 'fat', nutrientId: 1004, unit: 'g' },
  { key: 'saturated_fat', nutrientId: 1258, unit: 'g' },
  { key: 'trans_fat', nutrientId: 1257, unit: 'g' },
  { key: 'cholesterol', nutrientId: 1253, unit: 'mg' },
  { key: 'sodium', nutrientId: 1093, unit: 'mg' },
  { key: 'carbohydrate', nutrientId: 1005, unit: 'g' },
  { key: 'fiber', nutrientId: 1079, unit: 'g' },
  { key: 'sugars', nutrientId: 2000, unit: 'g' },
  { key: 'protein', nutrientId: 1003, unit: 'g' },
  { key: 'vitamin_d', nutrientId: 1114, unit: 'mcg' },
  { key: 'calcium', nutrientId: 1087, unit: 'mg' },
  { key: 'iron', nutrientId: 1089, unit: 'mg' },
  { key: 'potassium', nutrientId: 1092, unit: 'mg' },
];

export interface NutrientAmount {
  readonly nutrientId: number;
  readonly amount: number;
}

export function buildLabelNutrients(rows: readonly NutrientAmount[]): LabelNutrients {
  const byId = new Map<number, number>();
  for (const row of rows) byId.set(row.nutrientId, row.amount);
  const result = {} as LabelNutrients;
  for (const entry of LABEL_SET) {
    result[entry.key] = byId.get(entry.nutrientId) ?? null;
  }
  return result;
}
