import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GeneratedFood } from '../src/generator/assemble.js';
import { emit } from '../src/generator/emit.js';
import { emitL10n } from '../src/generator/emit-l10n.js';
import type { Food } from '../src/toolkit/index.js';

/**
 * The padding guarantee: a `/full` view emitted WITH the nutrient artifact (the
 * publish / `npm run build` path) carries every extra key the `.d.ts` declares,
 * `null` where SR has no row — so the `number | null` types are honest and an
 * absent nutrient never reads `undefined`. The loose-emit unit tests can't
 * cover this (no artifact, no keyspace), so this is its dedicated guard.
 */
const pkg = mkdtempSync(join(tmpdir(), 'pantry-full-padding-'));
afterAll(() => rmSync(pkg, { recursive: true, force: true }));

const SLUG = 'sparse-food';
const importDefault = async <T>(...segments: string[]): Promise<T> =>
  ((await import(pathToFileURL(join(pkg, ...segments)).href)) as { default: T }).default;

// A sparse food: one extra present (Tryptophan), Caffeine absent at runtime.
const food: GeneratedFood = {
  core: {
    fdc_id: 1, slug: SLUG, description: 'Sparse food', category: 'Test',
    nutrients: {
      calories: 10, fat: null, saturated_fat: null, trans_fat: null, cholesterol: null,
      sodium: null, carbohydrate: null, fiber: null, sugars: null, protein: 2,
      vitamin_d: null, calcium: null, iron: null, potassium: null,
    },
    density: null,
  },
  extra: {
    fdc_id: 1, ndb_number: '1',
    remaining_nutrients: [{ nutrientId: 1210, name: 'Tryptophan', unit: 'G', amount: 0.05 }],
    portions: [], calorie_conversion_factor: null, protein_conversion_factor: null,
  },
};

describe('core /full padding', () => {
  beforeAll(() => {
    // WITH the artifact — extraNames declares a nutrient (Caffeine) this food lacks.
    emit([food], pkg, { specifier: '@illeatmyhat/pantry', extraNames: ['Tryptophan', 'Caffeine'], index: {} });
  });

  it('pads an absent extra to null, not undefined', async () => {
    const full = await importDefault<Food>('sr', `${SLUG}.full.js`);
    expect(full.nutrients['tryptophan']).toBe(0.05); // present extra
    expect(full.nutrients['caffeine']).toBeNull(); // absent → null (the fix)
    expect('caffeine' in full.nutrients).toBe(true); // key is present
    expect(full.nutrients.calories).toBe(10); // panel rides along
  });
});

describe('localized /full padding', () => {
  const jaRecord = {
    slug: SLUG, description: 'Sparse food',
    result: { 'ja-JP': { name: 'スパースフード', aliases: [], errand: null, notes: [] } },
  };
  const labels = {
    'ja-JP': {
      sections: {}, stores: {},
      nutrients: { '1210': 'トリプトファン', '1057': 'カフェイン' },
      panel: {},
    },
  };

  beforeAll(() => {
    emit([food], pkg); // core leaves for the relative imports
    emitL10n([jaRecord], pkg, [{ tag: 'ja-JP' }], { labels });
  });

  it('pads an absent localized extra to null', async () => {
    const full = await importDefault<Food>('l10n', 'ja-JP', 'sr', `${SLUG}.full.js`);
    expect(full.nutrients['トリプトファン']).toBe(0.05); // present localized extra
    expect(full.nutrients['カフェイン']).toBeNull(); // absent localized extra → null
    expect('カフェイン' in full.nutrients).toBe(true);
  });
});
