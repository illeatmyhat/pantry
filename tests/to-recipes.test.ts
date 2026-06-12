import { describe, expect, it } from 'vitest';
import { toRecipesLocaleYaml } from '../scripts/translate/to-recipes.js';

const record = {
  slug: 'pork-cured-salt-pork-raw',
  fdc_id: 168287,
  description: 'Pork, cured, salt pork, raw',
  result: {
    brand: null,
    'ja-JP': {
      name: '豚肉、塩蔵、ソルトポーク、生',
      aliases: ['ソルトポーク'],
      errand: { store: 'specialty', section: 'meat' },
      notes: ['日本では流通が少ない。'],
      corrected: ['name'],
    },
    'en-US': {
      aliases: ['salt pork'],
      errand: { store: 'primary', section: 'meat_seafood' },
      notes: [],
    },
  },
};

describe('toRecipesLocaleYaml', () => {
  it('renders the recipes locale-file shape: names, aliases, aisle, availability', () => {
    const yaml = toRecipesLocaleYaml(record, 'ja-JP', 'salt_pork');
    expect(yaml).toContain('names: 豚肉、塩蔵、ソルトポーク、生');
    expect(yaml).toContain('aisle: { store: specialty, section: meat }');
    expect(yaml).toContain('- text: 日本では流通が少ない。');
    expect(yaml).not.toContain('corrected'); // internal marker never ships
  });

  it('renders primary store as a bare section (recipes convention)', () => {
    const yaml = toRecipesLocaleYaml(record, 'en-US', 'salt_pork');
    expect(yaml).toContain('aisle: meat_seafood');
    expect(yaml).not.toContain('store:');
  });

  it('uses the description as names for the canonical locale and omits empty availability', () => {
    const yaml = toRecipesLocaleYaml(record, 'en-US', 'salt_pork');
    expect(yaml).toContain('names: Pork, cured, salt pork, raw');
    expect(yaml).not.toContain('availability');
  });
});
