import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { emit } from '../src/generator/emit.js';
import type { GeneratedFood } from '../src/generator/assemble.js';

const saltPork: GeneratedFood = {
  core: {
    fdc_id: 167914,
    slug: 'pork-cured-salt-pork-raw',
    description: 'Pork, cured, salt pork, raw',
    category: 'Pork Products',
    nutrients: {
      calories: 748,
      fat: 80.5,
      saturated_fat: 29.4,
      trans_fat: null,
      cholesterol: 86,
      sodium: 2684,
      carbohydrate: 0,
      fiber: 0,
      sugars: null,
      protein: 5.05,
      vitamin_d: null,
      calcium: 5,
      iron: 0.26,
      potassium: 66,
    },
    density: null,
  },
  extra: {
    fdc_id: 167914,
    ndb_number: '10165',
    remaining_nutrients: [{ nutrientId: 1062, name: 'Energy', unit: 'kJ', amount: 3127 }],
    portions: [
      { id: 1, amount: 1, unitName: 'undetermined', portionDescription: '', modifier: 'oz', gramWeight: 28.35 },
    ],
    calorie_conversion_factor: { protein: 4.27, fat: 9.02, carbohydrate: 3.87 },
    protein_conversion_factor: 6.25,
  },
};

const outDir = mkdtempSync(join(tmpdir(), 'pantry-emit-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('emit', () => {
  it('writes importable core, extra, and full modules per food', async () => {
    emit([saltPork], outDir);

    const core = (await import(pathToFileURL(join(outDir, 'sr', 'pork-cured-salt-pork-raw.js')).href)) as {
      default: typeof saltPork.core;
    };
    expect(core.default).toEqual(saltPork.core);

    const full = (await import(pathToFileURL(join(outDir, 'sr', 'pork-cured-salt-pork-raw.full.js')).href)) as {
      default: typeof saltPork.core & typeof saltPork.extra;
    };
    expect(full.default).toEqual({ ...saltPork.core, ...saltPork.extra });
  });

  it('keeps full a view: imports only, no data bytes inlined', () => {
    emit([saltPork], outDir);
    const source = readFileSync(join(outDir, 'sr', 'pork-cured-salt-pork-raw.full.js'), 'utf8');
    expect(source).toContain("import");
    expect(source).not.toContain('2684'); // sodium lives in the core leaf only
    expect(source).not.toContain('10165'); // ndb number lives in the extra leaf only
  });

  it('writes a manifest mapping slug ↔ fdc_id ↔ description', () => {
    emit([saltPork], outDir);
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) as unknown;
    expect(manifest).toEqual([
      {
        slug: 'pork-cured-salt-pork-raw',
        fdc_id: 167914,
        description: 'Pork, cured, salt pork, raw',
        category: 'Pork Products',
      },
    ]);
  });
});
