import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../scripts/translate/locales.js';

const root = fileURLToPath(new URL('../', import.meta.url));

interface Vocab {
  sections: Array<{ slug: string }>;
  stores?: Record<string, string>;
}

/** The three `store` enum values every locale must label (see Errand.store). */
const STORE_KEYS = ['primary', 'specialty', 'online'];

describe('locale table ↔ vocabulary sync', () => {
  for (const spec of LOCALES) {
    it(`${spec.tag} sections match l10n/vocabulary/${spec.tag}.yaml slugs`, () => {
      const vocab = parse(
        readFileSync(`${root}l10n/vocabulary/${spec.tag}.yaml`, 'utf8'),
      ) as Vocab;
      expect([...spec.sections]).toEqual(vocab.sections.map((s) => s.slug));
    });

    it(`${spec.tag} labels exactly the three store enum values, none empty`, () => {
      const vocab = parse(
        readFileSync(`${root}l10n/vocabulary/${spec.tag}.yaml`, 'utf8'),
      ) as Vocab;
      expect(Object.keys(vocab.stores ?? {})).toEqual(STORE_KEYS);
      for (const key of STORE_KEYS) {
        expect(vocab.stores?.[key]).toBeTruthy();
      }
    });
  }
});
