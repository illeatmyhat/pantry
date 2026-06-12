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
 * - The emitter iterates the LOCALE TABLE, never the record's keys: a
 *   stray root key (legacy bare 'ja', a typo'd tag) must never become a
 *   published locale directory (code-review 2026-06-12).
 * - Corrections are invisible: internal markers (`corrected`) never ship.
 * - The canonical locale's name IS the USDA description, copied
 *   mechanically; a generated name there is a contract breach, not data.
 * - Missing means missing: a locale absent from a record emits nothing;
 *   a PRESENT locale missing its name is an error — never fall back to
 *   the English description for a non-canonical locale.
 */
export interface TranslationRecord {
  readonly slug: string;
  readonly description: string;
  readonly result?: Record<string, unknown> & { brand?: string | null };
}

/** The slice of the locale table the emitter needs (pass LOCALES from scripts/translate/locales.ts). */
export interface EmitLocale {
  readonly tag: string;
  readonly canonical?: boolean;
}

interface LocaleStringsShape {
  readonly name?: string;
  readonly aliases?: readonly string[];
  /** null = non-retail food; shipped verbatim so consumers can filter on it. */
  readonly errand?: { store: string; section: string } | null;
  readonly notes?: readonly string[];
}

export function emitL10n(
  records: readonly TranslationRecord[],
  outDir: string,
  locales: readonly EmitLocale[],
): void {
  const madeDirs = new Set<string>();
  for (const record of records) {
    if (record.result === undefined) continue;
    for (const spec of locales) {
      const value = record.result[spec.tag];
      if (value === undefined) continue; // missing means missing
      if (value === null || typeof value !== 'object') {
        throw new Error(`${record.slug}: ${spec.tag} surface is not an object.`);
      }
      const strings = value as LocaleStringsShape;

      let name: string;
      if (spec.canonical === true) {
        if (strings.name !== undefined) {
          throw new Error(
            `${record.slug}: generated name on canonical locale ${spec.tag} — ` +
              'the canonical name IS the description, copied mechanically.',
          );
        }
        name = record.description;
      } else {
        if (strings.name === undefined || strings.name === '') {
          throw new Error(
            `${record.slug}: ${spec.tag} surface has no name — missing means missing; ` +
              'refusing to leak the English description.',
          );
        }
        name = strings.name;
      }

      const localeDir = join(outDir, 'l10n', spec.tag, 'sr');
      if (!madeDirs.has(localeDir)) {
        mkdirSync(localeDir, { recursive: true });
        madeDirs.add(localeDir);
      }

      const leaf = {
        locale: spec.tag,
        name,
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
