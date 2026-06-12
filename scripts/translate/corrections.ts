import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { LOCALES } from './locales.js';

/**
 * Human-driven ground truth for generated translations.
 *
 * `l10n/corrections/<locale>.yaml` is a map of fdc_id → corrected fields
 * for that locale. Corrections are the durable layer: regenerating the
 * machine baseline (new model, new prompt, new price) never touches them —
 * they re-apply on top, later-layer-wins, field-level. Every entry states
 * its `basis` (why the machine was wrong), the same provenance gate as
 * derive(): the corrections file doubles as the glossary-decision log.
 */
const CORRECTABLE_FIELDS = new Set(['name', 'aliases', 'errand', 'notes', 'basis']);

export interface LocaleCorrection {
  readonly fields: Readonly<Record<string, unknown>>;
  readonly basis: string;
}

export type CorrectionSet = Map<number, LocaleCorrection>;

export function parseCorrections(locale: string, yamlText: string): CorrectionSet {
  const doc: unknown = parse(yamlText);
  const corrections: CorrectionSet = new Map();
  if (doc === null || doc === undefined) return corrections;
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`${locale} corrections must be a map of fdc_id → corrected fields.`);
  }
  for (const [key, raw] of Object.entries(doc)) {
    const fdcId = Number(key);
    if (!Number.isInteger(fdcId)) {
      throw new Error(`${locale} corrections: key "${key}" is not an fdc_id.`);
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`${locale} corrections: entry ${key} must be a map.`);
    }
    const entry = raw as Record<string, unknown>;
    for (const field of Object.keys(entry)) {
      if (!CORRECTABLE_FIELDS.has(field)) {
        throw new Error(`${locale} corrections: entry ${key} has unknown field "${field}".`);
      }
    }
    const basis = entry['basis'];
    if (typeof basis !== 'string' || basis.trim() === '') {
      throw new Error(
        `${locale} corrections: entry ${key} has no basis — say why the machine was wrong.`,
      );
    }
    const { basis: _basis, ...fields } = entry;
    corrections.set(fdcId, { fields, basis });
  }
  return corrections;
}

export interface BaselineRecord {
  readonly fdc_id: number;
  readonly result?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

/**
 * Applies per-locale corrections to baseline records. Field-level: only the
 * stated fields of the stated locale change; everything else flows through.
 * Corrected locales gain a `corrected: [field…]` marker so emitters and
 * reviews can tell ground truth from machine output. Throws on corrections
 * whose fdc_id has no baseline record (stale corrections must be loud).
 */
export function applyCorrections(
  baseline: readonly BaselineRecord[],
  correctionsByLocale: ReadonlyMap<string, CorrectionSet>,
): BaselineRecord[] {
  const seen = new Set(baseline.map((r) => r.fdc_id));
  for (const [locale, set] of correctionsByLocale) {
    for (const fdcId of set.keys()) {
      if (!seen.has(fdcId)) {
        throw new Error(`${locale} corrections: fdc_id ${fdcId} not in the baseline.`);
      }
    }
  }

  return baseline.map((record) => {
    let result = record.result;
    if (result === undefined) return record;
    for (const [locale, set] of correctionsByLocale) {
      const correction = set.get(record.fdc_id);
      if (correction === undefined) continue;
      const localeData = result[locale];
      if (localeData === null || typeof localeData !== 'object') continue;
      result = {
        ...result,
        [locale]: {
          ...(localeData as Record<string, unknown>),
          ...correction.fields,
          corrected: Object.keys(correction.fields),
        },
      };
    }
    return result === record.result ? record : { ...record, result };
  });
}

/** Loads every `l10n/corrections/<locale>.yaml` that exists. */
export function loadCorrections(root: string): Map<string, CorrectionSet> {
  const byLocale = new Map<string, CorrectionSet>();
  for (const spec of LOCALES) {
    const path = `${root}l10n/corrections/${spec.tag}.yaml`;
    if (!existsSync(path)) continue;
    byLocale.set(spec.tag, parseCorrections(spec.tag, readFileSync(path, 'utf8')));
  }
  return byLocale;
}
