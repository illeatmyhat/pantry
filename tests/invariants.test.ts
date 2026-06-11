import { describe, expect, it } from 'vitest';
import { assemble } from '../src/generator/assemble.js';
import { loadDataset } from '../src/generator/load.js';
import { LABEL_KEYS } from '../src/generator/label-set.js';

/**
 * The invariant suite (DESIGN.md "Generation, trust, versioning"), run
 * against the real vendored zip. The dataset is retired — every number here
 * is pinned EXACTLY. Any drift is a generator bug, never new data.
 */
const foods = assemble(loadDataset());

describe('invariants: identity', () => {
  it('emits exactly 7,793 foods with unique slugs', () => {
    expect(foods).toHaveLength(7793);
    expect(new Set(foods.map((f) => f.core.slug)).size).toBe(7793);
  });

  it('resolves the pancake collision with -<fdcId> on both colliders', () => {
    const bySlug = new Map(foods.map((f) => [f.core.slug, f.core.fdc_id]));
    expect(bySlug.get('pancakes-whole-wheat-dry-mix-incomplete-171853')).toBe(171853);
    expect(bySlug.get('pancakes-whole-wheat-dry-mix-incomplete-172776')).toBe(172776);
    expect(bySlug.has('pancakes-whole-wheat-dry-mix-incomplete')).toBe(false);
  });

  it('keeps every slug non-empty kebab ASCII', () => {
    for (const f of foods) {
      expect(f.core.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('invariants: label set', () => {
  it('every core is structurally complete (all 14 keys present)', () => {
    for (const f of foods) {
      expect(Object.keys(f.core.nutrients)).toHaveLength(LABEL_KEYS.length);
    }
  });

  it('calories, protein, fat, carbohydrate are non-null for every food', () => {
    for (const f of foods) {
      expect(f.core.nutrients.calories, f.core.slug).not.toBeNull();
      expect(f.core.nutrients.protein, f.core.slug).not.toBeNull();
      expect(f.core.nutrients.fat, f.core.slug).not.toBeNull();
      expect(f.core.nutrients.carbohydrate, f.core.slug).not.toBeNull();
    }
  });

  it('label rows live in core only — extra holds the remainder, losing nothing', () => {
    const labelIds = new Set([1008, 1004, 1258, 1257, 1253, 1093, 1005, 1079, 2000, 1003, 1114, 1087, 1089, 1092]);
    for (const f of foods) {
      for (const row of f.extra.remaining_nutrients) {
        expect(labelIds.has(row.nutrientId)).toBe(false);
      }
    }
  });
});

describe('invariants: density', () => {
  const derived = foods.filter((f) => f.core.density !== null);

  it('derives density for exactly 2,344 foods', () => {
    expect(derived).toHaveLength(2344);
  });

  it('every derived density sits inside the frozen envelope (0.013, 1.97)', () => {
    for (const f of derived) {
      const d = f.core.density?.density_g_per_ml ?? Number.NaN;
      expect(d, f.core.slug).toBeGreaterThan(0.013);
      expect(d, f.core.slug).toBeLessThan(1.97);
    }
  });

  it('every citation points at a portion row of the same food', () => {
    for (const f of derived) {
      const cited = f.core.density?.citation.portionId;
      expect(
        f.extra.portions.some((p) => p.id === cited),
        `${f.core.slug} cites ${cited}`,
      ).toBe(true);
    }
  });
});

describe('invariants: portions parse', () => {
  it('every portion row has finite non-negative numbers', () => {
    for (const f of foods) {
      for (const p of f.extra.portions) {
        expect(Number.isFinite(p.amount), `${f.core.slug} #${p.id}`).toBe(true);
        expect(Number.isFinite(p.gramWeight), `${f.core.slug} #${p.id}`).toBe(true);
        expect(p.gramWeight, `${f.core.slug} #${p.id}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
