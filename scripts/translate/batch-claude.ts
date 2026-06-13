import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { chunkOf, flag, root } from './lib.js';
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
 *     [--chunk K --of N]
 *   npx tsx scripts/translate/batch-claude.ts collect --batch-id msgbatch_…
 *
 * `submit` records {model, input, chunk, of} per batch id in out/batches.json
 * so `collect` is self-describing — collecting with the wrong flags used to
 * mislabel results, price them at the wrong rates, and drop identity
 * fields (code-review 2026-06-12). Requires ANTHROPIC_API_KEY.
 *
 * `--chunk K --of N` submits a contiguous, review-gated slice of the input:
 * the production run is the 7,793-food manifest as three chunks (the whole
 * corpus fits one batch API-wise — chunking gates spend so chunk 1 is
 * reviewed before chunks 2-3 are paid for). Each chunk collects to its own
 * `<model>.chunkKofN.jsonl` so same-model chunks never clobber each other.
 */
const BATCHES_PATH = `${root}scripts/translate/out/batches.json`;

interface BatchInfo {
  readonly model: string;
  readonly input: string;
  readonly submitted_at: string;
  readonly chunk?: number;
  readonly of?: number;
}

/** Suffix that keeps same-model chunk outputs from clobbering each other. */
function chunkTag(info: { chunk?: number; of?: number } | undefined): string {
  return info?.chunk !== undefined && info.of !== undefined
    ? `.chunk${info.chunk}of${info.of}`
    : '';
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
  const chunkArg = flag('chunk');
  const ofArg = flag('of');
  if ((chunkArg === undefined) !== (ofArg === undefined)) {
    throw new Error('--chunk and --of must be given together');
  }
  let foods = JSON.parse(readFileSync(input, 'utf8')) as ManifestEntry[];
  if (limit > 0) foods = foods.slice(0, limit);
  const chunk = chunkArg === undefined ? undefined : Number(chunkArg);
  const of = ofArg === undefined ? undefined : Number(ofArg);
  if (chunk !== undefined && of !== undefined) foods = chunkOf(foods, chunk, of);
  if (foods.length === 0) throw new Error('nothing to submit — the selected slice is empty');

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
  batches[batch.id] = {
    model,
    input,
    submitted_at: new Date().toISOString(),
    ...(chunk !== undefined && of !== undefined ? { chunk, of } : {}),
  };
  writeFileSync(BATCHES_PATH, `${JSON.stringify(batches, null, 1)}\n`);
  const slice = chunk !== undefined && of !== undefined ? ` (chunk ${chunk} of ${of})` : '';
  console.log(
    `Submitted ${foods.length} requests${slice} as ${batch.id} (${batch.processing_status})`,
  );
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
  const outPath = flag('output') ?? `${root}scripts/translate/out/${model}${chunkTag(info)}.jsonl`;
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
