import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

export interface EmitL10nOptions {
  /**
   * Bare package specifier for the core package (e.g. '@illeatmyhat/pantry').
   * When set, views import core leaves cross-package ('<core>/sr/<slug>',
   * extensionless — the exports map appends .js), making each
   * l10n/<tag>/ tree publishable as its own package. Default: relative
   * imports, the single-package layout.
   */
  readonly coreSpecifier?: string;
}

/**
 * Entries for ONE locale's package tree, paths relative to the locale
 * package root ('sr/<slug>.strings.js' …). The validating source of
 * truth: emitL10n materializes these loose for dev/debug;
 * build-packages.ts streams them into locale tarballs without touching
 * disk (decided 2026-06-12).
 */
export function* localeEntries(
  records: readonly TranslationRecord[],
  spec: EmitLocale,
  options: EmitL10nOptions = {},
): Generator<{ path: string; data: string }> {
  for (const record of records) {
    if (record.result === undefined) continue;
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

    const leaf = {
      locale: spec.tag,
      name,
      aliases: strings.aliases ?? [],
      ...(strings.errand !== undefined ? { errand: strings.errand } : {}),
      notes: strings.notes ?? [],
    };
    const core =
      options.coreSpecifier !== undefined
        ? `${options.coreSpecifier}/sr/${record.slug}`
        : `../../../sr/${record.slug}.js`;
    const extra =
      options.coreSpecifier !== undefined
        ? `${options.coreSpecifier}/sr/${record.slug}.extra`
        : `../../../sr/${record.slug}.extra.js`;
    yield {
      path: `sr/${record.slug}.strings.js`,
      data: `export default ${JSON.stringify(leaf)};\n`,
    };
    yield {
      path: `sr/${record.slug}.js`,
      data:
        `import core from '${core}';\n` +
        `import strings from './${record.slug}.strings.js';\n` +
        `export default { ...core, ...strings };\n`,
    };
    yield {
      path: `sr/${record.slug}.full.js`,
      data:
        `import core from '${core}';\n` +
        `import extra from '${extra}';\n` +
        `import strings from './${record.slug}.strings.js';\n` +
        `export default { ...core, ...extra, ...strings };\n`,
    };
  }
}

export function emitL10n(
  records: readonly TranslationRecord[],
  outDir: string,
  locales: readonly EmitLocale[],
  options: EmitL10nOptions = {},
): void {
  const madeDirs = new Set<string>();
  for (const spec of locales) {
    for (const entry of localeEntries(records, spec, options)) {
      const filePath = join(outDir, 'l10n', spec.tag, entry.path);
      const dir = dirname(filePath);
      if (!madeDirs.has(dir)) {
        mkdirSync(dir, { recursive: true });
        madeDirs.add(dir);
      }
      writeFileSync(filePath, entry.data);
    }
  }
}

