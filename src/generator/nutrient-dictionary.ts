import { LABEL_SET } from '../toolkit/food.js';
import type { Dataset } from './load.js';

/**
 * The nutrient dictionary: every distinct SR Legacy nutrient, keyed by its
 * stable USDA id. This is the en-US localization source for nutrient NAMES —
 * generated mechanically from the vendored zip (never committed, same rule as
 * cores), exactly as a food's en-US name is its USDA description copied.
 *
 * A locale's nutrient label table (labels.nutrients, id → localized name) is
 * validated to cover exactly this id set: every nutrient a `/full` view can
 * surface has a name in every shipped locale, or the locale ships none yet
 * (missing means missing). The frozen dataset yields 149 distinct nutrients —
 * 14 panel + 135 extra — pinned by the invariant suite.
 */
export interface NutrientDictEntry {
  readonly id: number;
  /** USDA nutrient.csv name (en-US, mechanical). Panel ids carry the FDA label instead — see canonicalNutrientNames. */
  readonly name: string;
  /** USDA unit token (G, MG, UG, IU, kJ, kcal …). Names localize; units are international and do not. */
  readonly unit: string;
  /** How many SR foods carry this nutrient — coverage, for review ordering. */
  readonly foods: number;
  /** True for the 14 keys of the FDA Nutrition Facts panel (core.nutrients). */
  readonly panel: boolean;
}

const PANEL_IDS = new Set(LABEL_SET.map((e) => e.nutrientId));

/** Distinct nutrients across the dataset, ascending by id (the stable key). */
export function buildNutrientDictionary(dataset: Dataset): NutrientDictEntry[] {
  const seen = new Map<number, { name: string; unit: string; foods: number }>();
  for (const food of dataset.foods) {
    for (const n of food.nutrients) {
      const cur = seen.get(n.nutrientId);
      if (cur === undefined) seen.set(n.nutrientId, { name: n.name, unit: n.unit, foods: 1 });
      else cur.foods += 1;
    }
  }
  return [...seen.entries()]
    .map(([id, v]) => ({ id, name: v.name, unit: v.unit, foods: v.foods, panel: PANEL_IDS.has(id) }))
    .sort((a, b) => a.id - b.id);
}

/**
 * The canonical en-US nutrient names, id → name: the FDA Nutrition Facts
 * wording for the 14 panel ids ("Total Fat", not USDA's "Total lipid (fat)"),
 * the USDA name for the 135 extras. This is the en-US slice of
 * labels.nutrients; other locales translate these.
 */
export function canonicalNutrientNames(dataset: Dataset): Record<string, string> {
  const panelLabel = new Map(LABEL_SET.map((e) => [e.nutrientId, e.label]));
  const out: Record<string, string> = {};
  for (const entry of buildNutrientDictionary(dataset)) {
    out[String(entry.id)] = panelLabel.get(entry.id) ?? entry.name;
  }
  return out;
}
