import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coreEntries } from '../src/generator/emit.js';
import { localeEntries } from '../src/generator/emit-l10n.js';
import { localePackageJson, patchCorePackage } from '../src/generator/emit-packages.js';
import { loadDataset } from '../src/generator/load.js';
import {
  buildNutrientDictionary,
  canonicalNutrientNames,
  coreFullNutrientNames,
  localeFullNutrientNames,
} from '../src/generator/nutrient-dictionary.js';
import type { GeneratedFood } from '../src/generator/assemble.js';
import { buildNutrientIndex, loadTagnames } from './translate/nutrient-index.js';
import { loadErrandLabels, loadLocaleNutrientNames } from './translate/vocabulary.js';
import { LOCALES } from './translate/locales.js';
import { root } from './translate/lib.js';

/**
 * Proves the generated nutrient types resolve in a REAL installed consumer —
 * not just that the .d.ts strings are well-formed (the unit tests cover that),
 * but that the exports-map `types` condition routes a subpath import to the
 * right ambient .d.ts and that file typechecks against the real toolkit types.
 *
 * It emits a core package (self-referencing `@illeatmyhat/pantry`) and a ja-JP
 * locale package (reaching the toolkit types through its core peer) with the
 * real emitters and package.json builders, copies the real `dist/toolkit`
 * types in, then runs `tsc` over a consumer that imports slug / full / index
 * routes from both — including `@ts-expect-error` probes that fail loudly if a
 * route resolves to `any`. Run before publish:
 *
 *   npm run verify:types
 */
if (!existsSync(join(root, 'dist', 'toolkit', 'index.d.ts'))) {
  throw new Error('dist/toolkit missing — run `npm run build:toolkit` first (verify:types chains it).');
}

const dataset = loadDataset();
const dict = buildNutrientDictionary(dataset);
const tagnames = loadTagnames();
const enNames = canonicalNutrientNames(dataset);
const ja = LOCALES.find((l) => l.tag === 'ja-JP');
if (ja === undefined) throw new Error('ja-JP locale missing from the table.');
const coreName = '@illeatmyhat/pantry';

const SLUG = 'pork-cured-salt-pork-raw';
const food: GeneratedFood = {
  core: {
    fdc_id: 168287, slug: SLUG, description: 'Pork, cured, salt pork, raw', category: 'Pork Products',
    nutrients: {
      calories: 748, fat: 80.5, saturated_fat: 29.4, trans_fat: null, cholesterol: 86,
      sodium: 2684, carbohydrate: 0, fiber: 0, sugars: null, protein: 5.05,
      vitamin_d: null, calcium: 5, iron: 0.26, potassium: 66,
    },
    density: null,
  },
  extra: {
    fdc_id: 168287, ndb_number: '10165',
    remaining_nutrients: [{ nutrientId: 1210, name: 'Tryptophan', unit: 'G', amount: 0.05 }],
    portions: [], calorie_conversion_factor: null, protein_conversion_factor: null,
  },
};

const work = mkdtempSync(join(tmpdir(), 'pantry-verify-types-'));
const scope = join(work, 'consumer', 'node_modules', '@illeatmyhat');
mkdirSync(scope, { recursive: true });
const plan = { coreName, version: '0.0.0', manifest: [{ slug: SLUG, fdc_id: 168287 }], locales: [{ tag: 'ja-JP' }] };

function writeEntries(dir: string, prefix: string, entries: Iterable<{ path: string; data: string }>): void {
  for (const e of entries) {
    const p = join(dir, prefix, e.path);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, e.data);
  }
}

