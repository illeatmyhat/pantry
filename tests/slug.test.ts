import { describe, expect, it } from 'vitest';
import { slugify } from '../src/generator/slug.js';

describe('slugify', () => {
  it('turns a USDA description into a kebab slug', () => {
    expect(slugify('Pork, cured, salt pork, raw')).toBe('pork-cured-salt-pork-raw');
  });

  it('spells out & and %', () => {
    expect(slugify('Cheese, pasteurized process, American, fortified & 2% milk')).toBe(
      'cheese-pasteurized-process-american-fortified-and-2-percent-milk',
    );
  });

  it('strips diacritics via NFKD', () => {
    expect(slugify('Crème brûlée, jalapeño')).toBe('creme-brulee-jalapeno');
  });

  it('collapses punctuation runs and trims edge hyphens', () => {
    expect(slugify('  Beans, baked (canned) -- plain!  ')).toBe('beans-baked-canned-plain');
  });

  it('collides on the frozen pancake pair (the hyphen difference vanishes)', () => {
    expect(slugify('Pancakes, whole wheat, dry mix, incomplete')).toBe(
      slugify('Pancakes, whole-wheat, dry mix, incomplete'),
    );
  });
});
