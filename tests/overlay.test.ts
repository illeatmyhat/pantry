import { describe, expect, it } from 'vitest';
import { loadOverlay } from '../src/toolkit/index.js';
import type { Food } from '../src/toolkit/index.js';

const saltPork: Food = {
  fdc_id: 167914,
  slug: 'pork-cured-salt-pork-raw',
  description: 'Pork, cured, salt pork, raw',
  nutrients: {
    calories: 748, fat: 80.5, saturated_fat: 29.4, trans_fat: null,
    cholesterol: 86, sodium: 2684, carbohydrate: 0, fiber: 0, sugars: null,
    protein: 5.05, vitamin_d: null, calcium: 5, iron: 0.26, potassium: 66,
  },
  density: null,
};

const resolve = (ref: string): Food => {
  if (ref === 'pork-cured-salt-pork-raw') return saltPork;
  throw new Error(`unknown ref ${ref}`);
};

describe('loadOverlay', () => {
  it('derives entries with a source, defaulting name to the entry key', async () => {
    const overlay = await loadOverlay(
      `
guanciale:
  source: pork-cured-salt-pork-raw
  density_g_per_ml: 0.9
  nutrients:
    sodium: 1600
  basis: cured-jowl correction
`,
      { resolve },
    );
    const guanciale = overlay.get('guanciale');
    expect(guanciale?.name).toBe('guanciale');
    expect(guanciale?.nutrients.sodium).toBe(1600);
    expect(guanciale?.density?.density_g_per_ml).toBe(0.9);
    expect(guanciale?.provenance?.source?.fdc_id).toBe(167914);
  });

  it('defines entries without a source via defineFood', async () => {
    const overlay = await loadOverlay(
      `
shio-koji:
  name: shio koji
  nutrients:
    sodium: 9000
  basis: producer labels, averaged
`,
      { resolve },
    );
    const food = overlay.get('shio-koji');
    expect(food?.name).toBe('shio koji');
    expect(food?.provenance?.source).toBeNull();
  });

  it('stacks: later overlays win per key', async () => {
    const base = `
guanciale:
  source: pork-cured-salt-pork-raw
  basis: proxy
`;
    const local = `
guanciale:
  source: pork-cured-salt-pork-raw
  nutrients:
    sodium: 1500
  basis: my butcher's label
`;
    const overlay = await loadOverlay([base, local], { resolve });
    expect(overlay.get('guanciale')?.nutrients.sodium).toBe(1500);
  });

  it('rejects unknown fields — YAML typos must not pass silently', async () => {
    await expect(
      loadOverlay(`x:\n  source: pork-cured-salt-pork-raw\n  densty_g_per_ml: 0.9\n`, { resolve }),
    ).rejects.toThrow(/densty_g_per_ml/);
  });

  it('enforces basis through the same gate as the API', async () => {
    await expect(
      loadOverlay(`x:\n  source: pork-cured-salt-pork-raw\n  density_g_per_ml: 0.9\n`, { resolve }),
    ).rejects.toThrow(/basis/i);
  });
});
