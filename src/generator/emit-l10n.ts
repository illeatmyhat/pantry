import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Emits locale surfaces from reviewed translation records (baseline +
 * corrections already merged), per the leaf/view law:
 *
 *   l10n/<tag>/sr/<slug>.strings.js   strings leaf (locale, name, aliases,
 *                                     errand, notes — nothing else)
 *   l10n/<tag>/sr/<slug>.js           VIEW = core + strings
 *   l10n/<tag>/sr/<slug>.full.js      VIEW = core + extra + strings
 *
 * Decisions encoded here:
 * - Corrections are invisible: internal markers (`corrected`) never ship.
 * - The canonical locale is detected by absence of a generated `name`; its
 *   name is the USDA description, copied mechanically.
 * - Missing means missing: a locale absent from a record emits nothing —
 *   the consumer's import fails at build time rather than leaking another
 *   language.
 */
export interface TranslationRecord {
  readonly slug: string;
  readonly description: string;
  readonly result?: Record<string, unknown> & { brand?: string | null };
}

interface LocaleStringsShape {
  readonly name?: string;
  readonly aliases?: readonly string[];
  readonly errand?: { store: string; section: string };
  readonly notes?: readonly string[];
}

export function emitL10n(records: readonly TranslationRecord[], outDir: string): void {
  for (const record of records) {
    if (record.result === undefined) continue;
    for (const [key, value] of Object.entries(record.result)) {
      if (key === 'brand' || value === null || typeof value !== 'object') continue;
      const strings = value as LocaleStringsShape;
      const localeDir = join(outDir, 'l10n', key, 'sr');
      mkdirSync(localeDir, { recursive: true });

      const leaf = {
        locale: key,
        // Canonical locale: name was never generated — the description IS the name.
        name: strings.name ?? record.description,
        aliases: strings.aliases ?? [],
        ...(strings.errand !== undefined ? { errand: strings.errand } : {}),
        notes: strings.notes ?? [],
      };
      writeFileSync(
        join(localeDir, `${record.slug}.strings.js`),
        `export default ${JSON.stringify(leaf)};\n`,
      );
      writeFileSync(
        join(localeDir, `${record.slug}.js`),
        `import core from '../../../sr/${record.slug}.js';\n` +
          `import strings from './${record.slug}.strings.js';\n` +
          `export default { ...core, ...strings };\n`,
      );
      writeFileSync(
        join(localeDir, `${record.slug}.full.js`),
        `import core from '../../../sr/${record.slug}.js';\n` +
          `import extra from '../../../sr/${record.slug}.extra.js';\n` +
          `import strings from './${record.slug}.strings.js';\n` +
          `export default { ...core, ...extra, ...strings };\n`,
      );
    }
  }
}
