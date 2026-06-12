import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { emitL10n } from '../src/generator/emit-l10n.js';

const record = {
  slug: 'pork-cured-salt-pork-raw',
  fdc_id: 168287,
  description: 'Pork, cured, salt pork, raw',
  category: 'Pork Products',
  result: {
    brand: null,
    'en-US': {
      aliases: ['salt pork'],
      errand: { store: 'primary', section: 'meat_seafood' },
      notes: [],
    },
    'ja-JP': {
      name: '豚肉、塩蔵、ソルトポーク、生',
      aliases: ['ソルトポーク', '塩豚'],
      errand: { store: 'specialty', section: 'meat' },
      notes: ['日本では流通が少ない。'],
      corrected: ['name'], // internal review marker — must never ship
    },
  },
};

const outDir = mkdtempSync(join(tmpdir(), 'pantry-l10n-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('emitL10n', () => {
  it('emits a strings leaf per locale present on the record', async () => {
    emitL10n([record], outDir);
    const ja = (await import(
      pathToFileURL(join(outDir, 'l10n', 'ja-JP', 'sr', 'pork-cured-salt-pork-raw.strings.js')).href
    )) as { default: Record<string, unknown> };
    expect(ja.default).toEqual({
      locale: 'ja-JP',
      name: '豚肉、塩蔵、ソルトポーク、生',
      aliases: ['ソルトポーク', '塩豚'],
      errand: { store: 'specialty', section: 'meat' },
      notes: ['日本では流通が少ない。'],
    });
  });

  it('strips internal correction markers — corrections are invisible', () => {
    emitL10n([record], outDir);
    const source = readFileSync(
      join(outDir, 'l10n', 'ja-JP', 'sr', 'pork-cured-salt-pork-raw.strings.js'),
      'utf8',
    );
    expect(source).not.toContain('corrected');
  });

  it('gives the canonical locale its name mechanically from the description', async () => {
    emitL10n([record], outDir);
    const en = (await import(
      pathToFileURL(join(outDir, 'l10n', 'en-US', 'sr', 'pork-cured-salt-pork-raw.strings.js')).href
    )) as { default: { name: string } };
    expect(en.default.name).toBe('Pork, cured, salt pork, raw');
  });

  it('emits locale views that import leaves and inline nothing', () => {
    emitL10n([record], outDir);
    const view = readFileSync(
      join(outDir, 'l10n', 'ja-JP', 'sr', 'pork-cured-salt-pork-raw.js'),
      'utf8',
    );
    expect(view).toContain('import');
    expect(view).not.toContain('ソルトポーク'); // strings live in the leaf only
    expect(view).not.toContain('168287'); // core data lives in the core leaf only
    const full = readFileSync(
      join(outDir, 'l10n', 'ja-JP', 'sr', 'pork-cured-salt-pork-raw.full.js'),
      'utf8',
    );
    expect(full).toContain('extra');
  });

  it('ships errand: null verbatim — non-retail is data, not absence', async () => {
    const nonRetail = {
      slug: 'mcdonalds-hamburger',
      fdc_id: 170725,
      description: "McDONALD'S, Hamburger",
      result: {
        brand: "McDonald's",
        'en-US': { aliases: [], errand: null, notes: [] },
      },
    };
    emitL10n([nonRetail], outDir);
    const en = (await import(
      pathToFileURL(join(outDir, 'l10n', 'en-US', 'sr', 'mcdonalds-hamburger.strings.js')).href
    )) as { default: { errand: unknown } };
    expect(en.default.errand).toBeNull();
  });

  it('missing means missing: locales absent from the record are not emitted', () => {
    emitL10n([record], outDir);
    expect(() =>
      readFileSync(join(outDir, 'l10n', 'zh-CN', 'sr', 'pork-cured-salt-pork-raw.strings.js')),
    ).toThrow();
  });
});
