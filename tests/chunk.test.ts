import { describe, expect, it } from 'vitest';
import { chunkOf } from '../scripts/translate/lib.js';

const seq = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe('chunkOf', () => {
  it('partitions the frozen corpus into three review-gated chunks with no gaps or overlap', () => {
    const corpus = seq(7793);
    const chunks = [1, 2, 3].map((k) => chunkOf(corpus, k, 3));
    expect(chunks.map((c) => c.length)).toEqual([2598, 2598, 2597]);
    expect(chunks.flat()).toEqual(corpus); // contiguous, ordered, complete
  });

  it('balances sizes to within one when the split is uneven', () => {
    expect([1, 2, 3, 4].map((k) => chunkOf(seq(10), k, 4).length)).toEqual([3, 3, 2, 2]);
  });

  it('reassembles to the original for any n', () => {
    const corpus = seq(100);
    for (const n of [1, 2, 5, 7, 13, 100]) {
      const reassembled = Array.from({ length: n }, (_, i) => chunkOf(corpus, i + 1, n)).flat();
      expect(reassembled).toEqual(corpus);
    }
  });

  it('n === 1 returns the whole list as chunk 1', () => {
    expect(chunkOf(seq(5), 1, 1)).toEqual(seq(5));
  });

  it('rejects a chunk index outside 1..n rather than submitting the wrong slice', () => {
    expect(() => chunkOf(seq(10), 0, 3)).toThrow(/--chunk must be between 1 and 3/);
    expect(() => chunkOf(seq(10), 4, 3)).toThrow(/--chunk must be between 1 and 3/);
  });

  it('rejects a non-positive or non-integer --of', () => {
    expect(() => chunkOf(seq(10), 1, 0)).toThrow(/--of must be a positive integer/);
    expect(() => chunkOf(seq(10), 1, 2.5)).toThrow(/--of must be a positive integer/);
  });
});
