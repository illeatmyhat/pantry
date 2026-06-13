import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BASELINE_DIR, loadRecords } from './baseline.js';
import { applyGroundTruth, loadGroundTruth } from './ground-truth.js';
import { flag, root } from './lib.js';
import { LOCALES } from './locales.js';
import { loadAllErrandLabels } from './vocabulary.js';
import { emitL10n } from '../../src/generator/emit-l10n.js';
import { emitPackages, type PackageManifestEntry } from '../../src/generator/emit-packages.js';

/**
 * The post-batch pipeline tail (DESIGN.md "After the run"): a results
 * JSONL → ground-truth overlay (human verification re-applies over any
 * regenerated baseline and wins) → emitted locale modules next to the
 * sr/ cores.
 *
 *   npx tsx scripts/translate/emit.ts [results.jsonl | baseline-dir] [--out generated]
 *
 * Defaults to the committed per-food baseline (l10n/baseline); a .jsonl
 * path reads the wire format directly. Emits
 * generated/l10n/<tag>/sr/<slug>{.strings.js,.js,.full.js} for every
 * locale surface present. Failed rows (no result) are skipped and counted;
 * ground-truth entries that cannot land throw (loudness is the contract).
 */
const positional = process.argv[2];
const input = positional === undefined || positional.startsWith('--') ? BASELINE_DIR : positional;
const outDir = flag('out') ?? `${root}generated`;

const records = loadRecords(input);
const groundTruth = loadGroundTruth(root);
const verified = [...groundTruth.values()].reduce((sum, set) => sum + set.size, 0);
const merged = applyGroundTruth(records, groundTruth) as typeof records;

// Locale trees are publishable packages (DESIGN.md "Locale scaling path"):
// views import core leaves via the bare specifier, and each tree gets its
// own package.json; the root package.json gains the fdc alias exports and
// the optional-peer declarations.
const corePkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as {
  name: string;
  version: string;
};
emitL10n(merged, outDir, LOCALES, {
  coreSpecifier: corePkg.name,
  labels: loadAllErrandLabels(LOCALES),
});
emitPackages(
  {
    coreName: corePkg.name,
    version: corePkg.version,
    manifest: JSON.parse(
      readFileSync(`${root}generated/manifest.json`, 'utf8'),
    ) as PackageManifestEntry[],
    locales: LOCALES,
  },
  `${root}package.json`,
  outDir,
);

const failed = records.filter((r) => r.result === undefined).length;
const perLocale = LOCALES.map((spec) => {
  const n = merged.filter((r) => r.result?.[spec.tag] !== undefined).length;
  return `${spec.tag}: ${n}`;
}).join(', ');
console.log(
  `Emitted l10n surfaces for ${records.length - failed}/${records.length} records ` +
    `(${perLocale}) with ${verified} ground-truth entries → ${pathToFileURL(outDir).pathname}/l10n/`,
);
