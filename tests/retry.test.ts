import { describe, expect, it } from 'vitest';
import { failedEntries, type CollectRow } from '../scripts/translate/lib.js';

const ok = (fdc_id: number): CollectRow => ({
  slug: `s${fdc_id}`,
  fdc_id,
  description: `food ${fdc_id}`,
  category: 'Vegetables and Vegetable Products',
  result: { brand: null },
});
const failed = (fdc_id: number): CollectRow => ({
  slug: `s${fdc_id}`,
  fdc_id,
  description: `food ${fdc_id}`,
  category: 'Vegetables and Vegetable Products',
  error: 'batch result: errored',
});

describe('failedEntries', () => {
  it('returns only the failed rows, as bare entries', () => {
    const out = failedEntries([ok(1), failed(2), ok(3), failed(4)]);
    expect(out.map((e) => e.fdc_id)).toEqual([2, 4]);
  });

  it('strips the error/result fields — a retry input is a clean ManifestEntry array', () => {
    const [entry] = failedEntries([failed(7)]);
    expect(entry).toEqual({
      slug: 's7',
      fdc_id: 7,
      description: 'food 7',
      category: 'Vegetables and Vegetable Products',
    });
    expect('error' in (entry as object)).toBe(false);
  });

  it('returns empty when nothing failed — the caller treats this as nothing to retry', () => {
    expect(failedEntries([ok(1), ok(2)])).toEqual([]);
  });
});
