import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { coreEntries } from '../src/generator/emit.js';
import { localeEntries } from '../src/generator/emit-l10n.js';
import type { NutrientIndex } from '../src/toolkit/index.js';

const index: NutrientIndex = {
  protein: { id: 1003, tagname: 'PROCNT', unit: 'G', name: 'Protein' },
  tryptophan: { id: 1210, tagname: 'TRP_G', unit: 'G', name: 'Tryptophan' },
  トリプトファン: { id: 1210, tagname: 'TRP_G', unit: 'G', name: 'トリプトファン' },
};
const paths = (entries: { path: string }[]): string[] => entries.map((e) => e.path);
const NUTRIENT_FILES = ['nutrients.js', 'nutrients.d.ts', 'types/core.d.ts', 'types/full.d.ts'];

const dir = mkdtempSync(join(tmpdir(), 'pantry-nutrients-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('coreEntries nutrient artifacts', () => {
  it('yields the index + type files only when given the artifacts', () => {
    const withNut = paths([
      ...coreEntries([], { specifier: '@illeatmyhat/pantry', extraNames: ['Tryptophan'], index }),
    ]);
    for (const f of NUTRIENT_FILES) expect(withNut).toContain(f);
    const without = paths([...coreEntries([])]);
    for (const f of NUTRIENT_FILES) expect(without).not.toContain(f);
  });

  it('emits a runtime-importable nutrients.js that resolves a name to its ref', async () => {
    const entry = [...coreEntries([], { specifier: '@x/p', extraNames: [], index })].find(
      (e) => e.path === 'nutrients.js',
    );
    const file = join(dir, 'nutrients.js');
    writeFileSync(file, entry!.data);
    const mod = (await import(pathToFileURL(file).href)) as { default: NutrientIndex };
    expect(mod.default['tryptophan']!.id).toBe(1210);
    expect(mod.default['トリプトファン']!.name).toBe('トリプトファン');
  });
});

describe('localeEntries nutrient artifacts', () => {
  const opts = (extra: object) => ({
    nutrients: { 'ja-JP': { extraNames: ['トリプトファン'], index } },
    ...extra,
  });

  it('emits the type files only alongside a coreSpecifier (the split build)', () => {
    const single = paths([...localeEntries([], { tag: 'ja-JP' }, opts({}))]);
    for (const f of NUTRIENT_FILES) expect(single).not.toContain(f); // no peer to import types from
    const split = paths([
      ...localeEntries([], { tag: 'ja-JP' }, opts({ coreSpecifier: '@illeatmyhat/pantry' })),
    ]);
    for (const f of NUTRIENT_FILES) expect(split).toContain(f);
  });

  it("imports the toolkit types from the core peer, never self-references", () => {
    const dts = [
      ...localeEntries([], { tag: 'ja-JP' }, opts({ coreSpecifier: '@illeatmyhat/pantry' })),
    ].find((e) => e.path === 'types/full.d.ts');
    expect(dts!.data).toContain("from '@illeatmyhat/pantry';"); // core peer, not the locale name
  });
});
