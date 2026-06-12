import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { extractJson, SCHEMA, SYSTEM_PROMPT, userContent, validateShape } from './task.js';
import type { ManifestEntry } from '../../src/toolkit/search.js';

/**
 * Translates foods through the Anthropic Message Batches API (50% of
 * standard prices, usually done within the hour). Same task contract as the
 * local runner (task.ts); results land in the same JSONL format so the
 * watcher and review tooling work unchanged.
 *
 *   npx tsx scripts/translate/batch-claude.ts submit [--model claude-haiku-4-5]
 *     [--input scripts/translate/out/sample.json] [--limit N]
 *   npx tsx scripts/translate/batch-claude.ts collect --batch-id msgbatch_…
 *
 * `submit` prints the batch id and exits; `collect` polls until the batch
 * ends, then writes results. Requires ANTHROPIC_API_KEY.
 */
const root = fileURLToPath(new URL('../../', import.meta.url));

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value ?? fallback;
}
const COMMAND = process.argv[2];
const MODEL = flag('model', 'claude-haiku-4-5');
const INPUT = flag('input', `${root}scripts/translate/out/sample.json`);
const LIMIT = Number(flag('limit', '0'));

const client = new Anthropic();

if (COMMAND === 'submit') {
  let foods = JSON.parse(readFileSync(INPUT, 'utf8')) as ManifestEntry[];
  if (LIMIT > 0) foods = foods.slice(0, LIMIT);

  const batch = await client.messages.batches.create({
    requests: foods.map((entry) => ({
      custom_id: `fdc-${entry.fdc_id}`,
      params: {
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: 'json_schema' as const, schema: SCHEMA } },
        messages: [{ role: 'user' as const, content: userContent(entry) }],
      },
    })),
  });
  console.log(`Submitted ${foods.length} requests as ${batch.id} (${batch.processing_status})`);
  console.log(`Collect with: npx tsx scripts/translate/batch-claude.ts collect --batch-id ${batch.id}`);
} else if (COMMAND === 'collect') {
  const batchId = flag('batch-id', '');
  if (batchId === '') throw new Error('collect needs --batch-id');

  let batch = await client.messages.batches.retrieve(batchId);
  while (batch.processing_status !== 'ended') {
    console.log(
      `${batch.processing_status}: ${batch.request_counts.processing} processing, ` +
        `${batch.request_counts.succeeded} ok, ${batch.request_counts.errored} errored`,
    );
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    batch = await client.messages.batches.retrieve(batchId);
  }

  const byFdcId = new Map(
    (JSON.parse(readFileSync(INPUT, 'utf8')) as ManifestEntry[]).map((f) => [`fdc-${f.fdc_id}`, f]),
  );
  const outPath = flag('output', `${root}scripts/translate/out/${MODEL}.jsonl`);
  mkdirSync(`${root}scripts/translate/out`, { recursive: true });

  const lines: string[] = [];
  let ok = 0;
  let failed = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const result of await client.messages.batches.results(batchId)) {
    const entry = byFdcId.get(result.custom_id) ?? { slug: result.custom_id };
    let record: Record<string, unknown>;
    if (result.result.type === 'succeeded') {
      const message = result.result.message;
      inputTokens += message.usage.input_tokens;
      outputTokens += message.usage.output_tokens;
      try {
        const text = message.content.find((b) => b.type === 'text')?.text ?? '';
        const parsed = JSON.parse(extractJson(text)) as unknown;
        validateShape(parsed);
        ok += 1;
        record = { ...entry, tokens: message.usage.output_tokens, result: parsed };
      } catch (error) {
        failed += 1;
        record = { ...entry, error: String(error) };
      }
    } else {
      failed += 1;
      record = { ...entry, error: `batch result: ${result.result.type}` };
    }
    lines.push(JSON.stringify(record));
  }
  writeFileSync(outPath, `${lines.join('\n')}\n`);

  // Batch pricing = 50% of standard. Haiku 4.5: $1/$5 per MTok standard.
  const price = MODEL.includes('haiku')
    ? { in: 0.5, out: 2.5 }
    : MODEL.includes('sonnet')
      ? { in: 1.5, out: 7.5 }
      : { in: 2.5, out: 12.5 };
  const cost = (inputTokens / 1e6) * price.in + (outputTokens / 1e6) * price.out;
  console.log(`${ok} ok, ${failed} failed → ${outPath}`);
  console.log(
    `tokens: ${inputTokens} in / ${outputTokens} out ≈ $${cost.toFixed(3)} (batch rates)`,
  );
} else {
  console.log('Usage: batch-claude.ts submit|collect [flags] — see file header.');
  process.exit(1);
}
