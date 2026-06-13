import { describe, expect, it } from 'vitest';
import { flagTransliterations, katakanaRatio } from '../scripts/translate/transliteration.js';
import { LOCALES } from '../scripts/translate/locales.js';

const ja = LOCALES.find((l) => l.tag.startsWith('ja'))?.tag ?? 'ja-JP';
const other = LOCALES.find((l) => !l.tag.startsWith('ja'))?.tag ?? 'en-US';

const food = (fdc_id: number, jaAliases: string[]) => ({
  fdc_id,
  description: `food ${fdc_id}`,
  result: {
    [ja]: { aliases: jaAliases, errand: { store: 'primary', section: 'meat' } },
    [other]: { aliases: ['beef', 'lean beef'], errand: { store: 'primary', section: 'meat' } },
  },
});

describe('katakanaRatio', () => {
  it('is 1 for a fully-katakana transliteration', () => {
    expect(katakanaRatio('トップラウンドステーキ')).toBe(1);
  });
  it('is 0 for a native term in kanji/hiragana', () => {
    expect(katakanaRatio('牛もも肉')).toBe(0);
  });
  it('is the content fraction for a mixed alias', () => {
    expect(katakanaRatio('冷凍カブ')).toBeCloseTo(0.5, 5); // 2 katakana of 4
  });
  it('ignores punctuation and spaces', () => {
    expect(katakanaRatio('コーンチップス（バーベキュー味）')).toBeGreaterThan(0.9); // only 味 is not katakana
  });
  it('is 0 for an empty or punctuation-only string', () => {
    expect(katakanaRatio('')).toBe(0);
    expect(katakanaRatio('（）')).toBe(0);
  });
});

describe('flagTransliterations', () => {
  it('flags a mostly-katakana Japanese alias', () => {
    const flags = flagTransliterations([food(1, ['トップラウンドステーキ', '牛もも肉'])]);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.aliases.map((a) => a.alias)).toEqual(['トップラウンドステーキ']);
  });

  it('does not flag native-term aliases', () => {
    expect(flagTransliterations([food(1, ['牛もも肉', '内もも肉'])])).toEqual([]);
  });

  it('never flags non-Japanese locales (no katakana to find)', () => {
    // en-US aliases are 'beef'/'lean beef'; only ja is exercised above.
    const flags = flagTransliterations([food(1, ['牛もも肉'])]);
    expect(flags.every((f) => f.locale === ja || f.aliases.length === 0)).toBe(true);
    expect(flags).toEqual([]);
  });

  it('respects the threshold — a half-katakana alias flags at 0.5 but not 0.8', () => {
    expect(flagTransliterations([food(1, ['冷凍カブ'])], 0.8)).toEqual([]);
    expect(flagTransliterations([food(1, ['冷凍カブ'])], 0.5)).toHaveLength(1);
  });

  it('skips records without a result (failed rows)', () => {
    expect(flagTransliterations([{ fdc_id: 1, description: 'x' }])).toEqual([]);
  });
});
