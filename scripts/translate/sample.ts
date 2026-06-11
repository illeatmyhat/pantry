import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ManifestEntry } from '../../src/toolkit/search.js';

/**
 * Picks the randomized quality-test subset: a seeded uniform draw plus a
 * brand-heavy stratum (the hard cases for translation and availability
 * judgment). Seeded so the subset is reproducible across runs and models.
 *
 *   npx tsx scripts/translate/sample.ts [random-n] [brand-n] [seed]
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(
  readFileSync(`${root}generated/manifest.json`, 'utf8'),
) as ManifestEntry[];

const randomN = Number(process.argv[2] ?? 32);
const brandN = Number(process.argv[3] ?? 8);
const seed = Number(process.argv[4] ?? 20260611);

// mulberry32 — small, deterministic, good enough for sampling.
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Brand-bearing foods: an ALL-CAPS token (KEEBLER, HEINZ) or a known mixed-case brand. */
const MIXED_CASE_BRANDS =
  /\b(Pillsbury|Hormel|Heinz|Campbell|Kraft|Nabisco|Keebler|Udi's|Mission|Martha White|Mead Johnson|Gerber|Nestle|Ross|Abbott)\b/i;
function looksBranded(description: string): boolean {
  if (MIXED_CASE_BRANDS.test(description)) return true;
  return /\b[A-Z][A-Z'&-]{2,}[A-Z]\b/.test(description.replace(/\bUSDA\b|\bNLEA\b|\bRTF\b|\bUSA\b/g, ''));
}

const rand = mulberry32(seed);
function draw<T>(pool: T[], n: number): T[] {
  const picked: T[] = [];
  const copy = [...pool];
  while (picked.length < n && copy.length > 0) {
    const i = Math.floor(rand() * copy.length);
    const [item] = copy.splice(i, 1);
    if (item !== undefined) picked.push(item);
  }
  return picked;
}

const branded = manifest.filter((e) => looksBranded(e.description));
const plain = manifest.filter((e) => !looksBranded(e.description));
const sample = [...draw(plain, randomN), ...draw(branded, brandN)];

mkdirSync(`${root}scripts/translate/out`, { recursive: true });
writeFileSync(
  `${root}scripts/translate/out/sample.json`,
  `${JSON.stringify(sample, null, 1)}\n`,
);
console.log(
  `Sampled ${sample.length} foods (${randomN} uniform of ${plain.length}, ${brandN} branded of ${branded.length}) seed=${seed}`,
);
for (const e of sample) console.log(`  [${e.fdc_id}] ${e.description}`);
