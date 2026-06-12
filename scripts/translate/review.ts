import { writeFileSync } from 'node:fs';
import { flag, readJsonl, root } from './lib.js';
import { LOCALES } from './locales.js';

/**
 * Renders a results JSONL as a reviewable markdown document. Understands
 * the current contract (BCP-47 locale keys, errand, locale-level notes) and
 * the legacy test-batch shape (en/ja/zh keys, availability object).
 *
 *   npx tsx scripts/translate/review.ts [--input out/<file>.jsonl] [--output out/<file>.review.md]
 */
const INPUT = flag('input') ?? `${root}scripts/translate/out/claude-opus-4-8.jsonl`;
// Append-based default: a bare .replace() was a silent no-op for non-.jsonl
// inputs, making OUTPUT === INPUT and clobbering the paid results file.
const OUTPUT =
  flag('output') ??
  (INPUT.endsWith('.jsonl') ? INPUT.replace(/\.jsonl$/, '.review.md') : `${INPUT}.review.md`);
if (OUTPUT === INPUT) throw new Error('--output must differ from --input.');

interface LocaleResult {
  name?: string;
  names?: string; // legacy key
  aliases: string[];
  errand?: { store: string; section: string } | null;
  notes?: string[];
  availability?: { level: string; brands: string[]; notes: string[] }; // legacy
}
interface Row {
  slug: string;
  fdc_id: number;
  description: string;
  category: string;
  error?: string;
  result?: Record<string, unknown> & { brand: string | null };
}

const rows = readJsonl<Row>(INPUT).sort((a, b) => a.slug.localeCompare(b.slug));

function localeBlock(tag: string, l: LocaleResult): string {
  const lines: string[] = [];
  const name = l.name ?? l.names;
  lines.push(name !== undefined ? `- **${tag}**: ${name}` : `- **${tag}**`);
  if (l.aliases.length > 0) lines.push(`  - aliases: ${l.aliases.join(' · ')}`);
  if (l.errand === null) lines.push('  - errand: **null** (non-retail)');
  else if (l.errand !== undefined) lines.push(`  - errand: ${l.errand.store} → ${l.errand.section}`);
  for (const note of l.notes ?? []) lines.push(`  - ${note}`);
  if (l.availability !== undefined) {
    const a = l.availability;
    const brands = a.brands.length > 0 ? `  brands: ${a.brands.join(', ')}` : '';
    lines.push(`  - availability: **${a.level}**${brands}`);
    for (const note of a.notes) lines.push(`  - ${note}`);
  }
  return lines.join('\n');
}

// Locale-table tags first, then their bare-language legacy spellings.
const LOCALE_KEYS = [...LOCALES.map((l) => l.tag), ...LOCALES.map((l) => l.tag.split('-')[0] ?? '')];

const out: string[] = [
  `# Translation review — ${INPUT.split(/[\\/]/).pop()}`,
  '',
  `${rows.length} items, ${rows.filter((r) => r.error !== undefined).length} failed.`,
  '',
];
for (const row of rows) {
  out.push(`## ${row.description}`);
  out.push(`\`${row.slug}\` · fdc ${row.fdc_id} · ${row.category}`);
  out.push('');
  if (row.error !== undefined || row.result === undefined) {
    out.push(`**FAILED**: ${row.error ?? 'no result'}`);
    out.push('');
    continue;
  }
  if (row.result.brand !== null) out.push(`**brand**: ${row.result.brand}`);
  for (const key of LOCALE_KEYS) {
    const locale = row.result[key] as LocaleResult | undefined;
    if (locale !== undefined) out.push(localeBlock(key, locale));
  }
  out.push('');
}
writeFileSync(OUTPUT, `${out.join('\n')}\n`);
console.log(`Wrote ${OUTPUT}`);
