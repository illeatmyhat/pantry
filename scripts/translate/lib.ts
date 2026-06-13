import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ManifestEntry } from '../../src/toolkit/search.js';

/**
 * Shared helpers for the translate scripts. Every script previously
 * carried its own copy of these; the copies had already drifted in
 * fallback semantics, so this is the single home (code-review 2026-06-12).
 */

/** Repo root — every translate script lives at scripts/translate/. */
export const root = fileURLToPath(new URL('../../', import.meta.url));

/** `--name value` argv lookup; undefined when the flag is absent. */
export function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Reads a JSONL file into parsed records, skipping blank lines. */
export function readJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as T);
}

/** A collect-result row: the food's identity plus either a result or an error. */
export interface CollectRow extends ManifestEntry {
  readonly error?: string;
  readonly result?: unknown;
}

/**
 * The food identities of the failed rows in a collect result — the retry
 * queue. collect writes {...entry, error} for a failed request and
 * {...entry, result} for a success; baseline import skips the failures.
 * This pulls just the identity back out so a retry batch re-submits exactly
 * those foods and nothing else.
 */
export function failedEntries(rows: readonly CollectRow[]): ManifestEntry[] {
  return rows
    .filter((row) => row.error !== undefined)
    .map(({ slug, fdc_id, description, category }) => ({ slug, fdc_id, description, category }));
}

/**
 * Brand-bearing foods: an ALL-CAPS token (KEEBLER, HEINZ) or a known
 * mixed-case brand (Pillsbury, Gerber). Branded foods carry market-specific
 * retail judgment (brand→null, specialty availability), so the tier router
 * sends them to the strong model regardless of category. Shared with the
 * sampler so "what counts as branded" has one definition.
 */
const MIXED_CASE_BRANDS =
  /\b(Pillsbury|Hormel|Heinz|Campbell|Kraft|Nabisco|Keebler|Udi's|Mission|Martha White|Mead Johnson|Gerber|Nestle|Ross|Abbott)\b/i;

export function looksBranded(description: string): boolean {
  if (MIXED_CASE_BRANDS.test(description)) return true;
  return /\b[A-Z][A-Z'&-]{2,}[A-Z]\b/.test(
    description.replace(/\bUSDA\b|\bNLEA\b|\bRTF\b|\bUSA\b/g, ''),
  );
}

/** mulberry32 — small, deterministic, good enough for sampling. */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Contiguous chunk `k` of `n` (both 1-based) of `items`, balanced so chunk
 * sizes differ by at most one and order is preserved. The production
 * translation run submits the 7,793-food manifest as three review-gated
 * chunks; this is the partition behind `--chunk K --of N`. Throws on
 * out-of-range arguments so a fat-fingered flag fails loudly instead of
 * silently submitting the wrong slice.
 */
export function chunkOf<T>(items: readonly T[], k: number, n: number): T[] {
  if (!Number.isInteger(n) || n < 1) throw new Error(`--of must be a positive integer, got ${n}`);
  if (!Number.isInteger(k) || k < 1 || k > n) {
    throw new Error(`--chunk must be between 1 and ${n}, got ${k}`);
  }
  const base = Math.floor(items.length / n);
  const remainder = items.length % n;
  // The first `remainder` chunks carry one extra item.
  const start = (k - 1) * base + Math.min(k - 1, remainder);
  const size = base + (k <= remainder ? 1 : 0);
  return items.slice(start, start + size);
}

/** Seeded draw of n items without replacement. */
export function draw<T>(pool: readonly T[], n: number, rand: () => number): T[] {
  const picked: T[] = [];
  const copy = [...pool];
  while (picked.length < n && copy.length > 0) {
    const i = Math.floor(rand() * copy.length);
    const [item] = copy.splice(i, 1);
    if (item !== undefined) picked.push(item);
  }
  return picked;
}
