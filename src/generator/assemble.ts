import { deriveDensity, type DerivedDensity } from './density.js';
import { buildLabelNutrients, LABEL_SET, type LabelNutrients } from './label-set.js';
import { assignSlugs } from './slug.js';
import type { CalorieConversionFactor, Dataset, NutrientRow, PortionRow } from './load.js';

/**
 * The leaf data model (DESIGN.md "The leaf/view law"). `core` is the label
 * set + identity + derived density; `extra` is every remaining nutrient row,
 * portions, and conversion factors. Views compose these — never inline them.
 */

export interface FoodCore {
  readonly fdc_id: number;
  readonly slug: string;
  readonly description: string;
  readonly category: string;
  readonly nutrients: LabelNutrients;
  readonly density: DerivedDensity | null;
}

export interface FoodExtra {
  readonly fdc_id: number;
  readonly ndb_number: string;
  /** Named so a full view can be `{...core, ...extra}` without clobbering core.nutrients. */
  readonly remaining_nutrients: readonly NutrientRow[];
  readonly portions: readonly PortionRow[];
  readonly calorie_conversion_factor: CalorieConversionFactor | null;
  readonly protein_conversion_factor: number | null;
}

export interface GeneratedFood {
  readonly core: FoodCore;
  readonly extra: FoodExtra;
}

const LABEL_NUTRIENT_IDS = new Set(LABEL_SET.map((e) => e.nutrientId));

export function assemble(dataset: Dataset): GeneratedFood[] {
  const slugs = assignSlugs(dataset.foods);
  return dataset.foods.map((food) => {
    const slug = slugs.get(food.fdcId);
    if (slug === undefined) throw new Error(`No slug assigned for fdc_id ${food.fdcId}`);
    return {
      core: {
        fdc_id: food.fdcId,
        slug,
        description: food.description,
        category: food.category,
        nutrients: buildLabelNutrients(food.nutrients),
        density: deriveDensity(food.portions),
      },
      extra: {
        fdc_id: food.fdcId,
        ndb_number: food.ndbNumber,
        remaining_nutrients: food.nutrients.filter((n) => !LABEL_NUTRIENT_IDS.has(n.nutrientId)),
        portions: food.portions,
        calorie_conversion_factor: food.calorieConversionFactor,
        protein_conversion_factor: food.proteinConversionFactor,
      },
    };
  });
}
