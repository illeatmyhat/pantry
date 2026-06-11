import { describe, expect, it } from 'vitest';
import { searchFoods, type ManifestEntry } from '../src/toolkit/search.js';

const manifest: ManifestEntry[] = [
  { slug: 'pork-cured-salt-pork-raw', fdc_id: 167914, description: 'Pork, cured, salt pork, raw', category: 'Pork Products' },
  { slug: 'pork-fresh-loin-whole-raw', fdc_id: 167902, description: 'Pork, fresh, loin, whole, raw', category: 'Pork Products' },
  { slug: 'salt-table', fdc_id: 173468, description: 'Salt, table', category: 'Spices and Herbs' },
  { slug: 'butter-salted', fdc_id: 173410, description: 'Butter, salted', category: 'Dairy and Egg Products' },
];

describe('searchFoods', () => {
  it('AND-matches every query token, case-insensitive', () => {
    const hits = searchFoods(manifest, 'salt pork');
    expect(hits.map((h) => h.slug)).toEqual(['pork-cured-salt-pork-raw']);
  });

  it('matches single tokens anywhere in the description', () => {
    const hits = searchFoods(manifest, 'SALT');
    expect(hits.map((h) => h.slug)).toContain('salt-table');
    expect(hits.map((h) => h.slug)).toContain('pork-cured-salt-pork-raw');
    expect(hits.map((h) => h.slug)).toContain('butter-salted');
  });

  it('ranks tighter descriptions first', () => {
    const hits = searchFoods(manifest, 'salt');
    expect(hits[0]?.slug).toBe('salt-table');
  });

  it('respects the limit', () => {
    expect(searchFoods(manifest, 'salt', { limit: 1 })).toHaveLength(1);
  });

  it('returns nothing when a token matches nothing', () => {
    expect(searchFoods(manifest, 'salt unicorn')).toEqual([]);
  });
});
