import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { draw as drawSeeded, flag, looksBranded, mulberry32, root } from './lib.js';
import type { ManifestEntry } from '../../src/toolkit/search.js';

/**
 * Picks the randomized quality-test subset: a seeded uniform draw plus a
 * brand-heavy stratum (the hard cases for translation and availability
 * judgment). Seeded so the subset is reproducible across runs and models.
 *
 *   npx tsx scripts/translate/sample.ts [random-n] [brand-n] [seed]
 *     [--exclude <prior.json[,prior2.json,…]>] [--output <path>]
 *
 * --exclude keeps the draw disjoint from earlier samples (by fdc_id), so
 * follow-up validation batches never re-test foods already reviewed.
 */
const args = process.argv.slice(2);
const positional = args.filter(
  (a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1]?.startsWith('--') === true),
);
const excludePath = flag('exclude');
const outPath = flag('output') ?? `${root}scripts/translate/out/sample.json`;
const excluded = new Set(
  (excludePath?.split(',') ?? []).flatMap((path) =>
    (JSON.parse(readFileSync(path, 'utf8')) as ManifestEntry[]).map((e) => e.fdc_id),
  ),
);

const manifest = (
  JSON.parse(readFileSync(`${root}generated/manifest.json`, 'utf8')) as ManifestEntry[]
).filter((e) => !excluded.has(e.fdc_id));

const randomN = Number(positional[0] ?? 32);
const brandN = Number(positional[1] ?? 8);
const seed = Number(positional[2] ?? 20260611);

const rand = mulberry32(seed);
const branded = manifest.filter((e) => looksBranded(e.description));
const plain = manifest.filter((e) => !looksBranded(e.description));
const sample = [...drawSeeded(plain, randomN, rand), ...drawSeeded(branded, brandN, rand)];

mkdirSync(`${root}scripts/translate/out`, { recursive: true });
writeFileSync(outPath, `${JSON.stringify(sample, null, 1)}\n`);
console.log(
  `Sampled ${sample.length} foods (${randomN} uniform of ${plain.length}, ${brandN} branded of ${branded.length}) seed=${seed}${excluded.size > 0 ? ` excluding ${excluded.size} prior` : ''} → ${outPath}`,
);
for (const e of sample) console.log(`  [${e.fdc_id}] ${e.description}`);
