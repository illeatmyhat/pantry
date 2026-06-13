import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { LABEL_SET } from '../../src/toolkit/food.js';
import type { NutrientIndex, NutrientRef } from '../../src/toolkit/labels.js';
import type { NutrientDictEntry } from '../../src/generator/nutrient-dictionary.js';
import { root } from './lib.js';

/**
 * Builds the shipped `nutrients` index — every nutrient reachable by name in
 * the user's language, by English name, or by INFOODS tagname. The keys are
 * lowercased (Latin) / as-is (CJK), so `nutrients['tryptophan']`,
 * `nutrients['トリプトファン']`, and `nutrients['trp_g']` all resolve to the
 * same ref (case-sensitive object index, by decision 2026-06-13). en-US names
 * key every locale (an English speaker can search a Japanese package); the
 * locale's own names are added on top.
 *
 * Names are already unique/qualified in the source data (`Energy` vs
 * `Calories`, `Vitamin A, RAE` vs `Vitamin A, IU`, the four folate forms), so
 * no bare ambiguous tokens are synthesized; the rare key that does collide
 * across two ids is dropped entirely (never silently mis-resolved) and
 * reported.
 */

/** id → INFOODS tagname, from the locale-independent registry. */
export function loadTagnames(): Map<number, string> {
  const doc = parse(readFileSync(`${root}l10n/nutrients/tagnames.yaml`, 'utf8')) as {
    tagnames?: Record<string, string>;
  };
  return new Map(Object.entries(doc.tagnames ?? {}).map(([k, v]) => [Number(k), v]));
}

const PANEL_SLUG = new Map(LABEL_SET.map((e) => [e.nutrientId, e.key]));
const norm = (s: string): string => s.trim().toLowerCase();

export function buildNutrientIndex(
  dict: readonly NutrientDictEntry[],
  tagnames: Map<number, string>,
  enNames: Record<string, string>,
  localizedNames: Record<string, string> = {},
): { index: NutrientIndex; dropped: string[] } {
  const index: Record<string, NutrientRef> = {};
  const owner = new Map<string, number>(); // key → id, or -1 once conflicted
  const dropped: string[] = [];

  const add = (rawKey: string, ref: NutrientRef): void => {
    const key = rawKey.trim();
    if (key === '') return;
    const existing = owner.get(key);
    if (existing === undefined) {
      owner.set(key, ref.id);
      index[key] = ref;
    } else if (existing !== ref.id && existing !== -1) {
      delete index[key]; // ambiguous across two ids — drop, never mis-resolve
      owner.set(key, -1);
      dropped.push(`${key} (${existing} vs ${ref.id})`);
    }
  };

  for (const entry of dict) {
    const tagname = tagnames.get(entry.id) ?? '';
    const en = enNames[String(entry.id)];
    const local = localizedNames[String(entry.id)];
    const ref: NutrientRef = {
      id: entry.id,
      tagname,
      unit: entry.unit,
      name: local ?? en ?? entry.name,
    };
    if (en !== undefined) add(norm(en), ref);
    if (local !== undefined) add(norm(local), ref);
    if (tagname !== '') add(norm(tagname), ref);
    const slug = PANEL_SLUG.get(entry.id);
    if (slug !== undefined) add(slug, ref);
  }

  return { index, dropped };
}
