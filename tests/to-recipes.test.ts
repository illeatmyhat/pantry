import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
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
    expect(yaml).toContain('names: "豚肉、塩蔵、ソルトポーク、生"');
    expect(yaml).toContain('aisle: { store: specialty, section: meat }');
    expect(yaml).toContain('- text: "日本では流通が少ない。"');
    expect(yaml).not.toContain('corrected'); // internal marker never ships
  });

  it('renders primary store as a bare section (recipes convention)', () => {
    const yaml = toRecipesLocaleYaml(record, 'en-US', 'salt_pork', true);
    expect(yaml).toContain('aisle: meat_seafood');
    expect(yaml).not.toContain('store:');
  });

  it('omits aisle entirely for errand: null — recipes has no non-retail concept yet', () => {
    const nonRetail = {
      slug: 'mcdonalds-hamburger',
      fdc_id: 170725,
      description: "McDONALD'S, Hamburger",
      result: {
        brand: "McDonald's",
        'en-US': { aliases: [], errand: null, notes: [] },
      },
    };
    const yaml = toRecipesLocaleYaml(nonRetail, 'en-US', 'hamburger', true);
    expect(yaml).not.toContain('aisle');
  });

  it('uses the description as names for the canonical locale and omits empty availability', () => {
    const yaml = toRecipesLocaleYaml(record, 'en-US', 'salt_pork', true);
    expect(yaml).toContain('names: "Pork, cured, salt pork, raw"');
    expect(yaml).not.toContain('availability');
  });

  it('escapes YAML metacharacters in free text — colons and comments survive round-trip', () => {
    const tricky = {
      slug: 'tricky',
      fdc_id: 1,
      description: 'Tricky',
      result: {
        'en-US': {
          aliases: ['a: b', '# not a comment'],
          errand: { store: 'primary', section: 'condiments' },
          notes: ['Substitute: use thick-cut bacon # really'],
        },
      },
    };
    const yaml = toRecipesLocaleYaml(tricky, 'en-US', 'tricky', true);
    const parsed = parse(yaml) as {
      aliases: string[];
      availability: { notes: Array<{ text: string }> };
    };
    expect(parsed.aliases).toEqual(['a: b', '# not a comment']);
    expect(parsed.availability.notes[0]?.text).toBe('Substitute: use thick-cut bacon # really');
  });

  it('throws when a non-canonical surface has no name — never leak English into ja/zh', () => {
    const nameless = {
      slug: 'nameless',
      fdc_id: 2,
      description: 'Nameless',
      result: { 'ja-JP': { aliases: [], errand: null, notes: [] } },
    };
    expect(() => toRecipesLocaleYaml(nameless, 'ja-JP', 'x')).toThrow(/no name/);
  });
});
