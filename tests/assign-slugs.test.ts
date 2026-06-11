import { describe, expect, it } from 'vitest';
import { assignSlugs, EXPECTED_COLLIDERS } from '../src/generator/slug.js';

const pancakes = [
  { fdcId: 171853, description: 'Pancakes, whole wheat, dry mix, incomplete' },
  { fdcId: 172776, description: 'Pancakes, whole-wheat, dry mix, incomplete' },
];
const saltPork = { fdcId: 167914, description: 'Pork, cured, salt pork, raw' };

describe('assignSlugs', () => {
  it('gives non-colliding foods their plain description slug', () => {
    const slugs = assignSlugs([saltPork, ...pancakes]);
    expect(slugs.get(167914)).toBe('pork-cured-salt-pork-raw');
  });

  it('suffixes -<fdcId> on EVERY collider, not just the second', () => {
    const slugs = assignSlugs([...pancakes, saltPork]);
    expect(slugs.get(171853)).toBe('pancakes-whole-wheat-dry-mix-incomplete-171853');
    expect(slugs.get(172776)).toBe('pancakes-whole-wheat-dry-mix-incomplete-172776');
  });

  it('hard-fails when a collision outside the known set appears (tripwire)', () => {
    const drifted = [
      ...pancakes,
      { fdcId: 1, description: 'Salt pork' },
      { fdcId: 2, description: 'Salt, pork' },
    ];
    expect(() => assignSlugs(drifted)).toThrow(/collision/i);
  });

  it('hard-fails when the known collision disappears (tripwire is two-sided)', () => {
    expect(() => assignSlugs([saltPork])).toThrow(/collision/i);
  });

  it('pins the frozen collision set', () => {
    expect([...EXPECTED_COLLIDERS].sort()).toEqual([171853, 172776]);
  });
});
