import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// NOTE: Ollama 0.30's /api/chat silently ignores `format`; structured
// outputs only enforce through the OpenAI-compatible /v1 endpoint via
// response_format.json_schema (verified 2026-06-11).
//
// Output shape mirrors the first consumer's locale files
// (recipes data/ingredients/<locale>/<id>.yaml): names/aliases/aisle +
// availability{brands, notes}, notes in the market's language.
const SECTIONS = [
  'produce',
  'meat_seafood',
  'dairy_eggs',
  'dry_goods',
  'canned',
  'condiments',
  'spices',
  'oils',
  'international',
  'tofu_soy',
] as const;

const SCHEMA = {
  type: 'object',
  properties: {
    brand: { type: ['string', 'null'] },
    en: localeSchema(), // names omitted — the en-US name IS the description (mechanical)
    ja: localeSchema(),
    zh: localeSchema(),
  },
  required: ['brand', 'en', 'ja', 'zh'],
  additionalProperties: false,
} as const;

function localeSchema(): object {
  return {
    type: 'object',
    properties: {
      names: { type: 'string' },
      aliases: { type: 'array', items: { type: 'string' } },
      aisle: {
        type: 'object',
        properties: {
          store: { enum: ['supermarket', 'specialty', 'online'] },
          section: { enum: SECTIONS },
        },
        required: ['store', 'section'],
        additionalProperties: false,
      },
      availability: {
        type: 'object',
        properties: {
          level: { enum: ['common', 'specialty', 'rare', 'unknown'] },
          brands: { type: 'array', items: { type: 'string' } },
          notes: { type: 'array', items: { type: 'string' } },
        },
        required: ['level', 'brands', 'notes'],
        additionalProperties: false,
      },
    },
    required: ['names', 'aliases', 'aisle', 'availability'],
    additionalProperties: false,
  };
}

const SYSTEM_PROMPT = `You translate USDA food database descriptions. Each description is a comma-structured taxonomy string (most general term first, qualifiers after), e.g. "Pork, cured, salt pork, raw".

For the given food, produce:
- brand: if the description names a commercial brand or restaurant (e.g. PILLSBURY, KEEBLER, McDONALD'S), the brand name as commonly written; otherwise null.
- en.names: repeat the description VERBATIM (it is already the en-US name).
- en.aliases: 0-3 everyday names an American shopper would actually use for this exact food (e.g. "french bread" for "Bread, french or vienna..."). Empty array if none.
- en.aisle / en.availability: the same judgments as below, for a typical US supermarket; notes in English.
- ja.names: a faithful Japanese translation of the FULL structured description. Keep the taxonomic comma structure (use 、or ・ naturally). Translate technical food-science terms precisely (e.g. "raw"=生, "drained solids"=固形分のみ; "fresh" on meat means UNCURED, not raw — never translate it as 生 when the item is cooked). Do NOT invent a friendly product name; this is a translation of the description.
- ja.aliases: 0-3 common everyday Japanese names a shopper would actually use for this exact food (empty array if none exists).
- ja.aisle: where an ordinary shopper in Japan finds it. store: "supermarket" (a normal grocery store carries it), "specialty" (import stores, depachika), "online" (realistically online-only). section: the closest section.
- ja.availability: your judgment of this exact food in the Japanese market. level: "common" / "specialty" / "rare" / "unknown". brands: actual brand names sold in that market for this food — ONLY brands you are confident exist; an empty array is much better than a guess. notes: 0-2 short sentences IN JAPANESE with market guidance (where to find it, common substitutes). Empty array if you have nothing useful to say.
- zh.*: the same for mainland China, Simplified Chinese, notes in Chinese.

Translate faithfully; never invent brands; output ONLY a JSON object with exactly this shape:
{"brand": string|null,
 "en": {"names": string, "aliases": string[], "aisle": {"store": "supermarket"|"specialty"|"online", "section": "produce"|"meat_seafood"|"dairy_eggs"|"dry_goods"|"canned"|"condiments"|"spices"|"oils"|"international"|"tofu_soy"}, "availability": {"level": "common"|"specialty"|"rare"|"unknown", "brands": string[], "notes": string[]}},
 "ja": { same shape as en },
 "zh": { same shape as en }}`;

const STORES = new Set(['supermarket', 'specialty', 'online']);
const LEVELS = new Set(['common', 'specialty', 'rare', 'unknown']);
const SECTION_SET = new Set<string>(SECTIONS);

function validateShape(raw: unknown): void {
  const fail = (msg: string): never => {
    throw new Error(`shape: ${msg}`);
  };
  if (raw === null || typeof raw !== 'object') fail('not an object');
  const root = raw as Record<string, unknown>;
  if (typeof root['brand'] !== 'string' && root['brand'] !== null) fail('brand');
  for (const loc of ['en', 'ja', 'zh']) {
    const l = root[loc];
    if (l === null || typeof l !== 'object') fail(loc);
    const o = l as Record<string, unknown>;
    if (typeof o['names'] !== 'string' || o['names'] === '') fail(`${loc}.names`);
    if (!Array.isArray(o['aliases'])) fail(`${loc}.aliases`);
    const aisle = o['aisle'] as Record<string, unknown> | null | undefined;
    if (aisle === null || typeof aisle !== 'object') fail(`${loc}.aisle`);
    if (!STORES.has(String(aisle['store']))) fail(`${loc}.aisle.store`);
    if (!SECTION_SET.has(String(aisle['section']))) fail(`${loc}.aisle.section`);
    const avail = o['availability'] as Record<string, unknown> | null | undefined;
    if (avail === null || typeof avail !== 'object') fail(`${loc}.availability`);
    if (!LEVELS.has(String(avail['level']))) fail(`${loc}.availability.level`);
    if (!Array.isArray(avail['brands'])) fail(`${loc}.availability.brands`);
    if (!Array.isArray(avail['notes'])) fail(`${loc}.availability.notes`);
  }
}

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
  const result = JSON.parse(extractJson(content)) as unknown;
  validateShape(result);
  return { result, tokens: data.eval_count ?? 0 };
}

/** The model may wrap the JSON in ```json fences — unwrap before parsing. */
function extractJson(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced?.[1] ?? trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
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
console.log('Warming model (first full-size prompt is slow by design)…');
await fetch(`${ENDPOINT}/api/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    stream: false,
    think: false,
    options: { temperature: 0.7, top_p: 0.8 },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'Description: Salt, table\nCategory: Spices and Herbs' },
    ],
  }),
});
console.log('Model warm; starting batch.');

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
