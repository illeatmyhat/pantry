import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { looksBranded, root } from './lib.js';
import type { ManifestEntry } from '../../src/toolkit/search.js';

/**
 * Tier router for the production translation run. Decided 2026-06-13 after a
 * head-to-head where a cheap model matched Opus on errand routing but failed
 * on aliases/notes — and the failure (literal-katakana cut names like
 * チャック角切り) is invisible to strays.ts, which only checks store/section
 * vocabulary. So the strong model handles the foods whose value lives in the
 * everyday-name and market-guidance fields; the cheap model handles plain,
 * unbranded, non-cut staples where the section is reliable and the names are
 * unambiguous.
 *
 *   npx tsx scripts/translate/router.ts            # report the partition
 *   npx tsx scripts/translate/router.ts --write    # also write the input sets
 *
 * Two reasons a food goes to the strong (Opus) tier:
 *   - branded (looksBranded): market-specific retail judgment, brand→null;
 *   - an OPUS_CATEGORY: animal-protein categories where cut/species naming
 *     diverges across markets (meat, poultry, fish, processed meats), and
 *     prepared / non-retail-prone categories (menu items, baby foods,
 *     subsistence foods) where the errand and notes carry the real work.
 * Everything else is cheap-tier. The set is a flat literal so it is trivial
 * to audit and adjust before any spend.
 */
export const OPUS_CATEGORIES: ReadonlySet<string> = new Set([
  // Animal protein — cut/species naming is market-specific (chuck → 肩ロース,
  // top round → 牛もも肉, and the fish/shellfish nomenclature even more so).
  'Beef Products',
  'Pork Products',
  'Lamb, Veal, and Game Products',
  'Poultry Products',
  'Finfish and Shellfish Products',
  'Sausages and Luncheon Meats',
  // Prepared / non-retail-prone — errand often null, judgment-heavy.
  'Fast Foods',
  'Restaurant Foods',
  'Meals, Entrees, and Side Dishes',
  'Baby Foods',
  'American Indian/Alaska Native Foods',
]);

export type Tier = 'opus' | 'cheap';

export function tierOf(entry: ManifestEntry): Tier {
  if (looksBranded(entry.description)) return 'opus';
  if (OPUS_CATEGORIES.has(entry.category)) return 'opus';
  return 'cheap';
}

/** Total partition: every entry lands in exactly one tier, none dropped. */
export function partition(entries: readonly ManifestEntry[]): {
  opus: ManifestEntry[];
  cheap: ManifestEntry[];
} {
  const opus: ManifestEntry[] = [];
  const cheap: ManifestEntry[] = [];
  for (const entry of entries) (tierOf(entry) === 'opus' ? opus : cheap).push(entry);
  return { opus, cheap };
}

const invokedDirectly = process.argv[1]?.endsWith('router.ts') === true;
if (invokedDirectly) {
  const manifest = JSON.parse(
    readFileSync(`${root}generated/manifest.json`, 'utf8'),
  ) as ManifestEntry[];
  const { opus, cheap } = partition(manifest);

  // Per-category breakdown so the routing policy is auditable at a glance.
  const cats = new Map<string, { opus: number; cheap: number }>();
  for (const e of manifest) {
    const row = cats.get(e.category) ?? { opus: 0, cheap: 0 };
    row[tierOf(e)] += 1;
    cats.set(e.category, row);
  }
  console.log(`Manifest: ${manifest.length} foods → opus ${opus.length}, cheap ${cheap.length}\n`);
  console.log('  category                                  opus   cheap');
  for (const [cat, row] of [...cats].sort((a, b) => b[1].opus + b[1].cheap - (a[1].opus + a[1].cheap))) {
    console.log(`  ${cat.padEnd(40)} ${String(row.opus).padStart(5)} ${String(row.cheap).padStart(7)}`);
  }

  if (process.argv.includes('--write')) {
    mkdirSync(`${root}scripts/translate/out`, { recursive: true });
    writeFileSync(`${root}scripts/translate/out/opus-set.json`, `${JSON.stringify(opus, null, 1)}\n`);
    writeFileSync(`${root}scripts/translate/out/cheap-set.json`, `${JSON.stringify(cheap, null, 1)}\n`);
    console.log(`\nWrote out/opus-set.json (${opus.length}) and out/cheap-set.json (${cheap.length}).`);
  }
}
