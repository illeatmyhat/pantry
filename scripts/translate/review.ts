import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Renders a results JSONL as a reviewable markdown document. Understands
 * the current contract (BCP-47 locale keys, errand, locale-level notes) and
 * the legacy test-batch shape (en/ja/zh keys, availability object).
 *
 *   npx tsx scripts/translate/review.ts [--input out/<file>.jsonl] [--output out/<file>.review.md]
 */
const root = fileURLToPath(new URL('../../', import.meta.url));

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value ?? fallback;
}
const INPUT = flag('input', `${root}scripts/translate/out/claude-opus-4-8.jsonl`);
const OUTPUT = flag('output', INPUT.replace(/\.jsonl$/, '.review.md'));

interface LocaleResult {
  name?: string;
  names?: string; // legacy key
  aliases: string[];
  errand?: { store: string; section: string };
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

const rows = readFileSync(INPUT, 'utf8')
  .split('\n')
  .filter((l) => l !== '')
  .map((l) => JSON.parse(l) as Row)
  .sort((a, b) => a.slug.localeCompare(b.slug));

function localeBlock(tag: string, l: LocaleResult): string {
  const lines: string[] = [];
  const name = l.name ?? l.names;
  lines.push(name !== undefined ? `- **${tag}**: ${name}` : `- **${tag}**`);
  if (l.aliases.length > 0) lines.push(`  - aliases: ${l.aliases.join(' · ')}`);
  if (l.errand !== undefined) lines.push(`  - errand: ${l.errand.store} → ${l.errand.section}`);
  for (const note of l.notes ?? []) lines.push(`  - ${note}`);
  if (l.availability !== undefined) {
    const a = l.availability;
    const brands = a.brands.length > 0 ? `  brands: ${a.brands.join(', ')}` : '';
    lines.push(`  - availability: **${a.level}**${brands}`);
    for (const note of a.notes) lines.push(`  - ${note}`);
  }
  return lines.join('\n');
}

const LOCALE_KEYS = ['en-US', 'ja-JP', 'zh-CN', 'en', 'ja', 'zh'];

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
