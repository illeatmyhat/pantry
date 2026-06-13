import { describe, expect, it } from 'vitest';
import { buildNutrientDictionary, canonicalNutrientNames } from '../src/generator/nutrient-dictionary.js';
import { loadDataset } from '../src/generator/load.js';

const dataset = loadDataset();
const dict = buildNutrientDictionary(dataset);

describe('buildNutrientDictionary', () => {
  it('enumerates exactly the frozen 149 distinct nutrients — 14 panel + 135 extra', () => {
    expect(dict).toHaveLength(149);
    expect(dict.filter((e) => e.panel)).toHaveLength(14);
    expect(dict.filter((e) => !e.panel)).toHaveLength(135);
  });

  it('keys by stable USDA id, ascending, with USDA name + unit + coverage', () => {
    const ids = dict.map((e) => e.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids); // already ascending
    const protein = dict.find((e) => e.id === 1003);
    expect(protein).toMatchObject({ name: 'Protein', unit: 'G', panel: true, foods: 7793 });
    const tryptophan = dict.find((e) => e.id === 1210);
    expect(tryptophan).toMatchObject({ name: 'Tryptophan', unit: 'G', panel: false });
  });
});

describe('canonicalNutrientNames (the en-US slice of labels.nutrients)', () => {
  const names = canonicalNutrientNames(dataset);

  it('names every dictionary id', () => {
    expect(Object.keys(names)).toHaveLength(149);
    for (const entry of dict) expect(names[String(entry.id)]).toBeTruthy();
  });

  it('uses FDA panel wording for panel ids, USDA names for extras', () => {
    expect(names['1004']).toBe('Total Fat'); // USDA "Total lipid (fat)" → FDA label
    expect(names['1008']).toBe('Calories');
    expect(names['1210']).toBe('Tryptophan'); // extra: USDA name verbatim
  });
});
