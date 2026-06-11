import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/generator/csv.js';

describe('parseCsv', () => {
  it('parses quoted records with embedded commas and "" escapes', () => {
    const text =
      '"fdc_id","description"\n' +
      '"167512","Pillsbury Golden Layer Buttermilk Biscuits, Artificial Flavor, refrigerated dough"\n' +
      '"167513","He said ""hello"", twice"\n';
    expect(parseCsv(text)).toEqual([
      { fdc_id: '167512', description: 'Pillsbury Golden Layer Buttermilk Biscuits, Artificial Flavor, refrigerated dough' },
      { fdc_id: '167513', description: 'He said "hello", twice' },
    ]);
  });
});
