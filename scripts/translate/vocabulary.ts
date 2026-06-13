import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { LABEL_SET } from '../../src/toolkit/food.js';
import { root } from './lib.js';
import type { LocaleSpec } from './locales.js';

/**
 * Builds the label tables shipped in each locale package's labels.js, so a
 * consumer can render English slugs/ids in the local language:
 * `labels.sections["meat"]` → 精肉, `labels.stores["primary"]` → スーパー,
 * `labels.nutrients["1003"]` → タンパク質.
 *
 * Errand labels (sections, stores) come from the signage-verified, frozen
 * vocabulary (l10n/vocabulary/<tag>.yaml) — one review surface, no localized
 * strings in code. Nutrient names come from the dataset for the canonical
 * locale (USDA + FDA wording, generated — pass `canonicalNutrients`) and from
 * l10n/nutrients/<tag>.yaml for every other locale (`{}` until sourced).
 * Coined off-vocabulary sections (strays) have no label until adopted; a
 * consumer falls back to the slug.
 */
export interface ErrandLabels {
  readonly sections: Record<string, string>;
  readonly stores: Record<string, string>;
  readonly nutrients: Record<string, string>;
  /** Panel slug → localized name (the 14 panel ids resolved through `nutrients`). */
  readonly panel: Record<string, string>;
}

interface VocabEntry {
  readonly slug: string;
  readonly label: string;
}
interface VocabFile {
  readonly sections?: readonly VocabEntry[];
  readonly stores?: Record<string, string>;
}

interface NutrientEntry {
  readonly id: number;
  readonly name: string;
}
interface NutrientFile {
  readonly nutrients?: readonly NutrientEntry[];
}

/**
 * id → localized nutrient name from l10n/nutrients/<tag>.yaml. Returns `{}`
 * when the file is absent or still pending (empty list) — the locale ships no
 * nutrient names yet, and the build tripwire treats empty as "not sourced".
 */
export function loadLocaleNutrientNames(tag: string): Record<string, string> {
  const path = `${root}l10n/nutrients/${tag}.yaml`;
  if (!existsSync(path)) return {};
  const doc = parse(readFileSync(path, 'utf8')) as NutrientFile;
  return Object.fromEntries((doc.nutrients ?? []).map((e) => [String(e.id), e.name]));
}

export function loadErrandLabels(
  spec: LocaleSpec,
  canonicalNutrients: Record<string, string>,
): ErrandLabels {
  const doc = parse(
    readFileSync(`${root}l10n/vocabulary/${spec.tag}.yaml`, 'utf8'),
  ) as VocabFile;
  const sections = Object.fromEntries((doc.sections ?? []).map((e) => [e.slug, e.label]));
  const nutrients =
    spec.canonical === true ? canonicalNutrients : loadLocaleNutrientNames(spec.tag);
  // Panel slug → localized name, derived from the id-keyed table so the /full
  // view can key a panel nutrient by its local name without the toolkit.
  const panel: Record<string, string> = {};
  for (const e of LABEL_SET) {
    const name = nutrients[String(e.nutrientId)];
    if (name !== undefined) panel[e.key] = name;
  }
  return { sections, stores: { ...(doc.stores ?? {}) }, nutrients, panel };
}

/**
 * The label tables for every locale, keyed by BCP-47 tag (for emit options).
 * `canonicalNutrients` is the generated en-US id → name map
 * (canonicalNutrientNames from the dataset); non-canonical locales read their
 * own l10n/nutrients/<tag>.yaml.
 */
export function loadAllErrandLabels(
  locales: readonly LocaleSpec[],
  canonicalNutrients: Record<string, string>,
): Record<string, ErrandLabels> {
  return Object.fromEntries(
    locales.map((spec) => [spec.tag, loadErrandLabels(spec, canonicalNutrients)]),
  );
}
