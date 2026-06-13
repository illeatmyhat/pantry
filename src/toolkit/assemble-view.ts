import type { ExtraNutrient, Food, NutrientAmounts } from './food.js';
import { LABEL_SET } from './food.js';

/**
 * The `/full` view's runtime assembler. A full view composes the core and
 * extra leaves by reference (the leaf/view law — nothing is inlined) and
 * exposes a single name-keyed `nutrients` map so a consumer can read any of
 * the 149 nutrients by name:
 *
 *   saltPorkFull.nutrients['tryptophan']   // → 0.05
 *   saltPorkFull.nutrients.protein         // → 5.05  (panel slug kept)
 *
 * The panel keeps its 14 `LabelKey` slugs; the 135 extras are added keyed by
 * their lowercased USDA name. Amounts are not duplicated in storage — the
 * extra leaf holds them once as `remaining_nutrients`; this merge happens at
 * import. The precise key union (for autocomplete) is supplied by the
 * package's generated ambient `.d.ts`.
 */
interface ExtraLeaf {
  readonly remaining_nutrients?: readonly ExtraNutrient[];
}

export function assembleFull(core: Food, extra: ExtraLeaf & Record<string, unknown>): Food {
  const nutrients: Record<string, number | null> = { ...core.nutrients };
  for (const n of extra.remaining_nutrients ?? []) {
    nutrients[n.name.toLowerCase()] = n.amount;
  }
  // The 14 panel keys come in via the core.nutrients spread.
  return { ...core, ...extra, nutrients: nutrients as NutrientAmounts };
}

/**
 * The localized `/full` assembler. Same composition, but the nutrient keys are
 * this locale's names (from the shipped `labels.nutrients`, id → localized
 * name) on top of the stable panel slugs — so a Japanese consumer reads
 * `nutrients['トリプトファン']` and `nutrients['protein']` alike. The food's
 * locale name/aliases/errand/notes ride in via `strings`.
 */
interface NutrientNameTable {
  readonly nutrients: Record<string, string>;
}

export function assembleFullLocalized(
  core: Food,
  extra: ExtraLeaf & Record<string, unknown>,
  strings: Record<string, unknown>,
  labels: NutrientNameTable,
): Food {
  const nutrients: Record<string, number | null> = {};
  for (const entry of LABEL_SET) {
    nutrients[entry.key] = core.nutrients[entry.key]; // stable panel slug
    const localized = labels.nutrients[String(entry.nutrientId)];
    if (localized !== undefined) nutrients[localized.toLowerCase()] = core.nutrients[entry.key];
  }
  for (const n of extra.remaining_nutrients ?? []) {
    const localized = labels.nutrients[String(n.nutrientId)];
    nutrients[(localized ?? n.name).toLowerCase()] = n.amount;
  }
  return { ...core, ...extra, ...strings, nutrients: nutrients as NutrientAmounts };
}
