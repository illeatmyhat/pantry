import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyGroundTruth, parseGroundTruth } from '../scripts/translate/ground-truth.js';
import type { GeneratedFood } from '../src/generator/assemble.js';
import { emit } from '../src/generator/emit.js';
import { emitL10n } from '../src/generator/emit-l10n.js';
import { localePackageJson } from '../src/generator/emit-packages.js';
import { LABEL_KEYS, localize } from '../src/toolkit/index.js';
import type { Food, LabelNutrients } from '../src/toolkit/index.js';

/**
 * The consumer's end-to-end view: run the REAL pipeline (core emit →
 * machine baseline → human ground truth → l10n emit) into a temp package,
 * then import the generated files exactly as a consumer would and check
 * the data — composition, overrides, and toolkit interop.
 */
const pkg = mkdtempSync(join(tmpdir(), 'pantry-consumer-'));
afterAll(() => rmSync(pkg, { recursive: true, force: true }));

const SLUG = 'pork-cured-salt-pork-raw';
const importDefault = async <T>(...segments: string[]): Promise<T> =>
  ((await import(pathToFileURL(join(pkg, ...segments)).href)) as { default: T }).default;

const nutrients = {
  ...(Object.fromEntries(LABEL_KEYS.map((key) => [key, null])) as LabelNutrients),
  calories: 748,
  fat: 80.5,
  sodium: 1383,
  protein: 5.05,
};

const saltPork: GeneratedFood = {
  core: {
    fdc_id: 168287,
    slug: SLUG,
    description: 'Pork, cured, salt pork, raw',
    category: 'Pork Products',
    nutrients,
    density: null,
  },
  extra: {
    fdc_id: 168287,
    ndb_number: '10165',
    remaining_nutrients: [],
    portions: [],
    calorie_conversion_factor: null,
    protein_conversion_factor: null,
  },
};

// Machine baseline with the known mistranslation class: "cured...raw" came
// back with 生 reading applied to the wrong term. Ground truth fixes it.
const baseline = [
  {
    slug: SLUG,
    fdc_id: 168287,
    description: 'Pork, cured, salt pork, raw',
    result: {
      brand: null,
      'en-US': {
        aliases: ['salt pork'],
        errand: { store: 'primary', section: 'meat_seafood' },
        notes: [],
      },
      'ja-JP': {
        name: '豚肉、生、ソルトポーク', // machine error
        aliases: ['ソルトポーク'],
        errand: { store: 'specialty', section: 'meat' },
        notes: ['日本では流通が少ない。'],
      },
    },
  },
];

const groundTruth = parseGroundTruth(
  'ja-JP',
  `168287:\n  name: 豚肉、塩蔵、ソルトポーク、生\n  basis: 'cured=塩蔵 (glossary 2026-06-12)'\n`,
);

beforeAll(() => {
  emit([saltPork], pkg);
  const merged = applyGroundTruth(baseline, new Map([['ja-JP', groundTruth]])) as typeof baseline;
  emitL10n(merged, pkg, [{ tag: 'en-US', canonical: true }, { tag: 'ja-JP' }]);
});

describe('consumer imports', () => {
  it('composes core + locale surface in one import, typed as Food', async () => {
    const food = await importDefault<Food>('l10n', 'ja-JP', 'sr', `${SLUG}.js`);
    expect(food.fdc_id).toBe(168287);
    expect(food.locale).toBe('ja-JP');
    expect(food.nutrients.calories).toBe(748); // core data rides along
    expect(food.nutrients.fiber).toBeNull(); // structurally complete label set
    expect(food.errand).toEqual({ store: 'specialty', section: 'meat' });
    expect(food.notes).toEqual(['日本では流通が少ない。']);
  });

  it('ships the ground-truth name with no seam — the marker never reaches consumers', async () => {
    const food = await importDefault<Food>('l10n', 'ja-JP', 'sr', `${SLUG}.js`);
    expect(food.name).toBe('豚肉、塩蔵、ソルトポーク、生'); // human override, not machine output
    expect('corrected' in food).toBe(false);
  });

  it('full view layers extra between core and strings without clobbering', async () => {
    const full = await importDefault<Food & { ndb_number: string }>(
      'l10n',
      'ja-JP',
      'sr',
      `${SLUG}.full.js`,
    );
    expect(full.ndb_number).toBe('10165'); // from the extra leaf
    expect(full.nutrients.calories).toBe(748); // extra never clobbers core.nutrients
    expect(full.name).toBe('豚肉、塩蔵、ソルトポーク、生'); // strings win last
  });

  it('canonical locale names the food with the USDA description, mechanically', async () => {
    const food = await importDefault<Food>('l10n', 'en-US', 'sr', `${SLUG}.js`);
    expect(food.name).toBe('Pork, cured, salt pork, raw');
    expect(food.errand).toEqual({ store: 'primary', section: 'meat_seafood' });
  });

  it('emitted leaves compose through the toolkit: localize(core, strings) === imported view', async () => {
    const core = await importDefault<Food>('sr', `${SLUG}.js`);
    const strings = await importDefault<Parameters<typeof localize>[1]>(
      'l10n',
      'ja-JP',
      'sr',
      `${SLUG}.strings.js`,
    );
    const view = await importDefault<Food>('l10n', 'ja-JP', 'sr', `${SLUG}.js`);
    expect(localize(core, strings)).toEqual(view);
  });
});

