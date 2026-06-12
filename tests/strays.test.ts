import { describe, expect, it } from 'vitest';
import { LOCALES } from '../scripts/translate/locales.js';
import { findStrays } from '../scripts/translate/strays.js';

const tag = LOCALES[0]?.tag ?? 'en-US';
const knownSection = LOCALES[0]?.sections[0] ?? 'produce';

function record(errand: unknown): {
  fdc_id: number;
  description: string;
  result: Record<string, unknown>;
} {
  return {
    fdc_id: 168287,
    description: 'Pork, cured, salt pork, raw',
    result: { brand: null, [tag]: { aliases: [], errand, notes: [] } },
  };
}

describe('findStrays', () => {
  it('passes errands whose section is in the locale vocabulary', () => {
    expect(findStrays([record({ store: 'primary', section: knownSection })])).toEqual([]);
  });

  it('passes errand: null — non-retail is a known value, not a stray', () => {
    expect(findStrays([record(null)])).toEqual([]);
  });

  it('flags a coined section for later verification', () => {
    const strays = findStrays([record({ store: 'specialty', section: 'salumeria_counter' })]);
    expect(strays).toEqual([
      {
        locale: tag,
        fdc_id: 168287,
        description: 'Pork, cured, salt pork, raw',
        store: 'specialty',
        section: 'salumeria_counter',
      },
    ]);
  });

  it('flags an unknown store even when the section is known', () => {
    const strays = findStrays([record({ store: 'farmers_market', section: knownSection })]);
    expect(strays).toHaveLength(1);
    expect(strays[0]?.store).toBe('farmers_market');
  });

  it('skips records without results (failed batch rows)', () => {
    expect(findStrays([{ fdc_id: 1, description: 'x' }])).toEqual([]);
  });
});
