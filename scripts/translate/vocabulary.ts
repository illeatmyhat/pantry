import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { root } from './lib.js';
import type { LocaleSpec } from './locales.js';

/**
 * Builds the slug → display-label tables shipped in each locale package's
 * labels.js, so a consumer can render an errand's English slugs in the local
 * language: `labels.sections["meat"]` → 精肉, `labels.stores["primary"]` →
 * スーパー. Section labels come from the signage-verified, frozen vocabulary
 * (l10n/vocabulary/<tag>.yaml); store labels come from the locale table
 * (LocaleSpec.storeLabels — proposed, pending review). Coined off-vocabulary
 * sections (strays) have no label until adopted; a consumer falls back to
 * the slug.
 */
export interface ErrandLabels {
  readonly sections: Record<string, string>;
  readonly stores: Record<string, string>;
}

interface VocabEntry {
  readonly slug: string;
  readonly label: string;
}
interface VocabFile {
  readonly sections?: readonly VocabEntry[];
}

export function loadErrandLabels(spec: LocaleSpec): ErrandLabels {
  const doc = parse(
    readFileSync(`${root}l10n/vocabulary/${spec.tag}.yaml`, 'utf8'),
  ) as VocabFile;
  const sections = Object.fromEntries((doc.sections ?? []).map((e) => [e.slug, e.label]));
  return { sections, stores: { ...spec.storeLabels } };
}

/** The label tables for every locale, keyed by BCP-47 tag (for emit options). */
export function loadAllErrandLabels(locales: readonly LocaleSpec[]): Record<string, ErrandLabels> {
  return Object.fromEntries(locales.map((spec) => [spec.tag, loadErrandLabels(spec)]));
}
