#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { searchFoods, type ManifestEntry } from './search.js';

/**
 * `pantry search <terms…>` — offline lookup over the generated manifest.
 * Prints slug, fdc_id, and description; the slug is the import path.
 */
const [command, ...terms] = process.argv.slice(2);

if (command !== 'search' || terms.length === 0) {
  console.log('Usage: pantry search <terms…>');
  process.exit(command === 'search' ? 1 : 0);
}

const manifestPath = fileURLToPath(new URL('../../generated/manifest.json', import.meta.url));
let manifest: ManifestEntry[];
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestEntry[];
} catch {
  console.error('No generated manifest found — run `npm run build` first.');
  process.exit(1);
}

const hits = searchFoods(manifest, terms.join(' '));
if (hits.length === 0) {
  console.log('No matches.');
} else {
  for (const hit of hits) {
    console.log(`${hit.slug}  [${hit.fdc_id}]  ${hit.description}  (${hit.category})`);
  }
}
