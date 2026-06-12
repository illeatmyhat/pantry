import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import type { ManifestEntry } from '../../src/toolkit/search.js';

/**
 * Phase 1 of the per-locale Errand-section vocabulary (open-coding pass): ask the
 * model for FREE-TEXT store sections per locale — the sign a local
 * supermarket would hang over the aisle — with no enum to force wrong fits.
 * Phase 2 (`aggregate`) clusters the answers into a proposed per-locale
 * vocabulary for human review; the frozen result becomes the per-locale
 * enums of the production schema.
 *
 *   npx tsx scripts/translate/discover-errands.ts sample [--per-category 20] [--seed 20260612]
 *   npx tsx scripts/translate/discover-errands.ts submit [--model claude-opus-4-8]
 *   npx tsx scripts/translate/discover-errands.ts collect --batch-id msgbatch_…
 *   npx tsx scripts/translate/discover-errands.ts aggregate
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = `${root}scripts/translate/out`;
const samplePath = `${outDir}/errand-sample.json`;
const resultsPath = `${outDir}/errand-discovery.jsonl`;

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value ?? fallback;
}
const COMMAND = process.argv[2];

const SYSTEM_PROMPT = `You know how grocery retail is physically organized in the United States, Japan, and mainland China.

For the given USDA food, name the store section where a shopper finds it — the literal sign text a typical supermarket in that market would hang over that aisle/area. Rules:
- Use THAT market's own retail vocabulary in its own language (e.g. a Japanese supermarket's 日配品, 菓子, ベビー用品 — not translations of American aisle names).
- If the food is realistically NOT sold in an ordinary supermarket there (specialty shop or online order instead), still name the section of whatever store DOES carry it, and set store accordingly.
- Be consistent: the same kind of food should get the same section name.
- Answer for a typical large supermarket, not a niche format.

Output ONLY JSON: {"en": {"store": "primary"|"specialty"|"online", "section": string},
 "ja": { same }, "zh": { same }} — section in English for en, Japanese for ja, Simplified Chinese for zh.`;

const SCHEMA = {
  type: 'object',
  properties: {
    en: localeSchema(),
    ja: localeSchema(),
    zh: localeSchema(),
  },
  required: ['en', 'ja', 'zh'],
  additionalProperties: false,
} as const;

function localeSchema(): object {
  return {
    type: 'object',
    properties: {
      store: { enum: ['primary', 'specialty', 'online'] },
      section: { type: 'string' },
    },
    required: ['store', 'section'],
    additionalProperties: false,
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const client = new Anthropic();

if (COMMAND === 'sample') {
  const perCategory = Number(flag('per-category', '20'));
  const rand = mulberry32(Number(flag('seed', '20260612')));
  const manifest = JSON.parse(
    readFileSync(`${root}generated/manifest.json`, 'utf8'),
  ) as ManifestEntry[];
  const byCategory = new Map<string, ManifestEntry[]>();
  for (const entry of manifest) {
    const list = byCategory.get(entry.category);
    if (list === undefined) byCategory.set(entry.category, [entry]);
    else list.push(entry);
  }
  const sample: ManifestEntry[] = [];
  for (const [, entries] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const pool = [...entries];
    for (let n = 0; n < perCategory && pool.length > 0; n += 1) {
      const i = Math.floor(rand() * pool.length);
      const [picked] = pool.splice(i, 1);
      if (picked !== undefined) sample.push(picked);
    }
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(samplePath, `${JSON.stringify(sample, null, 1)}\n`);
  console.log(`Sampled ${sample.length} foods across ${byCategory.size} categories → ${samplePath}`);
} else if (COMMAND === 'submit') {
  const foods = JSON.parse(readFileSync(samplePath, 'utf8')) as ManifestEntry[];
  const batch = await client.messages.batches.create({
    requests: foods.map((entry) => ({
      custom_id: `fdc-${entry.fdc_id}`,
      params: {
        model: flag('model', 'claude-opus-4-8'),
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: 'json_schema' as const, schema: SCHEMA } },
        messages: [
          {
            role: 'user' as const,
            content: `Description: ${entry.description}\nCategory: ${entry.category}`,
          },
        ],
      },
    })),
  });
  console.log(`Submitted ${foods.length} as ${batch.id}`);
  console.log(`Collect with: npx tsx scripts/translate/discover-errands.ts collect --batch-id ${batch.id}`);
} else if (COMMAND === 'collect') {
  const batchId = flag('batch-id', '');
  if (batchId === '') throw new Error('collect needs --batch-id');
  let batch = await client.messages.batches.retrieve(batchId);
  while (batch.processing_status !== 'ended') {
    console.log(`${batch.processing_status}: ${batch.request_counts.processing} processing`);
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    batch = await client.messages.batches.retrieve(batchId);
  }
  const byFdcId = new Map(
    (JSON.parse(readFileSync(samplePath, 'utf8')) as ManifestEntry[]).map((f) => [
      `fdc-${f.fdc_id}`,
      f,
    ]),
  );
  const lines: string[] = [];
  let inTok = 0;
  let outTok = 0;
  for await (const result of await client.messages.batches.results(batchId)) {
    const entry = byFdcId.get(result.custom_id);
    if (result.result.type !== 'succeeded' || entry === undefined) {
      lines.push(JSON.stringify({ custom_id: result.custom_id, error: result.result.type }));
      continue;
    }
    const message = result.result.message;
    inTok += message.usage.input_tokens;
    outTok += message.usage.output_tokens;
    const text = message.content.find((b) => b.type === 'text')?.text ?? '{}';
    lines.push(JSON.stringify({ ...entry, result: JSON.parse(text) as unknown }));
  }
  writeFileSync(resultsPath, `${lines.join('\n')}\n`);
  const cost = (inTok / 1e6) * 2.5 + (outTok / 1e6) * 12.5;
  console.log(`${lines.length} results → ${resultsPath}  (~$${cost.toFixed(2)} batch rates)`);
} else if (COMMAND === 'aggregate') {
  interface Row {
    description?: string;
    category?: string;
    result?: Record<string, { store: string; section: string }>;
  }
  const rows = readFileSync(resultsPath, 'utf8')
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l) as Row)
    .filter((r) => r.result !== undefined);
  const out: string[] = [`# Errand-section vocabulary discovery — ${rows.length} foods`, ''];
  for (const loc of ['en', 'ja', 'zh']) {
    const counts = new Map<string, { n: number; stores: Map<string, number>; examples: string[] }>();
    for (const row of rows) {
      const r = row.result?.[loc];
      if (r === undefined) continue;
      const key = r.section.trim();
      const c = counts.get(key) ?? { n: 0, stores: new Map<string, number>(), examples: [] };
      c.n += 1;
      c.stores.set(r.store, (c.stores.get(r.store) ?? 0) + 1);
      if (c.examples.length < 3 && row.description !== undefined) {
        c.examples.push(row.description.slice(0, 50));
      }
      counts.set(key, c);
    }
    out.push(`## ${loc} — ${counts.size} distinct sections`);
    out.push('');
    out.push('| section | n | stores | examples |');
    out.push('|---|---|---|---|');
    for (const [section, c] of [...counts.entries()].sort((a, b) => b[1].n - a[1].n)) {
      const stores = [...c.stores.entries()].map(([s, n]) => `${s}:${n}`).join(' ');
      out.push(`| ${section} | ${c.n} | ${stores} | ${c.examples.join(' · ')} |`);
    }
    out.push('');
  }
  const aggPath = `${outDir}/errand-vocabulary-proposal.md`;
  writeFileSync(aggPath, `${out.join('\n')}\n`);
  console.log(`Wrote ${aggPath}`);
} else {
  console.log('Usage: discover-errands.ts sample|submit|collect|aggregate — see header.');
  process.exit(1);
}
