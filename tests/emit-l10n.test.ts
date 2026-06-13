import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { emit } from '../src/generator/emit.js';
import { emitL10n } from '../src/generator/emit-l10n.js';
import type { GeneratedFood } from '../src/generator/assemble.js';
import type { Food } from '../src/toolkit/index.js';

const record = {
  slug: 'pork-cured-salt-pork-raw',
  fdc_id: 168287,
  description: 'Pork, cured, salt pork, raw',
  category: 'Pork Products',
  result: {
    brand: null,
    'en-US': {
      aliases: ['salt pork'],
      errand: { store: 'primary', section: 'meat_seafood' },
      notes: [],
    },
    'ja-JP': {
      name: '豚肉、塩蔵、ソルトポーク、生',
      aliases: ['ソルトポーク', '塩豚'],
      errand: { store: 'specialty', section: 'meat' },
      notes: ['日本では流通が少ない。'],
      corrected: ['name'], // internal review marker — must never ship
    },
  },
};

const outDir = mkdtempSync(join(tmpdir(), 'pantry-l10n-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

const TEST_LOCALES = [{ tag: 'en-US', canonical: true }, { tag: 'ja-JP' }, { tag: 'zh-CN' }];

describe('emitL10n', () => {
  it('emits a strings leaf per locale present on the record', async () => {
    emitL10n([record], outDir, TEST_LOCALES);
    const ja = (await import(
      pathToFileURL(join(outDir, 'l10n', 'ja-JP', 'sr', 'pork-cured-salt-pork-raw.strings.js')).href
    )) as { default: Record<string, unknown> };
    expect(ja.default).toEqual({
      locale: 'ja-JP',
      name: '豚肉、塩蔵、ソルトポーク、生',
      aliases: ['ソルトポーク', '塩豚'],
      errand: { store: 'specialty', section: 'meat' },
      notes: ['日本では流通が少ない。'],
    });
  });

  it('strips internal correction markers — corrections are invisible', () => {
    emitL10n([record], outDir, TEST_LOCALES);
    const source = readFileSync(
      join(outDir, 'l10n', 'ja-JP', 'sr', 'pork-cured-salt-pork-raw.strings.js'),
      'utf8',
    );
    expect(source).not.toContain('corrected');
  });

  it('gives the canonical locale its name mechanically from the description', async () => {
    emitL10n([record], outDir, TEST_LOCALES);
    const en = (await import(
      pathToFileURL(join(outDir, 'l10n', 'en-US', 'sr', 'pork-cured-salt-pork-raw.strings.js')).href
    )) as { default: { name: string } };
    expect(en.default.name).toBe('Pork, cured, salt pork, raw');
  });

  it('emits locale views that import leaves and inline nothing', () => {
    emitL10n([record], outDir, TEST_LOCALES);
    const view = readFileSync(
      join(outDir, 'l10n', 'ja-JP', 'sr', 'pork-cured-salt-pork-raw.js'),
      'utf8',
    );
    expect(view).toContain('import');
    expect(view).not.toContain('ソルトポーク'); // strings live in the leaf only
    expect(view).not.toContain('168287'); // core data lives in the core leaf only
    const full = readFileSync(
      join(outDir, 'l10n', 'ja-JP', 'sr', 'pork-cured-salt-pork-raw.full.js'),
      'utf8',
    );
    expect(full).toContain('extra');
  });

  it('ships errand: null verbatim — non-retail is data, not absence', async () => {
    const nonRetail = {
      slug: 'mcdonalds-hamburger',
      fdc_id: 170725,
      description: "McDONALD'S, Hamburger",
      result: {
        brand: "McDonald's",
        'en-US': { aliases: [], errand: null, notes: [] },
      },
    };
    emitL10n([nonRetail], outDir, TEST_LOCALES);
    const en = (await import(
      pathToFileURL(join(outDir, 'l10n', 'en-US', 'sr', 'mcdonalds-hamburger.strings.js')).href
    )) as { default: { errand: unknown } };
    expect(en.default.errand).toBeNull();
  });

  it('missing means missing: locales absent from the record are not emitted', () => {
    emitL10n([record], outDir, TEST_LOCALES);
    expect(() =>
      readFileSync(join(outDir, 'l10n', 'zh-CN', 'sr', 'pork-cured-salt-pork-raw.strings.js')),
    ).toThrow();
  });

  it('never emits stray result keys as locales — the table is the only locale source', () => {
    const strayKey = {
      slug: 'stray-key-food',
      fdc_id: 1,
      description: 'Stray',
      result: { brand: null, ja: { name: 'x', aliases: [], errand: null, notes: [] } },
    };
    emitL10n([strayKey], outDir, TEST_LOCALES);
    expect(() => readFileSync(join(outDir, 'l10n', 'ja', 'sr', 'stray-key-food.strings.js'))).toThrow();
  });

  it('throws when a non-canonical surface has no name — never leak the English description', () => {
    const nameless = {
      slug: 'nameless',
      fdc_id: 2,
      description: 'Nameless food',
      result: { brand: null, 'ja-JP': { aliases: [], errand: null, notes: [] } },
    };
    expect(() => emitL10n([nameless], outDir, TEST_LOCALES)).toThrow(/no name/);
  });

  it('throws when the canonical locale carries a generated name', () => {
    const paraphrased = {
      slug: 'paraphrased',
      fdc_id: 3,
      description: 'Real description',
      result: { brand: null, 'en-US': { name: 'A Paraphrase', aliases: [], errand: null, notes: [] } },
    };
    expect(() => emitL10n([paraphrased], outDir, TEST_LOCALES)).toThrow(/canonical/);
  });
});

describe('emitL10n /full localized nutrients (runtime)', () => {
  // A real core leaf + locale view: import the emitted /full module and read
  // the merged nutrients map, proving the generated inline merge keys panel
  // AND extra nutrients by localized name — the same result as the toolkit's
  // assembleFullLocalized.
  const dir = mkdtempSync(join(tmpdir(), 'pantry-l10n-full-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const SLUG = 'beef-chuck';
  const food: GeneratedFood = {
    core: {
      fdc_id: 9, slug: SLUG, description: 'Beef, chuck, raw', category: 'Beef',
      nutrients: {
        calories: 200, fat: 10, saturated_fat: null, trans_fat: null, cholesterol: null,
        sodium: null, carbohydrate: null, fiber: null, sugars: null, protein: 20,
        vitamin_d: null, calcium: null, iron: null, potassium: null,
      },
      density: null,
    },
    extra: {
      fdc_id: 9,
      ndb_number: '13020',
      remaining_nutrients: [{ nutrientId: 1210, name: 'Tryptophan', unit: 'G', amount: 0.05 }],
      portions: [],
      calorie_conversion_factor: null,
      protein_conversion_factor: null,
    },
  };
  const labels = {
    'ja-JP': {
      sections: {}, stores: {},
      nutrients: { '1003': 'たんぱく質', '1210': 'トリプトファン' },
      panel: { protein: 'たんぱく質' },
    },
  };
  const jaRecord = {
    slug: SLUG, description: 'Beef, chuck, raw',
    result: { 'ja-JP': { name: '牛肩肉', aliases: [], errand: null, notes: [] } },
  };

  it('keys the panel by slug AND localized name, extras by localized name', async () => {
    emit([food], dir);
    emitL10n([jaRecord], dir, [{ tag: 'ja-JP' }], { labels });
    const full = (await import(
      pathToFileURL(join(dir, 'l10n', 'ja-JP', 'sr', `${SLUG}.full.js`)).href
    )) as { default: Food };
    expect(full.default.nutrients.protein).toBe(20); // stable slug
    expect(full.default.nutrients['たんぱく質']).toBe(20); // localized panel
    expect(full.default.nutrients['トリプトファン']).toBe(0.05); // localized extra
    expect(full.default.name).toBe('牛肩肉'); // strings ride along
  });
});
