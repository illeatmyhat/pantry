import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

const SCHEMA = {
  type: 'object',
  properties: {
    ja: localeSchema(),
    zh: localeSchema(),
    brand: { type: ['string', 'null'] },
    availability_jp: availabilitySchema(),
    availability_cn: availabilitySchema(),
  },
  required: ['ja', 'zh', 'brand', 'availability_jp', 'availability_cn'],
} as const;

function localeSchema(): object {
  return {
    type: 'object',
    properties: {
      name: { type: 'string' },
      aliases: { type: 'array', items: { type: 'string' } },
    },
    required: ['name', 'aliases'],
  };
}
function availabilitySchema(): object {
  return {
    type: 'object',
    properties: {
      level: { enum: ['common', 'specialty', 'rare', 'unknown'] },
      note: { type: 'string' },
    },
    required: ['level', 'note'],
  };
}

const SYSTEM_PROMPT = `You translate USDA food database descriptions. Each description is a comma-structured taxonomy string (most general term first, qualifiers after), e.g. "Pork, cured, salt pork, raw".

For the given food, produce:
- ja.name: a faithful Japanese translation of the FULL structured description. Keep the taxonomic comma structure (use 、or ・ naturally). Translate technical food-science terms precisely (e.g. "raw"=生, "drained solids"=固形分のみ). Do NOT invent a friendly product name; this is a translation of the description.
- ja.aliases: 0-3 common everyday Japanese names a shopper would actually use for this exact food (empty array if none exists).
- zh.name / zh.aliases: the same for Simplified Chinese (mainland China usage).
- brand: if the description names a commercial brand or restaurant (e.g. PILLSBURY, KEEBLER, McDONALD'S), the brand name as commonly written; otherwise null.
- availability_jp / availability_cn: your judgment of how available this exact food is to an ordinary shopper in Japan / mainland China. level: "common" (any supermarket), "specialty" (import stores, online, dept-store food halls), "rare" (hard to find at all), "unknown". note: ONE short English sentence justifying the level (mention substitutes or where it is sold if relevant).

Translate faithfully; never guess nutrition facts; output only the JSON.`;

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

async function translateOne(entry: ManifestEntry): Promise<unknown> {
  const response = await fetch(`${ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      format: SCHEMA,
      options: { temperature: 0.7, top_p: 0.8, num_ctx: 4096 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Description: ${entry.description}\nCategory: ${entry.category}`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as OllamaChatResponse;
  if (data.error !== undefined) throw new Error(data.error);
  const content = data.message?.content;
  if (content === undefined) throw new Error('empty response');
  return JSON.parse(content) as unknown;
}

const foods = JSON.parse(readFileSync(INPUT, 'utf8')) as ManifestEntry[];
const outPath = `${root}scripts/translate/out/${MODEL.replaceAll(/[:/]/g, '_')}.jsonl`;
mkdirSync(`${root}scripts/translate/out`, { recursive: true });
writeFileSync(outPath, '');

let done = 0;
let failed = 0;
const started = performance.now();
const queue = [...foods];

async function worker(): Promise<void> {
  for (let entry = queue.shift(); entry !== undefined; entry = queue.shift()) {
    const t0 = performance.now();
    let record: Record<string, unknown>;
    try {
      let result: unknown;
      try {
        result = await translateOne(entry);
      } catch {
        result = await translateOne(entry); // one retry — local models hiccup
      }
      record = { ...entry, ms: Math.round(performance.now() - t0), result };
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
