import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { readJsonl, root } from './lib.js';
import { LOCALES } from './locales.js';

/**
 * Phase 2 of the vocabulary freeze: validate the proposed per-locale
 * vocabularies (l10n/vocabulary/<tag>.yaml) against the discovery data and
 * render the review document — per-canonical counts, every merge shown,
 * and a loud list of anything still unmapped.
 *
 *   npx tsx scripts/translate/vocab.ts
 */
interface VocabSection {
  slug: string;
  label: string;
  note?: string;
  merges: string[];
}
interface VocabPattern {
  match: string;
  slug: string;
}
interface Vocab {
  status: string;
  sections: VocabSection[];
  /** Foods that ship `errand: null` — audit-only routing, checked before patterns. */
  non_retail?: { merges?: string[]; patterns?: string[] };
  patterns?: VocabPattern[];
}

/** Audit display bucket for foods that ship `errand: null`. */
const NON_RETAIL = '(errand: null)';
interface DiscoveryRow {
  description?: string;
  result?: Record<string, { store: string; section: string }>;
}

const rows = readJsonl<DiscoveryRow>(`${root}scripts/translate/out/errand-discovery.jsonl`).filter(
  (r) => r.result !== undefined,
);

const out: string[] = [
  '# Errand-section vocabulary proposal — review document',
  '',
  '> **Non-retail: settled (2026-06-12).** Restaurant menu items, industrial',
  '> ingredients, and subsistence/foraged foods get `errand: null` — the schema',
  '> is nullable and there are no parking slugs (the `restaurant` slug was',
  '> dropped). The `(errand: null)` row below shows what the discovery tail',
  '> routes there for audit purposes.',
  '',
];
let totalUnmapped = 0;

for (const spec of LOCALES) {
  const vocab = parse(
    readFileSync(`${root}l10n/vocabulary/${spec.tag}.yaml`, 'utf8'),
  ) as Vocab;

  // Map observed free-text section → canonical slug (label and merges both match).
  const toSlug = new Map<string, string>();
  for (const section of vocab.sections) {
    toSlug.set(section.label, section.slug);
    for (const variant of section.merges) toSlug.set(variant, section.slug);
  }
  for (const variant of vocab.non_retail?.merges ?? []) toSlug.set(variant, NON_RETAIL);
  const nonRetailPatterns = (vocab.non_retail?.patterns ?? []).map((p) => new RegExp(p, 'i'));

  // Tolerate the pre-BCP-47 discovery batch (bare language keys).
  const key =
    rows[0]?.result !== undefined && spec.tag in (rows[0].result ?? {})
      ? spec.tag
      : (spec.tag.split('-')[0] ?? spec.tag);

  const counts = new Map<string, { n: number; examples: string[] }>();
  const unmapped = new Map<string, { n: number; examples: string[] }>();
  const patterns = (vocab.patterns ?? []).map((p) => ({
    re: new RegExp(p.match, 'i'),
    slug: p.slug,
  }));
  for (const row of rows) {
    const r = row.result?.[key];
    if (r === undefined) continue;
    const observed = r.section.trim();
    const slug =
      toSlug.get(observed) ??
      (nonRetailPatterns.some((re) => re.test(observed)) ? NON_RETAIL : undefined) ??
      patterns.find((p) => p.re.test(observed))?.slug;
    const bucket = slug !== undefined ? counts : unmapped;
    const bucketKey = slug ?? observed;
    const entry = bucket.get(bucketKey) ?? { n: 0, examples: [] };
    entry.n += 1;
    if (entry.examples.length < 3 && row.description !== undefined) {
      entry.examples.push(row.description.slice(0, 45));
    }
    bucket.set(bucketKey, entry);
  }

  totalUnmapped += [...unmapped.values()].reduce((s, u) => s + u.n, 0);
  out.push(`## ${spec.tag} — ${vocab.sections.length} canonical sections (${vocab.status})`);
  out.push('');
  out.push('| slug | label | foods | folds in |');
  out.push('|---|---|---|---|');
  for (const section of vocab.sections) {
    const n = counts.get(section.slug)?.n ?? 0;
    out.push(
      `| ${section.slug} | ${section.label} | ${n} | ${section.merges.filter((m) => m !== section.label).join('、') || '—'} |`,
    );
  }
  const nonRetail = counts.get(NON_RETAIL);
  if (nonRetail !== undefined) {
    out.push(`| ${NON_RETAIL} | non-retail | ${nonRetail.n} | ${nonRetail.examples.join(' · ')} |`);
  }
  out.push('');
  if (unmapped.size > 0) {
    out.push(`### ⚠ unmapped (${[...unmapped.values()].reduce((s, u) => s + u.n, 0)} foods)`);
    out.push('');
    for (const [section, u] of [...unmapped.entries()].sort((a, b) => b[1].n - a[1].n)) {
      out.push(`- **${section}** (${u.n}): ${u.examples.join(' · ')}`);
    }
    out.push('');
  } else {
    out.push('All discovery answers mapped. ✔');
    out.push('');
  }
}

const outPath = `${root}scripts/translate/out/vocabulary-review.md`;
writeFileSync(outPath, `${out.join('\n')}\n`);
console.log(`Wrote ${outPath}${totalUnmapped > 0 ? ` — ${totalUnmapped} foods unmapped` : ' — full coverage'}`);
