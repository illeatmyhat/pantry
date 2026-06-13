import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/generator/load.js';
import { buildNutrientDictionary } from '../src/generator/nutrient-dictionary.js';
import { loadTagnames } from '../scripts/translate/nutrient-index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dictIds = new Set(buildNutrientDictionary(loadDataset()).map((e) => e.id));
const tagnames = loadTagnames();

describe('INFOODS tagname registry', () => {
  it('covers exactly the dataset nutrient ids, none blank', () => {
    expect(new Set(tagnames.keys())).toEqual(dictIds);
    for (const [, tag] of tagnames) expect(tag).toBeTruthy();
  });

  it('agrees with the tagname each locale overlay recorded (drift guard)', () => {
    for (const tag of ['ja-JP', 'zh-CN']) {
      const doc = parse(readFileSync(`${root}l10n/nutrients/${tag}.yaml`, 'utf8')) as {
        nutrients?: Array<{ id: number; tagname?: string }>;
      };
      for (const e of doc.nutrients ?? []) {
        if (e.tagname) expect(`${tag}:${e.id}=${e.tagname}`).toBe(`${tag}:${e.id}=${tagnames.get(e.id)}`);
      }
    }
  });
});
