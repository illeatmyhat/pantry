import { describe, expect, it } from 'vitest';
import { localeEntries } from '../src/generator/emit-l10n.js';
import { loadErrandLabels } from '../scripts/translate/vocabulary.js';
import { LOCALES } from '../scripts/translate/locales.js';

const record = {
  slug: 'beef-chuck',
  description: 'Beef, chuck for stew, raw',
  result: {
    'ja-JP': {
      name: '牛肉、肩、シチュー用、生',
      aliases: ['牛シチュー用肉'],
      errand: { store: 'primary', section: 'meat' },
      notes: [],
    },
  },
};

const labels = {
  'ja-JP': {
    sections: { meat: '精肉', produce: '青果' },
    stores: { primary: 'スーパー', specialty: '専門店', online: '通販' },
    nutrients: { '1003': 'タンパク質' },
  },
};

describe('localeEntries labels.js', () => {
  it('emits a labels.js with the slug → label tables when a table is provided', () => {
    const entries = [...localeEntries([record], { tag: 'ja-JP' }, { labels })];
    const labelsEntry = entries.find((e) => e.path === 'labels.js');
    expect(labelsEntry).toBeDefined();
    expect(labelsEntry?.data).toContain('"meat": "精肉"');
    expect(labelsEntry?.data).toContain('"primary": "スーパー"');
    expect(labelsEntry?.data).toContain('"1003": "タンパク質"'); // nutrient names fold into the same table
  });

  it('emits no labels.js when no table is provided for the locale', () => {
    const entries = [...localeEntries([record], { tag: 'ja-JP' }, {})];
    expect(entries.find((e) => e.path === 'labels.js')).toBeUndefined();
  });

  it('emits labels.js exactly once per locale, not per food', () => {
    const two = [record, { ...record, slug: 'beef-round' }];
    const entries = [...localeEntries(two, { tag: 'ja-JP' }, { labels })];
    expect(entries.filter((e) => e.path === 'labels.js')).toHaveLength(1);
  });

  it('the /full view keys extra nutrients by localized name via labels.js', () => {
    const entries = [...localeEntries([record], { tag: 'ja-JP' }, { labels })];
    const full = entries.find((e) => e.path === 'sr/beef-chuck.full.js');
    expect(full?.data).toContain("import labels from '../labels.js'");
    expect(full?.data).toContain('labels.nutrients[n.nutrientId]');
    expect(full?.data).toContain('...strings, nutrients }');
  });
});

describe('loadErrandLabels', () => {
  const ja = LOCALES.find((l) => l.tag.startsWith('ja'));
  const en = LOCALES.find((l) => l.canonical === true);

  it('reads frozen section and store labels both from the vocabulary YAML', () => {
    if (ja === undefined) return;
    const out = loadErrandLabels(ja, {});
    expect(out.sections['meat']).toBe('精肉'); // frozen signage label
    expect(out.stores['primary']).toBe('スーパー'); // store label now in the same frozen YAML
    expect(Object.keys(out.stores)).toEqual(['primary', 'specialty', 'online']);
  });

  it('takes nutrient names from the dataset for the canonical locale, from YAML otherwise', () => {
    if (ja === undefined || en === undefined) return;
    const canonical = { '1003': 'Protein', '1210': 'Tryptophan' };
    expect(loadErrandLabels(en, canonical).nutrients).toEqual(canonical); // canonical → generated
    const jaNutrients = loadErrandLabels(ja, canonical).nutrients;
    expect(jaNutrients['1003']).toBe('たんぱく質'); // ja-JP → its own YAML, never the en names
    expect(jaNutrients['1003']).not.toBe(canonical['1003']);
  });
});