describe('split-package consumer (per-locale packages, optional peers)', () => {
  // A simulated npm install: core and locale packages junction-linked into
  // a consumer's node_modules, all imports resolved through bare specifiers
  // and the packages' exports maps — including the fdc alias routes.
  const split = mkdtempSync(join(tmpdir(), 'pantry-split-'));
  afterAll(() => rmSync(split, { recursive: true, force: true }));

  const plan = {
    coreName: '@illeatmyhat/pantry',
    version: '0.0.0',
    manifest: [{ slug: SLUG, fdc_id: 168287 }],
    locales: [{ tag: 'ja-JP' }],
  };

  beforeAll(async () => {
    const coreDir = join(split, 'core');
    emit([saltPork], coreDir);
    writeFileSync(
      join(coreDir, 'package.json'),
      JSON.stringify({
        name: plan.coreName,
        version: plan.version,
        type: 'module',
        exports: { './sr/*/full': './sr/*.full.js', './sr/*': './sr/*.js' },
      }),
    );

    const merged = applyGroundTruth(
      baseline,
      new Map([['ja-JP', groundTruth]]),
    ) as typeof baseline;
    emitL10n(merged, join(split, 'out'), [{ tag: 'ja-JP' }], { coreSpecifier: plan.coreName });
    const localeDir = join(split, 'out', 'l10n', 'ja-JP');
    writeFileSync(
      join(localeDir, 'package.json'),
      JSON.stringify(localePackageJson(plan, 'ja-JP')),
    );

    // Copy, don't link: npm installs place package files physically under
    // node_modules, and Node resolves a package's own imports from its
    // realpath — a symlinked package would look for its peers in the
    // wrong tree.
    const scope = join(split, 'consumer', 'node_modules', '@illeatmyhat');
    mkdirSync(scope, { recursive: true });
    cpSync(coreDir, join(scope, 'pantry'), { recursive: true });
    cpSync(localeDir, join(scope, 'pantry-l10n-ja-jp'), { recursive: true });
    writeFileSync(
      join(split, 'consumer', 'probe.mjs'),
      `import view from '@illeatmyhat/pantry-l10n-ja-jp/sr/${SLUG}';\n` +
        `import full from '@illeatmyhat/pantry-l10n-ja-jp/sr/${SLUG}/full';\n` +
        `import byFdc from '@illeatmyhat/pantry-l10n-ja-jp/sr/fdc/168287';\n` +
        `process.stdout.write(JSON.stringify({ view, full, byFdc }));\n`,
    );
  });

  it('resolves locale views cross-package, by slug, /full, and fdc alias', () => {
    // A real child Node process: bare-specifier resolution through
    // node_modules and the exports maps, no test-runner interception.
    const stdout = execFileSync(process.execPath, [join(split, 'consumer', 'probe.mjs')], {
      encoding: 'utf8',
    });
    const probe = JSON.parse(stdout) as {
      view: Food;
      full: Food & { ndb_number: string };
      byFdc: Food;
    };
    expect(probe.view.name).toBe('豚肉、塩蔵、ソルトポーク、生');
    expect(probe.view.nutrients.calories).toBe(748); // core leaf reached through the peer package
    expect(probe.full.ndb_number).toBe('10165');
    expect(probe.byFdc.fdc_id).toBe(168287); // exports-map alias route
  });
});
