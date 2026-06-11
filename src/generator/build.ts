import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assemble } from './assemble.js';
import { emit } from './emit.js';
import { loadDataset } from './load.js';

/**
 * The reproducible build: checksum-verify the vendored zip, generate every
 * leaf and view into generated/. The invariant suite proper lives in
 * tests/, but the slug tripwire fires here too (inside assignSlugs).
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const zipPath = `${root}data/FoodData_Central_sr_legacy_food_csv_2018-04.zip`;
const outDir = `${root}generated`;

const pinned = readFileSync(`${root}data/CHECKSUMS.sha256`, 'utf8').trim().split(/\s+/)[0];
const actual = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
if (actual !== pinned) {
  throw new Error(
    `Vendored zip fails its pinned checksum.\n  pinned: ${pinned ?? '(missing)'}\n  actual: ${actual}`,
  );
}

const foods = assemble(loadDataset(zipPath));
rmSync(outDir, { recursive: true, force: true });
emit(foods, outDir);

const withDensity = foods.filter((f) => f.core.density !== null).length;
console.log(`Generated ${foods.length} foods (${withDensity} with derived density) → generated/`);
