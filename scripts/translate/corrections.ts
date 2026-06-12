import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { LOCALES } from './locales.js';
import { STORES } from './task.js';

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

const STORE_SET = new Set<string>(STORES);

/**
 * Corrections enter AFTER generation-time validation, so their values must
 * satisfy the same contract validateShape enforces on model output —
 * otherwise a YAML typo ships an invalid errand or string-typed aliases to
 * consumers (code-review 2026-06-12).
 */
function validateFieldValue(locale: string, key: string, field: string, value: unknown): void {
  const where = `${locale} corrections: entry ${key}.${field}`;
  switch (field) {
    case 'name': {
      if (LOCALES.find((l) => l.tag === locale)?.canonical === true) {
        throw new Error(`${where}: the canonical name IS the USDA description — not correctable.`);
      }
      if (typeof value !== 'string' || value === '') {
        throw new Error(`${where} must be a non-empty string.`);
      }
      return;
    }
    case 'aliases':
    case 'notes': {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new Error(`${where} must be an array of strings.`);
      }
      return;
    }
    case 'errand': {
      if (value === null) return; // non-retail is a valid corrected value
      if (value === undefined || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${where} must be null or {store, section}.`);
      }
      const errand = value as Record<string, unknown>;
      const extra = Object.keys(errand).filter((k) => k !== 'store' && k !== 'section');
      if (extra.length > 0) throw new Error(`${where} has unknown keys: ${extra.join(', ')}.`);
      if (!STORE_SET.has(String(errand['store']))) {
        throw new Error(`${where}.store must be one of ${[...STORE_SET].join('|')}.`);
      }
      if (typeof errand['section'] !== 'string' || errand['section'].trim() === '') {
        throw new Error(`${where}.section must be a non-empty string.`);
      }
      return;
    }
    default:
      return; // basis is validated separately
  }
}

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
      validateFieldValue(locale, key, field, entry[field]);
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
 *
 * Corrected locales gain a `corrected: [field…]` marker — INTERNAL ONLY,
 * for review tooling. Consumers receive corrections transparently: the
 * emitter strips the marker, so the published locale surface shows no seam
 * between machine output and human ground truth (decided 2026-06-12).
 *
 * Throws on corrections whose fdc_id has no baseline record (stale
 * corrections must be loud).
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
    let result: Record<string, unknown> | undefined = record.result;
    for (const [locale, set] of correctionsByLocale) {
      const correction = set.get(record.fdc_id);
      if (correction === undefined) continue;
      // A correction that cannot land must be loud, never a silent no-op:
      // a failed translation row or a missing locale surface means the
      // human ground truth would otherwise vanish on the next emit.
      if (result === undefined) {
        throw new Error(
          `${locale} corrections: fdc_id ${record.fdc_id} has no result in the baseline ` +
            '(failed translation row) — regenerate it or remove the correction.',
        );
      }
      const localeData: unknown = result[locale];
      if (localeData === null || typeof localeData !== 'object') {
        throw new Error(
          `${locale} corrections: fdc_id ${record.fdc_id} has no ${locale} surface in the baseline.`,
        );
      }
      result = {
        ...result,
        [locale]: {
          ...(localeData as Record<string, unknown>),
          ...correction.fields,
          corrected: Object.keys(correction.fields),
        },
      };
    }
    // result can only differ from record.result if a correction landed,
    // which the guards above only allow when result is an object.
    return result === undefined || result === record.result ? record : { ...record, result };
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
