import type { NutrientIndex } from '../toolkit/labels.js';

/**
 * Renders the per-package ambient type files that make name-keyed nutrient
 * access autocomplete in a consumer's editor (DESIGN.md "name-keyed nutrient
 * access", 2026-06-13). A package ships three `.d.ts` files wired into its
 * exports map's `types` condition:
 *
 *   types/core.d.ts   the `./sr/<slug>` view → `Food`
 *   types/full.d.ts   the `./sr/<slug>/full` → `Food` with the narrowed nutrients
 *   nutrients.d.ts    the `./nutrients`      → the typed lookup index
 *
 * The narrowing is an INTERSECTION with the open base (`NutrientAmounts` /
 * `NutrientIndex`), never a closed object: the literal members make the real
 * keys autocomplete while the base index signature keeps the value assignable
 * to `Food` (so `derive(saltPorkFull, …)` and every toolkit function still
 * accept it) and keeps dynamic string lookup legal. Keys are lowercased to
 * match the runtime merge (`name.toLowerCase()`), deduped (two USDA names can
 * lowercase-collide), and sorted for a stable, reviewable diff.
 *
 * The type reference resolves through the package's own name: the core package
 * self-references `@illeatmyhat/pantry` (the `.` export), a locale package
 * reaches the same types through its core peer. Both spell it the same way, so
 * the importing specifier is the only locale/core difference — core.d.ts is
 * byte-identical in every package.
 */
function quoteKey(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * The exact key set a `/full` map carries: raw nutrient names lowercased +
 * trimmed + deduped (two USDA names can lowercase-collide) + sorted. The single
 * source the type and the runtime share — `members()` renders the `.d.ts` from
 * it, and the emitted `nutrient-keys.js` leaf is `JSON.stringify` of it, so the
 * padded view keys and the declared members cannot drift.
 */
export function normalizeKeys(names: Iterable<string>): string[] {
  const keys = new Set<string>();
  for (const raw of names) {
    const key = raw.trim().toLowerCase();
    if (key !== '') keys.add(key);
  }
  return [...keys].sort();
}

/** `readonly 'key': <valueType>;` lines, lowercased + deduped + sorted. */
function members(names: Iterable<string>, valueType: string): string {
  return normalizeKeys(names)
    .map((k) => `    readonly ${quoteKey(k)}: ${valueType};`)
    .join('\n');
}

/** The `./sr/<slug>` view: a plain `Food`. Identical in core and every locale. */
export function renderCoreDts(specifier: string): string {
  return (
    `import type { Food } from '${specifier}';\n` +
    `declare const food: Food;\n` +
    `export default food;\n`
  );
}

/**
 * The `./sr/<slug>/full` view: `Food` whose `nutrients` additionally carries every
 * name the merged map keys. `extraNames` is the per-package list — the 135
 * USDA names for the core package, the 149 localized names (panel + extra) for
 * a locale package. The 14 panel slugs already type through `NutrientAmounts`.
 */
export function renderFullDts(specifier: string, extraNames: readonly string[]): string {
  return (
    `import type { Food, NutrientAmounts } from '${specifier}';\n` +
    `declare const food: Food & {\n` +
    `  readonly nutrients: NutrientAmounts & {\n` +
    `${members(extraNames, 'number | null')}\n` +
    `  };\n` +
    `};\n` +
    `export default food;\n`
  );
}

/**
 * The `./nutrients` index: the `NutrientIndex` lookup table with every key as a
 * literal member, so `nutrients['tryptophan']` autocompletes. Open (the base
 * `Record<string, NutrientRef>` index signature) so a runtime-string lookup
 * stays legal — the index's whole purpose.
 */
export function renderIndexDts(specifier: string, index: NutrientIndex): string {
  return (
    `import type { NutrientIndex, NutrientRef } from '${specifier}';\n` +
    `declare const nutrients: NutrientIndex & {\n` +
    `${members(Object.keys(index), 'NutrientRef')}\n` +
    `};\n` +
    `export default nutrients;\n`
  );
}

/** The shipped `nutrients.js`: the index object as a default export. */
export function renderIndexJs(index: NutrientIndex): string {
  return `export default ${JSON.stringify(index, null, 2)};\n`;
}
