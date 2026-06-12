import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Renders a results JSONL as a reviewable markdown document.
 *
 *   npx tsx scripts/translate/review.ts [--input out/claude-haiku-4-5.jsonl]
 *     [--output out/review.md]
 */
const root = fileURLToPath(new URL('../../', import.meta.url));

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value ?? fallback;
}
const INPUT = flag('input', `${root}scripts/translate/out/claude-haiku-4-5.jsonl`);
const OUTPUT = flag('output', INPUT.replace(/\.jsonl$/, '.review.md'));

interface LocaleResult {
  names: string;
  aliases: string[];
  availability: { level: string; brands: string[]; notes: string[] };
}
interface Row {
  slug: string;
  fdc_id: number;
  description: string;
  category: string;
  error?: string;
  result?: { brand: string | null; en: LocaleResult; ja: LocaleResult; zh: LocaleResult };
}

const rows = readFileSync(INPUT, 'utf8')
  .split('\n')
  .filter((l) => l !== '')
  .map((l) => JSON.parse(l) as Row)
  .sort((a, b) => a.slug.localeCompare(b.slug));

function localeBlock(tag: string, l: LocaleResult, includeNames: boolean): string {
  const lines: string[] = [];
  if (includeNames) lines.push(`- **${tag}**: ${l.names}`);
  else lines.push(`- **${tag}**`);
  if (l.aliases.length > 0) lines.push(`  - aliases: ${l.aliases.join(' · ')}`);
  const a = l.availability;
  const brands = a.brands.length > 0 ? `  brands: ${a.brands.join(', ')}` : '';
  lines.push(`  - availability: **${a.level}**${brands}`);
  for (const note of a.notes) lines.push(`  - ${note}`);
  return lines.join('\n');
}

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
  out.push(localeBlock('en', row.result.en, false));
  out.push(localeBlock('ja', row.result.ja, true));
  out.push(localeBlock('zh', row.result.zh, true));
  out.push('');
}
writeFileSync(OUTPUT, `${out.join('\n')}\n`);
console.log(`Wrote ${OUTPUT}`);
