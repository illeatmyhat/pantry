import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BASELINE_DIR, loadRecords } from './baseline.js';
import { flag } from './lib.js';
import { LOCALES } from './locales.js';
import { STORES } from './task.js';

/**
 * Post-generation audit: the section vocabulary is PREFERRED, never
 * enforced (decided 2026-06-12) — the model may coin a slug when no known
 * aisle honestly fits. This script lists every food-errand pair whose
 * store/section is outside the known vocabulary so a human can verify
 * them later: each stray is either a correction (fold into a known slug
 * via the corrections overlay) or a vocabulary gap (adopt the new slug).
 *
 *   npx tsx scripts/translate/strays.ts <results.jsonl>
 *     [--output scripts/translate/out/errand-strays.md]
 */
export interface StrayErrand {
  readonly locale: string;
  readonly fdc_id: number;
  readonly description: string;
  readonly store: string;
  readonly section: string;
}

export interface StrayAudit {
  readonly strays: StrayErrand[];
  /** Locale surfaces actually inspected — 0 means the file isn't keyed by BCP-47 tags. */
  readonly surfaces: number;
}

interface ResultRecord {
  readonly fdc_id?: number;
  readonly description?: string;
  readonly result?: Record<string, unknown>;
}

const STORE_SET = new Set<string>(STORES);
const SECTION_SETS = new Map(LOCALES.map((spec) => [spec.tag, new Set(spec.sections)]));

export function findStrays(records: readonly ResultRecord[]): StrayAudit {
  const strays: StrayErrand[] = [];
  let surfaces = 0;
  for (const record of records) {
    if (record.result === undefined) continue;
    for (const spec of LOCALES) {
      const locale = record.result[spec.tag];
      if (locale === null || typeof locale !== 'object') continue;
      surfaces += 1;
      const errand = (locale as Record<string, unknown>)['errand'];
      // null = non-retail, a known value; absence = locale never generated.
      if (errand === null || errand === undefined || typeof errand !== 'object') continue;
      const store = String((errand as Record<string, unknown>)['store']);
      const section = String((errand as Record<string, unknown>)['section']);
      if (STORE_SET.has(store) && SECTION_SETS.get(spec.tag)?.has(section) === true) continue;
      strays.push({
        locale: spec.tag,
        fdc_id: record.fdc_id ?? -1,
        description: record.description ?? '',
        store,
        section,
      });
    }
  }
  return { strays, surfaces };
}

/** Renders strays grouped by locale → section for the review doc. */
export function renderStrays(strays: readonly StrayErrand[], total: number): string {
  const out: string[] = [
    '# Errand strays — off-vocabulary store/section pairs',
    '',
    `${strays.length} stray errands across ${total} records. Each is either a`,
    'correction (fold into a known slug via l10n/corrections) or a vocabulary',
    'gap (adopt the coined slug into l10n/vocabulary and locales.ts).',
    '',
  ];
  for (const spec of LOCALES) {
    const mine = strays.filter((s) => s.locale === spec.tag);
    if (mine.length === 0) continue;
    out.push(`## ${spec.tag} — ${mine.length} strays`);
    out.push('');
    const bySection = new Map<string, StrayErrand[]>();
    for (const stray of mine) {
      const key = `${stray.store} / ${stray.section}`;
      const group = bySection.get(key);
      if (group === undefined) bySection.set(key, [stray]);
      else group.push(stray);
    }
    for (const [key, group] of [...bySection.entries()].sort((a, b) => b[1].length - a[1].length)) {
      out.push(`- **${key}** (${group.length}):`);
      for (const stray of group.slice(0, 5)) {
        out.push(`  - ${stray.fdc_id} ${stray.description.slice(0, 60)}`);
      }
      if (group.length > 5) out.push(`  - … ${group.length - 5} more`);
    }
    out.push('');
  }
  if (strays.length === 0) out.push('No strays — every errand used the known vocabulary. ✔');
  return `${out.join('\n')}\n`;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const positional = process.argv[2];
  const input =
    positional === undefined || positional.startsWith('--') ? BASELINE_DIR : positional;
  const outPath = flag('output') ?? 'scripts/translate/out/errand-strays.md';

  const records = loadRecords(input);
  const { strays, surfaces } = findStrays(records);
  if (surfaces === 0) {
    // A clean report over zero surfaces is a lie — legacy bare-language
    // keys ('en'/'ja'/'zh') or the wrong file entirely.
    throw new Error(
      `${input}: 0 locale surfaces found across ${records.length} records — ` +
        'is this file keyed by BCP-47 tags (en-US/ja-JP/zh-CN)?',
    );
  }
  writeFileSync(outPath, renderStrays(strays, records.length));
  console.log(`${strays.length} strays across ${records.length} records → ${outPath}`);
}