// Core package: self-referencing types, real dist/toolkit, nutrient index + .d.ts.
const coreDir = join(scope, 'pantry');
const corePkg = patchCorePackage(
  {
    name: coreName, version: '0.0.0',
    exports: {
      '.': { types: './dist/toolkit/index.d.ts', default: './dist/toolkit/index.js' },
      './nutrients': { types: './generated/nutrients.d.ts', default: './generated/nutrients.js' },
      './sr/*/full': { types: './generated/types/full.d.ts', default: './generated/sr/*.full.js' },
      './sr/*': { types: './generated/types/core.d.ts', default: './generated/sr/*.js' },
    },
  },
  plan,
);
mkdirSync(coreDir, { recursive: true });
writeFileSync(join(coreDir, 'package.json'), JSON.stringify(corePkg, null, 2));
cpSync(join(root, 'dist', 'toolkit'), join(coreDir, 'dist', 'toolkit'), { recursive: true });
writeEntries(coreDir, 'generated', coreEntries([food], {
  specifier: coreName,
  extraNames: coreFullNutrientNames(dict),
  index: buildNutrientIndex(dict, tagnames, enNames).index,
}));

// ja-JP locale package: types reach the toolkit through the core peer.
const localeDir = join(scope, 'pantry-l10n-ja-jp');
const localized = loadLocaleNutrientNames('ja-JP');
const labels = { 'ja-JP': loadErrandLabels(ja, enNames) };
const localeNutrients = {
  'ja-JP': {
    extraNames: localeFullNutrientNames(dict, enNames, localized),
    index: buildNutrientIndex(dict, tagnames, enNames, localized).index,
  },
};
const jaRecord = {
  slug: SLUG, description: 'Pork, cured, salt pork, raw',
  result: { 'ja-JP': { name: '豚肉、塩蔵、ソルトポーク、生', aliases: ['ソルトポーク'], errand: { store: 'specialty', section: 'meat' }, notes: [] } },
};
mkdirSync(localeDir, { recursive: true });
writeFileSync(join(localeDir, 'package.json'), JSON.stringify(localePackageJson(plan, 'ja-JP'), null, 2));
writeEntries(localeDir, '', localeEntries([jaRecord], { tag: 'ja-JP' }, { coreSpecifier: coreName, labels, nutrients: localeNutrients }));

// Consumer: import every typed route and probe for `any` with @ts-expect-error.
const consumer = join(work, 'consumer');
writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2023'],
    strict: true, noUncheckedIndexedAccess: true, skipLibCheck: true, noEmit: true, types: [],
  },
  include: ['use.ts'],
}, null, 2));
writeFileSync(join(consumer, 'use.ts'), `
import core from '@illeatmyhat/pantry/sr/${SLUG}';
import full from '@illeatmyhat/pantry/sr/${SLUG}/full';
import nutrients from '@illeatmyhat/pantry/nutrients';
import jaCore from '@illeatmyhat/pantry-l10n-ja-jp/sr/${SLUG}';
import jaFull from '@illeatmyhat/pantry-l10n-ja-jp/sr/${SLUG}/full';
import jaNut from '@illeatmyhat/pantry-l10n-ja-jp/nutrients';

const a: number | null = core.nutrients.protein;
const b: number | null = full.nutrients.tryptophan;        // core extra by USDA name
const c = nutrients['tryptophan'];                          // index ref
const d: number = c!.id;
const e: number | null = jaFull.nutrients['トリプトファン'];  // locale extra by ja name
const f: number | null = jaFull.nutrients['たんぱく質'];      // locale panel by ja name
const g: number | null = jaCore.nutrients.protein;
const h = jaNut['たんぱく質'];                                // ja index by ja name
const i = jaNut['protein'];                                  // ja index still resolves en/slug

// @ts-expect-error amounts are number|null, never string
const w1: string = full.nutrients.tryptophan;
// @ts-expect-error amounts are number|null, never string
const w2: string = jaFull.nutrients['たんぱく質'];
// @ts-expect-error a NutrientRef is not a string
const w3: string = c!;

void [a, b, c, d, e, f, g, h, i, w1, w2, w3];
`);

try {
  execFileSync(
    process.execPath,
    [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', join(consumer, 'tsconfig.json')],
    { encoding: 'utf8', stdio: 'pipe' },
  );
  console.log('verify:types PASS — generated nutrient types resolve in an installed consumer (core self-ref + locale peer).');
} catch (err) {
  const e = err as { stdout?: string; stderr?: string };
  console.error('verify:types FAIL:\n' + (e.stdout ?? '') + (e.stderr ?? ''));
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
