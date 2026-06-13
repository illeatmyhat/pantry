import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/generator/load.js';
import { buildNutrientDictionary, canonicalNutrientNames } from '../src/generator/nutrient-dictionary.js';
import { loadAllErrandLabels } from '../scripts/translate/vocabulary.js';
import { LOCALES } from '../scripts/translate/locales.js';

const dataset = loadDataset();
const dictIds = new Set(buildNutrientDictionary(dataset).map((e) => String(e.id)));
const labels = loadAllErrandLabels(LOCALES, canonicalNutrientNames(dataset));

describe('nutrient label coverage tripwire', () => {
  it('the canonical locale names every dataset nutrient id, exactly', () => {
    const canonical = LOCALES.find((l) => l.canonical === true);
    if (canonical === undefined) throw new Error('no canonical locale');
    const ids = new Set(Object.keys(labels[canonical.tag]?.nutrients ?? {}));
    expect(ids).toEqual(dictIds);
  });

  it('every locale nutrient table is either empty (pending) or exactly the dataset id set', () => {
    // A non-empty table that drifts from the dataset ids (a gap, or a stale id)
    // is a sourcing bug — fail loudly rather than ship a partial panel.
    for (const spec of LOCALES) {
      const ids = Object.keys(labels[spec.tag]?.nutrients ?? {});
      if (ids.length === 0) continue; // pending — not yet sourced
      expect(new Set(ids)).toEqual(dictIds);
    }
  });
});
