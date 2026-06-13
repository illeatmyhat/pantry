import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { LOCALES } from './locales.js';
import { STORES } from './task.js';

/**
 * HUMAN-written ground truth over the generated baseline.
 *
 * `l10n/ground-truth/<locale>.yaml` is a map of fdc_id → verified fields
 * for that locale. Two rules define the layer (settled 2026-06-12):
 *
 * 1. It is human-written, period. When a frontier agent or batch job wants
 *    to fix machine output, it edits the stored baseline
 *    (l10n/baseline/<slug>.yaml) directly and re-validates — machine
 *    output correcting machine output is the same provenance class and
 *    needs no overlay.
 * 2. It is durable: regenerating the baseline (new model, new prompt,
 *    re-run) never touches it — it re-applies on top, later-layer-wins,
 *    field-level, and wins over ANY machine output. Every entry states its
 *    `basis` (why the machine was wrong), the same provenance gate as
 *    derive(); the file doubles as the glossary-decision log.
 */
const VERIFIABLE_FIELDS = new Set(['name', 'aliases', 'errand', 'notes', 'basis']);

const STORE_SET = new Set<string>(STORES);

/**
 * Ground truth enters AFTER generation-time validation, so its values must
 * satisfy the same contract validateShape enforces on model output —
 * otherwise a YAML typo ships an invalid errand or string-typed aliases to
 * consumers.
 */
function validateFieldValue(locale: string, key: string, field: string, value: unknown): void {
  const where = `${locale} ground truth: entry ${key}.${field}`;
  switch (field) {
    case 'name': {
      if (LOCALES.find((l) => l.tag === locale)?.canonical === true) {
        throw new Error(`${where}: the canonical name IS the USDA description — not overridable.`);
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
      if (value === null) return; // non-retail is a valid verified value
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

export interface GroundTruthEntry {
  readonly fields: Readonly<Record<string, unknown>>;
  readonly basis: string;
}

export type GroundTruthSet = Map<number, GroundTruthEntry>;

export function parseGroundTruth(locale: string, yamlText: string): GroundTruthSet {
  const doc: unknown = parse(yamlText);
  const entries: GroundTruthSet = new Map();
  if (doc === null || doc === undefined) return entries;
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`${locale} ground truth must be a map of fdc_id → verified fields.`);
  }
  for (const [key, raw] of Object.entries(doc)) {
    const fdcId = Number(key);
    if (!Number.isInteger(fdcId)) {
      throw new Error(`${locale} ground truth: key "${key}" is not an fdc_id.`);
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`${locale} ground truth: entry ${key} must be a map.`);
    }
    const entry = raw as Record<string, unknown>;
    for (const field of Object.keys(entry)) {
      if (!VERIFIABLE_FIELDS.has(field)) {
        throw new Error(`${locale} ground truth: entry ${key} has unknown field "${field}".`);
      }
      validateFieldValue(locale, key, field, entry[field]);
    }
    const basis = entry['basis'];
    if (typeof basis !== 'string' || basis.trim() === '') {
      throw new Error(
        `${locale} ground truth: entry ${key} has no basis — say why the machine was wrong.`,
      );
    }
    const { basis: _basis, ...fields } = entry;
    entries.set(fdcId, { fields, basis });
  }
  return entries;
}

export interface BaselineRecord {
  readonly fdc_id: number;
  readonly result?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

/**
 * Applies per-locale ground truth to baseline records. Field-level: only
 * the stated fields of the stated locale change; everything else flows
 * through.
 *
 * Overridden locales gain a `corrected: [field…]` marker — INTERNAL ONLY,
 * for review tooling. Consumers receive ground truth transparently: the
 * emitter strips the marker, so the published locale surface shows no seam
 * between machine output and human verification (decided 2026-06-12).
 *
 * Throws on entries that cannot land (fdc_id missing from the baseline, a
 * failed translation row, or a missing locale surface) — stale ground
 * truth must be loud, never a silent no-op.
 */
export function applyGroundTruth(
  baseline: readonly BaselineRecord[],
  byLocale: ReadonlyMap<string, GroundTruthSet>,
): BaselineRecord[] {
  const seen = new Set(baseline.map((r) => r.fdc_id));
  for (const [locale, set] of byLocale) {
    for (const fdcId of set.keys()) {
      if (!seen.has(fdcId)) {
        throw new Error(`${locale} ground truth: fdc_id ${fdcId} not in the baseline.`);
      }
    }
  }

  return baseline.map((record) => {
    let result: Record<string, unknown> | undefined = record.result;
    for (const [locale, set] of byLocale) {
      const entry = set.get(record.fdc_id);
      if (entry === undefined) continue;
      if (result === undefined) {
        throw new Error(
          `${locale} ground truth: fdc_id ${record.fdc_id} has no result in the baseline ` +
            '(failed translation row) — regenerate it or remove the entry.',
        );
      }
      const localeData: unknown = result[locale];
      if (localeData === null || typeof localeData !== 'object') {
        throw new Error(
          `${locale} ground truth: fdc_id ${record.fdc_id} has no ${locale} surface in the baseline.`,
        );
      }
      result = {
        ...result,
        [locale]: {
          ...(localeData as Record<string, unknown>),
          ...entry.fields,
          corrected: Object.keys(entry.fields),
        },
      };
    }
    // result can only differ from record.result if an entry landed, which
    // the guards above only allow when result is an object.
    return result === undefined || result === record.result ? record : { ...record, result };
  });
}

/** Loads every `l10n/ground-truth/<locale>.yaml` that exists. */
export function loadGroundTruth(root: string): Map<string, GroundTruthSet> {
  const byLocale = new Map<string, GroundTruthSet>();
  for (const spec of LOCALES) {
    const path = `${root}l10n/ground-truth/${spec.tag}.yaml`;
    if (!existsSync(path)) continue;
    byLocale.set(spec.tag, parseGroundTruth(spec.tag, readFileSync(path, 'utf8')));
  }
  return byLocale;
}
