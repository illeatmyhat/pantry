import { describe, expect, it } from 'vitest';
import { applyGroundTruth, parseGroundTruth } from '../scripts/translate/ground-truth.js';

const baseline = [
  {
    slug: 'pork-fresh-leg-ham-shank-half',
    fdc_id: 168229,
    description: 'Pork, fresh, leg (ham), shank half, separable lean only, cooked, roasted',
    category: 'Pork Products',
    result: {
      brand: null,
      'ja-JP': {
        name: '豚肉、生、もも（ハム）、シャンク半分、赤身のみ、加熱、ロースト',
        aliases: ['ローストポーク'],
        errand: { store: 'primary', section: 'meat_seafood' },
        notes: [],
      },
    },
  },
];

describe('parseGroundTruth', () => {
  it('rejects an entry without basis — ground truth states its why', () => {
    expect(() =>
      parseGroundTruth('ja-JP', `168229:\n  name: 豚肉、生鮮（非加塩）…\n`),
    ).toThrow(/basis/i);
  });

  it('rejects unknown fields — YAML typos must not pass silently', () => {
    expect(() =>
      parseGroundTruth('ja-JP', `168229:\n  nmae: x\n  basis: y\n`),
    ).toThrow(/nmae/);
  });

  it('rejects invalid errand values — ground truth obeys the same contract as model output', () => {
    expect(() =>
      parseGroundTruth('ja-JP', `168229:\n  errand: {store: walmart, section: meat}\n  basis: y\n`),
    ).toThrow(/store/);
    expect(() =>
      parseGroundTruth('ja-JP', `168229:\n  errand: {store: primary}\n  basis: y\n`),
    ).toThrow(/section/);
  });

  it('accepts errand: null — verifying a food as non-retail is legitimate', () => {
    expect(() =>
      parseGroundTruth('ja-JP', `168229:\n  errand: null\n  basis: y\n`),
    ).not.toThrow();
  });

  it('rejects non-array aliases and notes', () => {
    expect(() =>
      parseGroundTruth('ja-JP', `168229:\n  aliases: ソルトポーク\n  basis: y\n`),
    ).toThrow(/array/);
  });

  it('rejects a name override on the canonical locale — the description is the name', () => {
    expect(() =>
      parseGroundTruth('en-US', `168229:\n  name: Salted Pork\n  basis: y\n`),
    ).toThrow(/canonical/);
  });
});

describe('applyGroundTruth', () => {
  const groundTruth = parseGroundTruth(
    'ja-JP',
    `
168229:
  name: 豚肉、生鮮（非加塩）、もも（ハム）、すね半分、赤身のみ、加熱調理、ロースト
  basis: '"fresh" renders as 生鮮（非加塩）, never 生 (glossary 2026-06-12)'
`,
  );

  it('overrides only the verified fields of the verified locale', () => {
    const merged = applyGroundTruth(baseline, new Map([['ja-JP', groundTruth]]));
    const ja = merged[0]?.result?.['ja-JP'] as Record<string, unknown>;
    expect(ja['name']).toBe(
      '豚肉、生鮮（非加塩）、もも（ハム）、すね半分、赤身のみ、加熱調理、ロースト',
    );
    expect(ja['aliases']).toEqual(['ローストポーク']); // untouched fields survive
    expect(ja['errand']).toEqual({ store: 'primary', section: 'meat_seafood' });
  });

  it('does not mutate the baseline and records the override marker', () => {
    const merged = applyGroundTruth(baseline, new Map([['ja-JP', groundTruth]]));
    const original = baseline[0]?.result?.['ja-JP'] as Record<string, unknown>;
    expect(original['name']).toContain('豚肉、生、');
    const ja = merged[0]?.result?.['ja-JP'] as Record<string, unknown>;
    expect(ja['corrected']).toEqual(['name']);
  });

  it('flags entries for fdc_ids absent from the baseline', () => {
    const orphaned = parseGroundTruth('ja-JP', `999999:\n  name: x\n  basis: y\n`);
    expect(() => applyGroundTruth(baseline, new Map([['ja-JP', orphaned]]))).toThrow(/999999/);
  });

  it('throws when the target record has no result — failed rows must not eat ground truth', () => {
    const failedRow = [{ slug: 'x', fdc_id: 168229, description: 'x', error: 'boom' }];
    expect(() => applyGroundTruth(failedRow, new Map([['ja-JP', groundTruth]]))).toThrow(
      /no result/,
    );
  });

  it('throws when the verified locale surface is missing from the record', () => {
    const noJa = [{ ...baseline[0], result: { brand: null } } as (typeof baseline)[0]];
    expect(() => applyGroundTruth(noJa, new Map([['ja-JP', groundTruth]]))).toThrow(/no ja-JP/);
  });
});
