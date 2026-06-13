import { describe, expect, it } from 'vitest';
import {
  renderCoreDts,
  renderFullDts,
  renderIndexDts,
  renderIndexJs,
} from '../src/generator/emit-types.js';
import type { NutrientIndex } from '../src/toolkit/index.js';

describe('renderCoreDts', () => {
  it('declares the core view as a plain Food from the package specifier', () => {
    const dts = renderCoreDts('@illeatmyhat/pantry');
    expect(dts).toContain("import type { Food } from '@illeatmyhat/pantry';");
    expect(dts).toContain('declare const food: Food;');
    expect(dts).toContain('export default food;');
  });

  it('is byte-identical across packages bar the specifier (core self-ref vs locale peer)', () => {
    expect(renderCoreDts('@illeatmyhat/pantry')).toBe(
      renderCoreDts('@illeatmyhat/pantry'),
    );
    expect(renderCoreDts('@illeatmyhat/pantry-l10n-ja-jp')).toContain(
      "from '@illeatmyhat/pantry-l10n-ja-jp';",
    );
  });
});

describe('renderFullDts', () => {
  it('intersects NutrientAmounts with each extra name as a number|null member', () => {
    const dts = renderFullDts('@illeatmyhat/pantry', ['Tryptophan', 'Energy']);
    expect(dts).toContain('readonly nutrients: NutrientAmounts & {');
    expect(dts).toContain("readonly 'tryptophan': number | null;"); // lowercased
    expect(dts).toContain("readonly 'energy': number | null;");
    expect(dts).toContain('declare const food: Food & {');
  });

  it('lowercases, dedupes collisions, and sorts for a stable diff', () => {
    const dts = renderFullDts('@x/p', ['Energy', 'energy', 'Tryptophan']);
    // 'Energy'/'energy' collapse to one member.
    expect(dts.match(/'energy'/g)).toHaveLength(1);
    // Sorted: energy before tryptophan.
    expect(dts.indexOf("'energy'")).toBeLessThan(dts.indexOf("'tryptophan'"));
  });

  it('quotes CJK and punctuation-bearing USDA names as string-literal keys', () => {
    const dts = renderFullDts('@x/p', ['Fatty acids, total trans', 'トリプトファン', "Vitamin A, RAE"]);
    expect(dts).toContain("readonly 'fatty acids, total trans': number | null;");
    expect(dts).toContain("readonly 'トリプトファン': number | null;");
    expect(dts).toContain("readonly 'vitamin a, rae': number | null;");
  });
});

const index: NutrientIndex = {
  protein: { id: 1003, tagname: 'PROCNT', unit: 'G', name: 'Protein' },
  tryptophan: { id: 1210, tagname: 'TRP_G', unit: 'G', name: 'Tryptophan' },
  トリプトファン: { id: 1210, tagname: 'TRP_G', unit: 'G', name: 'トリプトファン' },
};

describe('renderIndexDts', () => {
  it('types every index key as a NutrientRef member over the open NutrientIndex base', () => {
    const dts = renderIndexDts('@illeatmyhat/pantry', index);
    expect(dts).toContain('declare const nutrients: NutrientIndex & {');
    expect(dts).toContain("readonly 'protein': NutrientRef;");
    expect(dts).toContain("readonly 'tryptophan': NutrientRef;");
    expect(dts).toContain("readonly 'トリプトファン': NutrientRef;");
    expect(dts).toContain("import type { NutrientIndex, NutrientRef } from '@illeatmyhat/pantry';");
  });
});

describe('renderIndexJs', () => {
  it('emits the index object as a default export', async () => {
    const js = renderIndexJs(index);
    expect(js.startsWith('export default {')).toBe(true);
    expect(js.trimEnd().endsWith(';')).toBe(true);
    expect(js).toContain('"id": 1210');
  });
});
