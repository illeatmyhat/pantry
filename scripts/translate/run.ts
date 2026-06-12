import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractJson, SYSTEM_PROMPT, userContent, validateShape } from './task.js';
import type { ManifestEntry } from '../../src/toolkit/search.js';

/**
 * Batch-translates food descriptions against a local OpenAI-style endpoint
 * (Ollama). Model-agnostic on purpose: the model is a flag, the judge of
 * quality is the review pass, and the pipeline doesn't care who generated
 * the candidate.
 *
 *   npx tsx scripts/translate/run.ts [--model qwen3.6:35b-a3b-q4_K_M]
 *     [--input scripts/translate/out/sample.json] [--concurrency 2]
 *
 * Output: scripts/translate/out/<model>.jsonl — one line per food:
 *   { fdc_id, slug, description, category, ms, result | error }
 */
const root = fileURLToPath(new URL('../../', import.meta.url));

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value ?? fallback;
}
const MODEL = flag('model', 'qwen3.6:35b-a3b-q4_K_M');
const INPUT = flag('input', `${root}scripts/translate/out/sample.json`);
const CONCURRENCY = Number(flag('concurrency', '2'));
const ENDPOINT = flag('endpoint', 'http://localhost:11434');

interface OllamaChatResponse {
  message?: { content?: string };
  eval_count?: number;
  error?: string;
}

// NOTE on endpoint choice (2026-06-11, Ollama 0.30.7): the OpenAI-compat
// /v1 endpoint enforces json_schema but intermittently wedges (all requests
// hang) and grammar decode runs ~8x slower. /api/chat is stable and honors
// think:false, but silently ignores `format` — so the shape contract is
// enforced by validateShape() + one retry instead of a server-side grammar.
async function translateOne(entry: ManifestEntry): Promise<{ result: unknown; tokens: number }> {
  const response = await fetch(`${ENDPOINT}/api/chat`, {
    method: 'POST',
    // A healthy item takes seconds; minutes means the server is paging or
    // dead — fail fast and let the retry/resume machinery handle it.
    signal: AbortSignal.timeout(180_000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      options: { temperature: 0.7, top_p: 0.8 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent(entry) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as OllamaChatResponse;
  if (data.error !== undefined) throw new Error(data.error);
  const content = data.message?.content;
  if (content === undefined) throw new Error('empty response');
  const result = JSON.parse(extractJson(content)) as unknown;
  validateShape(result);
  return { result, tokens: data.eval_count ?? 0 };
}

const allFoods = JSON.parse(readFileSync(INPUT, 'utf8')) as ManifestEntry[];
const outPath = flag('output', `${root}scripts/translate/out/${MODEL.replaceAll(/[:/]/g, '_')}.jsonl`);
mkdirSync(`${root}scripts/translate/out`, { recursive: true });

// Resume by default: keep prior successes, redo failures and the not-yet-run.
const RESUME = !process.argv.includes('--fresh');
let kept: string[] = [];
if (RESUME && existsSync(outPath)) {
  const prior = readFileSync(outPath, 'utf8')
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l) as { slug: string; error?: string });
  const ok = new Set(prior.filter((r) => r.error === undefined).map((r) => r.slug));
  kept = readFileSync(outPath, 'utf8')
    .split('\n')
    .filter((l) => l !== '' && !(JSON.parse(l) as { error?: string }).error);
  console.log(`Resuming: ${ok.size} prior successes kept.`);
}
const keptSlugs = new Set(kept.map((l) => (JSON.parse(l) as { slug: string }).slug));
const foods = allFoods.filter((f) => !keptSlugs.has(f.slug));
writeFileSync(outPath, kept.length > 0 ? `${kept.join('\n')}\n` : '');

// Pay the cold model load once, outside the per-item timeout budget.
// Warm with a REAL full-size request and no timeout: the first long-prompt
// evaluation after model load takes minutes (graph/cache warmup) and would
// otherwise eat both timeout attempts of the first item. A tiny "hi" does
// not exercise it. Identical system prefix also primes the prefix KV cache
// every later item reuses.
// stream:true so headers arrive before the (minutes-long) first prompt
// eval — undici's 300s headers timeout would otherwise kill the warmup.
console.log('Warming model (first full-size prompt takes minutes — one-time cost)…');
const warmupStarted = performance.now();
const warmup = await fetch(`${ENDPOINT}/api/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    stream: true,
    think: false,
    options: { temperature: 0.7, top_p: 0.8 },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'Description: Salt, table\nCategory: Spices and Herbs' },
    ],
  }),
});
for await (const chunk of warmup.body ?? []) void chunk; // drain until generation completes
console.log(`Model warm in ${((performance.now() - warmupStarted) / 1000).toFixed(0)}s; starting batch.`);

let done = 0;
let failed = 0;
const started = performance.now();
const queue = [...foods];

async function worker(): Promise<void> {
  for (let entry = queue.shift(); entry !== undefined; entry = queue.shift()) {
    const t0 = performance.now();
    let record: Record<string, unknown>;
    try {
      let outcome: { result: unknown; tokens: number };
      try {
        outcome = await translateOne(entry);
      } catch {
        outcome = await translateOne(entry); // one retry — local models hiccup
      }
      record = {
        ...entry,
        ms: Math.round(performance.now() - t0),
        tokens: outcome.tokens,
        result: outcome.result,
      };
    } catch (error) {
      failed += 1;
      record = { ...entry, ms: Math.round(performance.now() - t0), error: String(error) };
    }
    done += 1;
    appendFileSync(outPath, `${JSON.stringify(record)}\n`);
    const rate = ((performance.now() - started) / done / 1000).toFixed(1);
    console.log(`[${done}/${foods.length}] ${rate}s/item ${entry.slug}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
const totalS = ((performance.now() - started) / 1000).toFixed(0);
console.log(`\n${done - failed} ok, ${failed} failed in ${totalS}s → ${outPath}`);
if (foods.length > 0) {
  const perItem = (performance.now() - started) / foods.length / 1000;
  console.log(`~${perItem.toFixed(1)}s/item → full 7,793 ≈ ${(perItem * 7793 / 3600).toFixed(1)} h`);
}
