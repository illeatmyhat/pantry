import { describe, expect, it } from 'vitest';
import { defineFood, derive, localize, localizeErrand } from '../src/toolkit/index.js';
import type { ErrandLabels, Food } from '../src/toolkit/index.js';

// The slug → label table a consumer imports from a locale package's
// `./labels` export (labels.js). Mirrors the shipped shape exactly.
const jaLabels: ErrandLabels = {
  sections: { meat: '精肉', produce: '青果' },
  stores: { primary: 'スーパー', specialty: '専門店', online: '通販' },
};

const beef = localize(derive(defineFood({ name: 'beef base', nutrients: {}, basis: 't' }), { name: 'beef' }), {
  locale: 'ja-JP',
  name: '牛肉',
  errand: { store: 'primary', section: 'meat' },
});

describe('localizeErrand', () => {
  it('resolves a food errand to local-language store + section labels in one call', () => {
    expect(localizeErrand(beef, jaLabels)).toEqual({ store: 'スーパー', section: '精肉' });
  });

  it('returns null for a non-retail food (errand: null)', () => {
    const fastFood = localize(beef, { locale: 'ja-JP', name: 'ハンバーガー', errand: null });
    expect(localizeErrand(fastFood, jaLabels)).toBeNull();
  });

  it('returns null when no errand is stated (errand absent)', () => {
    const noErrand: Food = { nutrients: beef.nutrients, density: null, name: '牛肉' };
    expect(localizeErrand(noErrand, jaLabels)).toBeNull();
  });

  it('falls back to the raw slug for a coined section stray with no label', () => {
    const strayed = localize(beef, { locale: 'ja-JP', name: '牛タン', errand: { store: 'specialty', section: 'offal' } });
    // 'offal' is a coined stray absent from the frozen vocabulary → render the slug, never an empty cell.
    expect(localizeErrand(strayed, jaLabels)).toEqual({ store: '専門店', section: 'offal' });
  });
});
