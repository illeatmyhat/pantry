import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GeneratedFood } from './assemble.js';
import { renderCoreDts, renderFullDts, renderIndexDts, renderIndexJs } from './emit-types.js';
import type { TarEntry } from './tarball.js';
import type { NutrientIndex } from '../toolkit/labels.js';

/**
 * Emits the generated module tree (DESIGN.md "The leaf/view law"):
 *
 *   sr/<slug>.js        core leaf (default export, plain data)
 *   sr/<slug>.extra.js  extra leaf
 *   sr/<slug>.full.js   VIEW — imports both leaves, inlines nothing
 *   manifest.json       slug ↔ fdc_id ↔ description (search CLI, aliases)
 *
 * Import-path routing (sr/<slug> → sr/<slug>.js, /full → .full.js) is the
 * package.json exports map's job, not the file layout's.
 *
 * coreEntries() is the source of truth; emit() materializes it loose for
 * dev/debug, build-packages.ts streams it into the publish tarball
 * without touching disk (decided 2026-06-12 — ~23k loose files were the
 * slowest possible I/O shape on Windows).
 */
/**
 * The package-level nutrient artifacts (DESIGN.md "name-keyed nutrient
 * access"): the typed `./nutrients` lookup index and the ambient `.d.ts` that
 * make `nutrients['tryptophan']` autocomplete. Passed by the publish build;
 * omitted by the loose dev/debug emit (which ships no exports map to wire them
 * into). `specifier` is the package's own name (the core self-references it);
 * `extraNames` is the 135 USDA names this core `/full` view keys.
 */
export interface CoreNutrientArtifacts {
  readonly specifier: string;
  readonly extraNames: readonly string[];
  readonly index: NutrientIndex;
}

export function* coreEntries(
  foods: readonly GeneratedFood[],
  nutrients?: CoreNutrientArtifacts,
): Generator<TarEntry> {
  for (const food of foods) {
    const { slug } = food.core;
    yield { path: `sr/${slug}.js`, data: dataModule(food.core) };
    yield { path: `sr/${slug}.extra.js`, data: dataModule(food.extra) };
    yield {
      path: `sr/${slug}.full.js`,
      data:
        `import core from './${slug}.js';\n` +
        `import extra from './${slug}.extra.js';\n` +
        // Self-contained merge — composes the leaves by reference (no bytes
        // inlined, no toolkit import): panel slugs + the 135 extras by name.
        // Mirrors the toolkit's assembleFull (tests/assemble-view.test.ts).
        `const nutrients = { ...core.nutrients };\n` +
        `for (const n of extra.remaining_nutrients) nutrients[n.name.toLowerCase()] = n.amount;\n` +
        `export default { ...core, ...extra, nutrients };\n`,
    };
  }
  const manifest = foods.map((f) => ({
    slug: f.core.slug,
    fdc_id: f.core.fdc_id,
    description: f.core.description,
    category: f.core.category,
  }));
  yield { path: 'manifest.json', data: `${JSON.stringify(manifest, null, 1)}\n` };

  if (nutrients !== undefined) {
    yield { path: 'nutrients.js', data: renderIndexJs(nutrients.index) };
    yield { path: 'nutrients.d.ts', data: renderIndexDts(nutrients.specifier, nutrients.index) };
    yield { path: 'types/core.d.ts', data: renderCoreDts(nutrients.specifier) };
    yield { path: 'types/full.d.ts', data: renderFullDts(nutrients.specifier, nutrients.extraNames) };
  }
}

export function emit(foods: readonly GeneratedFood[], outDir: string): void {
  const madeDirs = new Set<string>();
  for (const entry of coreEntries(foods)) {
    const filePath = join(outDir, entry.path);
    const dir = dirname(filePath);
    if (!madeDirs.has(dir)) {
      mkdirSync(dir, { recursive: true });
      madeDirs.add(dir);
    }
    writeFileSync(filePath, entry.data);
  }
}

function dataModule(data: unknown): string {
  // Pretty-printed so a leaf is legible when opened directly. Packaged size
  // is unaffected — the tarball gzips the whitespace away — and the loose
  // tree is dev/debug only. The composed views are reference-only and stay
  // as import+spread.
  return `export default ${JSON.stringify(data, null, 2)};\n`;
}
