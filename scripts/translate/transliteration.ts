import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BASELINE_DIR, loadRecords } from './baseline.js';
import { flag } from './lib.js';
import { LOCALES } from './locales.js';

/**
 * Review aid for the cheap-tier pass. strays.ts catches off-vocabulary
 * store/section pairs, but it is blind to the alias failure we measured
 * 2026-06-13: a cheap model that gets the section right (精肉/meat) can still
 * emit a literal-katakana transliteration of an English term (トップラウンド
 * ステーキ) where the native name belongs (牛もも肉). Nothing downstream sees
 * that, so this surfaces it for a human.
 *
 * It is a SORT, not a classifier. A high katakana ratio marks a loanword-
 * shaped alias — which a legitimate loanword (フライドポテト, ヨーグルト) also
 * has. The heuristic can't know whether a native term exists; it narrows
 * where a reviewer looks. On the cheap tier (plain staples) these are
 * uncommon, so the flagged list is short and worth scanning. The mixed
 * meat-cut cases (チャック角切り) score lower and are routed to the strong
 * model anyway.
 *
 *   npx tsx scripts/translate/transliteration.ts <results.jsonl>
 *     [--threshold 0.8] [--output scripts/translate/out/transliteration.md]
 */
export interface FlaggedAlias {
  readonly alias: string;
  readonly ratio: number;
}
export interface TransliterationFlag {
  readonly locale: string;
  readonly fdc_id: number;
  readonly description: string;
  readonly aliases: FlaggedAlias[];
}

// Katakana proper (excludes ・ U+30FB and the rare U+30A0) plus the prolonged
// sound mark ー (U+30FC) and halfwidth katakana.
const KATAKANA = /[ァ-ヺー-ヿｦ-ﾟ]/u;
// "Content" = letters/numbers; drop whitespace, punctuation, and symbols so
// （）・, and spaces don't dilute the ratio.
const PUNCT_OR_SPACE = /[\s\p{P}\p{S}]/u;

/** Fraction of a string's content characters that are katakana (0 when empty). */
export function katakanaRatio(text: string): number {
  const content = [...text].filter((ch) => !PUNCT_OR_SPACE.test(ch));
  if (content.length === 0) return 0;
  const kata = content.filter((ch) => KATAKANA.test(ch)).length;
  return kata / content.length;
}

interface ResultRecord {
  readonly fdc_id?: number;
  readonly description?: string;
  readonly result?: Record<string, unknown>;
}

/**
 * Flags foods whose aliases include a mostly-katakana entry (ratio ≥
 * threshold). Runs across every locale, but only Japanese aliases carry
 * katakana, so non-Japanese locales never flag — no per-locale special case.
 */
export function flagTransliterations(
  records: readonly ResultRecord[],
  threshold = 0.8,
): TransliterationFlag[] {
  const flags: TransliterationFlag[] = [];
  for (const record of records) {
    if (record.result === undefined) continue;
    for (const spec of LOCALES) {
      const locale = record.result[spec.tag];
      if (locale === null || typeof locale !== 'object') continue;
      const aliases = (locale as Record<string, unknown>)['aliases'];
      if (!Array.isArray(aliases)) continue;
      const hits = aliases
        .filter((a): a is string => typeof a === 'string')
        .map((alias) => ({ alias, ratio: katakanaRatio(alias) }))
        .filter((a) => a.ratio >= threshold);
      if (hits.length > 0) {
        flags.push({
          locale: spec.tag,
          fdc_id: record.fdc_id ?? -1,
          description: record.description ?? '',
          aliases: hits,
        });
      }
    }
  }
  // Loudest first: most flagged aliases, then highest single ratio.
  return flags.sort(
    (a, b) =>
      b.aliases.length - a.aliases.length ||
      Math.max(...b.aliases.map((x) => x.ratio)) - Math.max(...a.aliases.map((x) => x.ratio)),
  );
}

export function renderFlags(flags: readonly TransliterationFlag[], threshold: number): string {
  const out: string[] = [
    '# Transliteration candidates — loanword-shaped aliases to spot-check',
    '',
    `${flags.length} foods have an alias ≥ ${Math.round(threshold * 100)}% katakana. Each is`,
    'either a legitimate loanword (フライドポテト) or a lazy transliteration of an',
    'English term where a native name belongs (トップラウンドステーキ → 牛もも肉).',
    'Confirm by hand; fix lazy ones by editing the stored baseline.',
    '',
  ];
  for (const f of flags) {
    const list = f.aliases.map((a) => `${a.alias} (${Math.round(a.ratio * 100)}%)`).join(', ');
    out.push(`- **${f.fdc_id}** ${f.description.slice(0, 60)} — ${f.locale}: ${list}`);
  }
  if (flags.length === 0) out.push('No flags — no mostly-katakana aliases at this threshold. ✔');
  return `${out.join('\n')}\n`;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const positional = process.argv[2];
  const input = positional === undefined || positional.startsWith('--') ? BASELINE_DIR : positional;
  const threshold = Number(flag('threshold') ?? '0.8');
  const outPath = flag('output') ?? 'scripts/translate/out/transliteration.md';

  const records = loadRecords(input);
  const flags = flagTransliterations(records, threshold);
  writeFileSync(outPath, renderFlags(flags, threshold));
  console.log(`${flags.length} transliteration candidates across ${records.length} records → ${outPath}`);
}
