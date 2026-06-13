import { LABEL_SET, type Food } from './food.js';

/**
 * The errand slug → local-language label tables. `sections` maps an errand
 * section slug (per-locale, e.g. 'meat') to its signage label (精肉); `stores`
 * maps the three `Errand.store` enum values to their local labels (スーパー /
 * 専門店 / 通販). Built from the frozen vocabulary (l10n/vocabulary/<tag>.yaml).
 */
export interface ErrandLabels {
  readonly sections: Record<string, string>;
  readonly stores: Record<string, string>;
}

/**
 * The nutrient id → local-language name table. Keyed by the stable USDA
 * nutrient id (as a string), covering all 149 SR nutrients — the 14 panel
 * keys and the 135 extras a `/full` view surfaces. en-US names are the FDA
 * panel wording + USDA names (generated); other locales translate them from
 * their national food-composition standard.
 */
export interface NutrientLabels {
  readonly nutrients: Record<string, string>;
}

/**
 * Everything a locale package's `./labels` export ships — the errand labels
 * and the nutrient dictionary in one table (labels.js):
 *
 *   import labels from '@illeatmyhat/pantry/l10n/ja-JP/labels';
 *   // labels = { sections, stores, nutrients }
 *
 * The resolvers take only the slice they need, so this whole object satisfies
 * both `localizeErrand` (ErrandLabels) and `localizeNutrients` (NutrientLabels).
 */
export interface LocaleLabels extends ErrandLabels, NutrientLabels {}

/** A food's errand resolved to display strings in the locale's language. */
export interface LocalizedErrand {
  readonly store: string;
  readonly section: string;
}

/**
 * One nutrient's identity, the value side of a `nutrients` index entry.
 * `name` is the locale's display name (en-US for the core index); `tagname`
 * is the INFOODS component identifier; `unit` is the USDA unit token.
 */
export interface NutrientRef {
  readonly id: number;
  readonly tagname: string;
  readonly unit: string;
  readonly name: string;
}

/**
 * The shipped `./nutrients` index: every nutrient reachable by name in the
 * user's language, by English name, or by INFOODS tagname — keys lowercased
 * (Latin) / as-is (CJK), so `nutrients['tryptophan']`, `nutrients['トリプト
 * ファン']`, and `nutrients['trp_g']` all resolve. Case-sensitive by design
 * (an object index can't be both case-insensitive and autocomplete on keys);
 * the shipped `.d.ts` makes the keys autocomplete.
 */
export type NutrientIndex = Record<string, NutrientRef>;

/**
 * Resolve a food's errand to local-language display labels using a locale's
 * shipped label table — `{store, section}` slugs → スーパー / 精肉 in one call.
 *
 * Returns `null` when there is no retail errand to render: `errand: null`
 * (non-retail — fast food, subsistence) and an absent errand both collapse
 * to nothing on the shelf. A consumer that needs to tell those apart reads
 * `food.errand` directly (`null` vs `undefined`); this helper is for
 * rendering. A coined section slug with no vocabulary label (a stray) falls
 * back to the slug itself, so rendering never produces an empty cell.
 */
export function localizeErrand(food: Food, labels: ErrandLabels): LocalizedErrand | null {
  const { errand } = food;
  if (errand === undefined || errand === null) return null;
  return {
    store: labels.stores[errand.store] ?? errand.store,
    section: labels.sections[errand.section] ?? errand.section,
  };
}

/** One resolved nutrient row: its localized name, amount per 100 g, and unit. */
export interface LocalizedNutrient {
  readonly id: number;
  readonly name: string;
  readonly amount: number | null;
  readonly unit: string;
}

/**
 * Resolve a food's nutrients to local-language display rows. Always returns
 * the 14-key Nutrition Facts panel (in label order; `amount` null where SR
 * has no row); appends the 135 extras when the food is a `/full` view that
 * carries `remaining_nutrients`. Names come from the locale's nutrient table
 * keyed by stable USDA id.
 *
 * A nutrient with no entry in the table falls back to its canonical English
 * name (FDA panel wording for the panel, USDA name for an extra) so a render
 * never produces a blank cell — the same slug-fallback spirit as
 * localizeErrand. Shipped locale tables are complete (the build tripwire
 * enforces full id coverage), so the fallback only fires for a locale whose
 * nutrient names are not yet sourced.
 */
export function localizeNutrients(food: Food, labels: NutrientLabels): LocalizedNutrient[] {
  const rows: LocalizedNutrient[] = [];
  for (const entry of LABEL_SET) {
    rows.push({
      id: entry.nutrientId,
      name: labels.nutrients[String(entry.nutrientId)] ?? entry.label,
      amount: food.nutrients[entry.key],
      unit: entry.unit,
    });
  }
  for (const row of food.remaining_nutrients ?? []) {
    rows.push({
      id: row.nutrientId,
      name: labels.nutrients[String(row.nutrientId)] ?? row.name,
      amount: row.amount,
      unit: row.unit,
    });
  }
  return rows;
}
