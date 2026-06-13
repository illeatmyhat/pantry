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
import {
  LABEL_KEYS,
  LABEL_SET,
  type LabelKey,
  type LabelNutrients,
  type LabelSetEntry,
} from '../toolkit/food.js';

// LABEL_SET lives in the toolkit (the published Food contract) so the runtime
// resolver and the generator read one mapping; re-exported here for the
// generator's existing importers.
export { LABEL_KEYS, LABEL_SET, type LabelKey, type LabelNutrients, type LabelSetEntry };

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
