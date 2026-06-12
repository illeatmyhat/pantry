import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../scripts/translate/locales.js';

const root = fileURLToPath(new URL('../', import.meta.url));

interface Vocab {
  sections: Array<{ slug: string }>;
}

describe('locale table ↔ vocabulary sync', () => {
  for (const spec of LOCALES) {
    it(`${spec.tag} sections match l10n/vocabulary/${spec.tag}.yaml slugs`, () => {
      const vocab = parse(
        readFileSync(`${root}l10n/vocabulary/${spec.tag}.yaml`, 'utf8'),
      ) as Vocab;
      expect([...spec.sections]).toEqual(vocab.sections.map((s) => s.slug));
    });
  }
});
