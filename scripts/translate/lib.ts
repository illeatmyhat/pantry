import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
