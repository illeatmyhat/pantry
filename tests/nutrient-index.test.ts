import { describe, expect, it } from 'vitest';
import { buildNutrientIndex, loadTagnames } from '../scripts/translate/nutrient-index.js';
import { loadDataset } from '../src/generator/load.js';
import { buildNutrientDictionary, canonicalNutrientNames } from '../src/generator/nutrient-dictionary.js';
import { loadLocaleNutrientNames } from '../scripts/translate/vocabulary.js';

const dict = [
  { id: 1003, name: 'Protein', unit: 'G', foods: 1, panel: true },
  { id: 1210, name: 'Tryptophan', unit: 'G', foods: 1, panel: false },
];
const tags = new Map([[1003, 'PROCNT'], [1210, 'TRP_G']]);
const en = { '1003': 'Protein', '1210': 'Tryptophan' };
const ja = { '1003': 'たんぱく質', '1210': 'トリプトファン' };

describe('buildNutrientIndex', () => {
  it('keys a nutrient by English name, localized name, tagname, and panel slug — all lowercased', () => {
    const { index } = buildNutrientIndex(dict, tags, en, ja);
    expect(index['tryptophan']!.id).toBe(1210); // English name
    expect(index['トリプトファン']!.id).toBe(1210); // localized name
    expect(index['trp_g']!.id).toBe(1210); // tagname, lowercased
    expect(index['protein']!.id).toBe(1003); // panel LabelKey slug
    expect(index['たんぱく質']).toEqual({ id: 1003, tagname: 'PROCNT', unit: 'G', name: 'たんぱく質' });
  });

  it('uses the localized name as the ref display name, en as fallback', () => {
    const { index } = buildNutrientIndex(dict, tags, en, ja);
    expect(index['trp_g']!.name).toBe('トリプトファン'); // localized
    const coreOnly = buildNutrientIndex(dict, tags, en); // no localized names
    expect(coreOnly.index['trp_g']!.name).toBe('Tryptophan'); // en fallback
  });

  it('drops a key that is ambiguous across two ids, never mis-resolving', () => {
    const clash = [
      { id: 10, name: 'Energy', unit: 'KCAL', foods: 1, panel: false },
      { id: 11, name: 'Energy', unit: 'kJ', foods: 1, panel: false },
    ];
    const { index, dropped } = buildNutrientIndex(clash, new Map(), { '10': 'Energy', '11': 'Energy' });
    expect(index['energy']).toBeUndefined();
    expect(dropped.some((d) => d.startsWith('energy'))).toBe(true);
  });
});

describe('buildNutrientIndex on the real dataset', () => {
  const dataset = loadDataset();
  const realDict = buildNutrientDictionary(dataset);
  const tagnames = loadTagnames();

  it('resolves a Japanese package by English, Japanese, tagname, and slug', () => {
    const { index } = buildNutrientIndex(
      realDict,
      tagnames,
      canonicalNutrientNames(dataset),
      loadLocaleNutrientNames('ja-JP'),
    );
    expect(index['tryptophan']!.id).toBe(1210);
    expect(index['トリプトファン']!.id).toBe(1210);
    expect(index['trp_g']!.id).toBe(1210);
    expect(index['protein']!.id).toBe(1003); // panel slug
    expect(index['saturated fat']!.id).toBe(1258); // FDA panel wording, lowercased
    expect(index['飽和脂肪酸']!.id).toBe(1258); // localized panel name
  });

  it('drops only ambiguous tagname keys; every display name still resolves uniquely', () => {
    const { index, dropped } = buildNutrientIndex(
      realDict,
      tagnames,
      canonicalNutrientNames(dataset),
      loadLocaleNutrientNames('ja-JP'),
    );
    // The only collisions are shared tagnames (Vitamin D IU/µg both = VITD; a
    // few fatty-acid isomers). The dropped KEY (before the " (id vs id)" note)
    // is always a single tagname token, never a multi-word display name.
    const droppedKeys = dropped.map((d) => d.split(' (')[0]);
    expect(droppedKeys.every((k) => !k!.includes(' '))).toBe(true);
    expect(index['vitd']).toBeUndefined(); // ambiguous tagname → dropped
    expect(index['vitamin d']!.id).toBe(1114); // …but names disambiguate
    expect(index['vitamin d (d2 + d3), international units']!.id).toBe(1110);
  });
});
