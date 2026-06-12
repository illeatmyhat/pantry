import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { flag, root } from './lib.js';
import { extractJson, SCHEMA, SYSTEM_PROMPT, userContent, validateShape } from './task.js';
import type { ManifestEntry } from '../../src/toolkit/search.js';

/**
 * Translates foods through the Anthropic Message Batches API (50% of
 * standard prices, usually done within the hour). Same task contract as the
 * local runner (task.ts); results land in the same JSONL format so the
 * review tooling works unchanged.
 *
 *   npx tsx scripts/translate/batch-claude.ts submit [--model claude-haiku-4-5]
 *     [--input scripts/translate/out/sample.json] [--limit N]
 *   npx tsx scripts/translate/batch-claude.ts collect --batch-id msgbatch_…
 *
 * `submit` records {model, input} per batch id in out/batches.json so
 * `collect` is self-describing — collecting with the wrong flags used to
 * mislabel results, price them at the wrong rates, and drop identity
 * fields (code-review 2026-06-12). Requires ANTHROPIC_API_KEY.
 */
const BATCHES_PATH = `${root}scripts/translate/out/batches.json`;

interface BatchInfo {
  readonly model: string;
  readonly input: string;
  readonly submitted_at: string;
}

function readBatches(): Record<string, BatchInfo> {
  return existsSync(BATCHES_PATH)
    ? (JSON.parse(readFileSync(BATCHES_PATH, 'utf8')) as Record<string, BatchInfo>)
    : {};
}

const COMMAND = process.argv[2];
const client = new Anthropic();

if (COMMAND === 'submit') {
  const model = flag('model') ?? 'claude-haiku-4-5';
  const input = flag('input') ?? `${root}scripts/translate/out/sample.json`;
  const limit = Number(flag('limit') ?? '0');
  let foods = JSON.parse(readFileSync(input, 'utf8')) as ManifestEntry[];
  if (limit > 0) foods = foods.slice(0, limit);

  const batch = await client.messages.batches.create({
    requests: foods.map((entry) => ({
      custom_id: `fdc-${entry.fdc_id}`,
      params: {
        model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: 'json_schema' as const, schema: SCHEMA } },
        messages: [{ role: 'user' as const, content: userContent(entry) }],
      },
    })),
  });
  mkdirSync(`${root}scripts/translate/out`, { recursive: true });
  const batches = readBatches();
  batches[batch.id] = { model, input, submitted_at: new Date().toISOString() };
  writeFileSync(BATCHES_PATH, `${JSON.stringify(batches, null, 1)}\n`);
  console.log(`Submitted ${foods.length} requests as ${batch.id} (${batch.processing_status})`);
  console.log(`Collect with: npx tsx scripts/translate/batch-claude.ts collect --batch-id ${batch.id}`);
} else if (COMMAND === 'collect') {
  const batchId = flag('batch-id') ?? '';
  if (batchId === '') throw new Error('collect needs --batch-id');
  const info = readBatches()[batchId];
  const model = flag('model') ?? info?.model;
  const input = flag('input') ?? info?.input;
  if (model === undefined || input === undefined) {
    throw new Error(
      `batch ${batchId} not in ${BATCHES_PATH} — pass --model and --input explicitly.`,
    );
  }

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
    (JSON.parse(readFileSync(input, 'utf8')) as ManifestEntry[]).map((f) => [`fdc-${f.fdc_id}`, f]),
  );
  const outPath = flag('output') ?? `${root}scripts/translate/out/${model}.jsonl`;
  mkdirSync(`${root}scripts/translate/out`, { recursive: true });

  const lines: string[] = [];
  let ok = 0;
  let failed = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const result of await client.messages.batches.results(batchId)) {
    const entry = byFdcId.get(result.custom_id);
    if (entry === undefined) {
      // Identity fields must never silently degrade — downstream merge,
      // corrections, and strays all key on fdc_id.
      throw new Error(`${result.custom_id} not in ${input} — wrong --input for this batch?`);
    }
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
  const price = model.includes('haiku')
    ? { in: 0.5, out: 2.5 }
    : model.includes('sonnet')
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
