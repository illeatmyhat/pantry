import { pathToFileURL } from 'node:url';
import { applyGroundTruth, loadGroundTruth } from './ground-truth.js';
import { flag, readJsonl, root } from './lib.js';
import { LOCALES } from './locales.js';
import { emitL10n } from '../../src/generator/emit-l10n.js';

/**
 * The post-batch pipeline tail (DESIGN.md "After the run"): a results
 * JSONL → ground-truth overlay (human verification re-applies over any
 * regenerated baseline and wins) → emitted locale modules next to the
 * sr/ cores.
 *
 *   npx tsx scripts/translate/emit.ts <results.jsonl> [--out generated]
 *
 * Emits generated/l10n/<tag>/sr/<slug>{.strings.js,.js,.full.js} for every
 * locale surface present. Failed rows (no result) are skipped and counted;
 * ground-truth entries that cannot land throw (loudness is the contract).
 */
interface PipelineRecord {
  readonly slug: string;
  readonly fdc_id: number;
  readonly description: string;
  readonly error?: string;
  readonly result?: Record<string, unknown>;
}

const input = process.argv[2];
if (input === undefined || input.startsWith('--')) {
  console.log('Usage: npx tsx scripts/translate/emit.ts <results.jsonl> [--out generated]');
  process.exit(1);
}
const outDir = flag('out') ?? `${root}generated`;

const records = readJsonl<PipelineRecord>(input);
const groundTruth = loadGroundTruth(root);
const verified = [...groundTruth.values()].reduce((sum, set) => sum + set.size, 0);
const merged = applyGroundTruth(records, groundTruth) as PipelineRecord[];

emitL10n(merged, outDir, LOCALES);

const failed = records.filter((r) => r.result === undefined).length;
const perLocale = LOCALES.map((spec) => {
  const n = merged.filter((r) => r.result?.[spec.tag] !== undefined).length;
  return `${spec.tag}: ${n}`;
}).join(', ');
console.log(
  `Emitted l10n surfaces for ${records.length - failed}/${records.length} records ` +
    `(${perLocale}) with ${verified} ground-truth entries → ${pathToFileURL(outDir).pathname}/l10n/`,
);
