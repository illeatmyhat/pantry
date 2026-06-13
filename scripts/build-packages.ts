import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { assemble } from '../src/generator/assemble.js';
import { coreEntries } from '../src/generator/emit.js';
import { localeEntries } from '../src/generator/emit-l10n.js';
import { emitPackages, localePackageJson, localePackageName, patchCorePackage } from '../src/generator/emit-packages.js';
import { createTarGz, type TarEntry } from '../src/generator/tarball.js';
import { loadDataset } from '../src/generator/load.js';
import { BASELINE_DIR, readBaseline } from './translate/baseline.js';
import { applyGroundTruth, loadGroundTruth } from './translate/ground-truth.js';
import { root } from './translate/lib.js';
import { LOCALES } from './translate/locales.js';
import { loadAllErrandLabels } from './translate/vocabulary.js';

/**
 * The publish build: streams every package straight into its tarball —
 * no loose generated trees (decided 2026-06-12: ~93k loose files at 3
 * locales were the slowest possible I/O shape on Windows; the loose
 * emitters remain as the dev/debug mode).
 *
 *   npm run build:packages
 *
 * Produces dist/packages/:
 *   illeatmyhat-pantry-<v>.tgz            core: package.json + dist/toolkit
 *                                         + generated/sr + manifest
 *   illeatmyhat-pantry-l10n-<tag>-<v>.tgz one per locale, from the stored
 *                                         baseline + ground truth
 *
 * Also syncs the root package.json (fdc alias exports, files scoping,
 * optional locale peers) so the committed manifest matches the tarball.
 * `npm publish <tgz>` ships any of them.
 */
const zipPath = `${root}data/FoodData_Central_sr_legacy_food_csv_2018-04.zip`;
const outDir = `${root}dist/packages`;

const pinned = readFileSync(`${root}data/CHECKSUMS.sha256`, 'utf8').trim().split(/\s+/)[0];
const actual = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
if (actual !== pinned) {
  throw new Error(`Vendored zip fails its pinned checksum.\n  pinned: ${pinned ?? '(missing)'}\n  actual: ${actual}`);
}
if (!existsSync(`${root}dist/toolkit`)) {
  throw new Error('dist/toolkit missing — run `npm run build:toolkit` first (build:packages chains it).');
}

const foods = assemble(loadDataset(zipPath));
const manifest = foods.map((f) => ({ slug: f.core.slug, fdc_id: f.core.fdc_id }));
const corePkgRaw = JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as Record<string, unknown> & {
  name: string;
  version: string;
};
const plan = { coreName: corePkgRaw.name, version: corePkgRaw.version, manifest, locales: LOCALES };

// Sync the committed manifest so repo and tarball never disagree.
emitPackages(plan, `${root}package.json`, undefined);
const corePkg = patchCorePackage(corePkgRaw, plan);

mkdirSync(outDir, { recursive: true });

function* distFiles(dir: string): Generator<TarEntry> {
  for (const item of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!item.isFile()) continue;
    const full = join(item.parentPath, item.name);
    yield {
      path: `dist/${relative(`${root}dist`, full).replaceAll('\\', '/')}`,
      data: readFileSync(full),
    };
  }
}

function tarballName(pkgName: string, version: string): string {
  return `${pkgName.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`;
}

function writePackage(pkgName: string, entries: Iterable<TarEntry>): void {
  const prefixed = (function* prefix(): Generator<TarEntry> {
    for (const entry of entries) yield { path: `package/${entry.path}`, data: entry.data };
  })();
  const file = join(outDir, tarballName(pkgName, plan.version));
  const tgz = createTarGz(prefixed);
  writeFileSync(file, tgz);
  console.log(`${tarballName(pkgName, plan.version)}  ${(tgz.length / 1e6).toFixed(1)} MB`);
}

// Core: manifest + toolkit + sr leaves/views, paths matching the exports map.
writePackage(plan.coreName, (function* core(): Generator<TarEntry> {
  yield { path: 'package.json', data: `${JSON.stringify(corePkg, null, 2)}\n` };
  yield* distFiles(`${root}dist/toolkit`);
  for (const entry of coreEntries(foods)) {
    yield { path: `generated/${entry.path}`, data: entry.data }; // l10n never rides in core
  }
})());

// Locales: stored baseline + ground truth, cross-package views.
const baselineRecords = readBaseline(BASELINE_DIR);
const merged = applyGroundTruth(baselineRecords, loadGroundTruth(root)) as typeof baselineRecords;
const labels = loadAllErrandLabels(LOCALES);
for (const spec of LOCALES) {
  writePackage(localePackageName(plan.coreName, spec.tag), (function* locale(): Generator<TarEntry> {
    yield { path: 'package.json', data: `${JSON.stringify(localePackageJson(plan, spec.tag), null, 2)}\n` };
    yield* localeEntries(merged, spec, { coreSpecifier: plan.coreName, labels });
  })());
}
