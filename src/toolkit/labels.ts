import type { Food } from './food.js';

/**
 * The slug → local-language label tables shipped as each locale package's
 * `./labels` export (labels.js). `sections` maps an errand section slug
 * (per-locale, e.g. 'meat') to its signage label (精肉); `stores` maps the
 * three `Errand.store` enum values to their local labels (スーパー / 専門店 /
 * 通販). Built from the frozen vocabulary (l10n/vocabulary/<tag>.yaml) — the
 * single review surface; no localized strings live in code.
 *
 *   import labels from '@illeatmyhat/pantry/l10n/ja-JP/labels';
 */
export interface ErrandLabels {
  readonly sections: Record<string, string>;
  readonly stores: Record<string, string>;
}

/** A food's errand resolved to display strings in the locale's language. */
export interface LocalizedErrand {
  readonly store: string;
  readonly section: string;
}

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
