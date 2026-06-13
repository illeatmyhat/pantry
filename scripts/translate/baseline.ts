import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, stringify } from 'yaml';
import { readJsonl, root } from './lib.js';

/**
 * The stored baseline: one readable YAML file per food under
 * l10n/baseline/<slug>.yaml (decided 2026-06-12 — JSONL is the WIRE format
 * only; it earns its keep for append-safe generation and streaming
 * collect, and is hostile for stored data). The baseline tree is what
 * agents edit when they correct machine output, so every fix is a
 * one-file git diff; the human ground-truth overlay applies on top at
 * emit time and always wins.
 *
 *   npx tsx scripts/translate/baseline.ts import <results.jsonl>
 *
 * Failed rows (no result) are skipped, not stored — they are retry queue
 * material, not baseline. Transient generation metadata (tokens, ms)
 * is dropped: the baseline records what the food IS per locale, not how
 * it was produced.
 */
export interface BaselineFood {
  readonly slug: string;
  readonly fdc_id: number;
  readonly description: string;
  readonly category?: string;
  readonly error?: string;
  readonly result?: Record<string, unknown>;
}

export const BASELINE_DIR = `${root}l10n/baseline`;

export function writeBaseline(
  records: readonly BaselineFood[],
  dir: string,
): { written: number; skipped: number } {
  mkdirSync(dir, { recursive: true });
  let written = 0;
  let skipped = 0;
  for (const record of records) {
    if (record.result === undefined) {
      skipped += 1;
      continue;
    }
    const doc = {
      fdc_id: record.fdc_id,
      slug: record.slug,
      description: record.description,
      ...(record.category !== undefined ? { category: record.category } : {}),
      ...record.result,
    };
    writeFileSync(join(dir, `${record.slug}.yaml`), stringify(doc));
    written += 1;
  }
  return { written, skipped };
}

export function readBaseline(dir: string): BaselineFood[] {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .sort();
  return files.map((name) => {
    const doc = parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>;
    const { fdc_id, slug, description, category, ...result } = doc;
    return {
      fdc_id: fdc_id as number,
      slug: slug as string,
      description: description as string,
      ...(category !== undefined ? { category: category as string } : {}),
      result,
    };
  });
}

/** Reads records from either format: a .jsonl wire file or a baseline directory. */
export function loadRecords(path: string): BaselineFood[] {
  return path.endsWith('.jsonl') ? readJsonl<BaselineFood>(path) : readBaseline(path);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const [command, input] = [process.argv[2], process.argv[3]];
  if (command !== 'import' || input === undefined) {
    console.log('Usage: npx tsx scripts/translate/baseline.ts import <results.jsonl>');
    process.exit(1);
  }
  const records = readJsonl<BaselineFood>(input);
  const { written, skipped } = writeBaseline(records, BASELINE_DIR);
  console.log(
    `Imported ${written} foods into ${BASELINE_DIR}` +
      (skipped > 0 ? ` (${skipped} failed rows skipped — retry those)` : ''),
  );
}
