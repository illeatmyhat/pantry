import { describe, expect, it } from 'vitest';
import { OPUS_CATEGORIES, partition, tierOf } from '../scripts/translate/router.js';
import type { ManifestEntry } from '../src/toolkit/search.js';

let id = 0;
const food = (description: string, category: string): ManifestEntry => ({
  fdc_id: ++id,
  slug: `s${id}`,
  description,
  category,
});

describe('tierOf', () => {
  it('routes plain unbranded staples to the cheap tier', () => {
    expect(tierOf(food('Apple, raw', 'Fruits and Fruit Juices'))).toBe('cheap');
    expect(tierOf(food('Carrots, raw', 'Vegetables and Vegetable Products'))).toBe('cheap');
    expect(tierOf(food('Rice, white, long-grain, cooked', 'Cereal Grains and Pasta'))).toBe('cheap');
  });

  it('routes meat, poultry, and fish to the strong tier — cut/species naming is market-specific', () => {
    expect(tierOf(food('Beef, chuck for stew, raw', 'Beef Products'))).toBe('opus');
    expect(tierOf(food('Chicken, broilers, dark meat, roasted', 'Poultry Products'))).toBe('opus');
    expect(tierOf(food('Fish, salmon, Atlantic, raw', 'Finfish and Shellfish Products'))).toBe('opus');
  });

  it('routes prepared / non-retail-prone categories to the strong tier', () => {
    expect(tierOf(food('McDONALD\'S, Big Mac', 'Fast Foods'))).toBe('opus');
    expect(tierOf(food('Babyfood, cereal, rice, dry', 'Baby Foods'))).toBe('opus');
  });

  it('routes a branded food to the strong tier even from a cheap category', () => {
    // HEINZ ketchup lives in a cheap-tier category, but the brand pulls it up.
    expect(tierOf(food('HEINZ Tomato Ketchup', 'Soups, Sauces, and Gravies'))).toBe('opus');
    expect(tierOf(food('KEEBLER cookies', 'Cookies and Snacks'))).toBe('opus');
  });
});

describe('partition', () => {
  const corpus: ManifestEntry[] = [
    food('Apple, raw', 'Fruits and Fruit Juices'),
    food('Beef, ground, raw', 'Beef Products'),
    food('HEINZ Ketchup', 'Soups, Sauces, and Gravies'),
    food('Milk, whole', 'Dairy and Egg Products'),
    food('Salmon, raw', 'Finfish and Shellfish Products'),
  ];

  it('is a total partition — every food lands in exactly one tier, none dropped', () => {
    const { opus, cheap } = partition(corpus);
    expect(opus.length + cheap.length).toBe(corpus.length);
  });

  it('opus and cheap are disjoint and together cover the whole input', () => {
    const { opus, cheap } = partition(corpus);
    const opusIds = new Set(opus.map((e) => e.fdc_id));
    const cheapIds = new Set(cheap.map((e) => e.fdc_id));
    for (const e of corpus) {
      expect(opusIds.has(e.fdc_id) !== cheapIds.has(e.fdc_id)).toBe(true); // exactly one
    }
    expect(opusIds.size + cheapIds.size).toBe(corpus.length); // no overlap
  });

  it('the OPUS_CATEGORIES list is the audit surface — meat/fish/prepared are in it', () => {
    expect(OPUS_CATEGORIES.has('Beef Products')).toBe(true);
    expect(OPUS_CATEGORIES.has('Finfish and Shellfish Products')).toBe(true);
    expect(OPUS_CATEGORIES.has('Vegetables and Vegetable Products')).toBe(false);
  });
});
