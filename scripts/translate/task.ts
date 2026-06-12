import type { ManifestEntry } from '../../src/toolkit/search.js';

/**
 * The translation task contract, shared by every generator (local Qwen via
 * run.ts, Claude via batch-claude.ts): same prompt, same JSON shape, same
 * validator. The model is interchangeable; the contract is not.
 *
 * Output shape mirrors the first consumer's locale files
 * (recipes data/ingredients/<locale>/<id>.yaml): names/aliases +
 * availability{level, brands, notes}, notes in the market's language.
 *
 * `aisle` follows recipes Q15 semantics — the errand router. store: which
 * trip the item belongs to (primary supermarket / specialty shop / order
 * online); section: the shelf walk within THAT store (an online item still
 * has a section). Generated best-effort; the enum is server-enforced on the
 * Claude path. (The local-model path can't enforce it — Qwen invented
 * sections like "frozen" — so its validator failures route those items to
 * review instead.)
 */
export const SECTIONS = [
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
export const STORES = ['primary', 'specialty', 'online'] as const;

export const SCHEMA = {
  type: 'object',
  properties: {
    brand: { type: ['string', 'null'] },
    en: localeSchema(), // en.names is mechanical (the description verbatim)
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
          store: { enum: STORES },
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

export const SYSTEM_PROMPT = `You translate USDA food database descriptions. Each description is a comma-structured taxonomy string (most general term first, qualifiers after), e.g. "Pork, cured, salt pork, raw".

For the given food, produce:
- brand: if the description names a commercial brand or restaurant (e.g. PILLSBURY, KEEBLER, McDONALD'S), the brand name as commonly written; otherwise null.
- en.names: repeat the description VERBATIM (it is already the en-US name).
- en.aliases: 0-3 everyday names an American shopper would actually use for this exact food (e.g. "french bread" for "Bread, french or vienna..."). Empty array if none.
- en.aisle / en.availability: the same judgments as below, for the US market; notes in English.
- ja.names: a faithful Japanese translation of the FULL structured description. Keep the taxonomic comma structure (use 、or ・ naturally). Translate technical food-science terms precisely (e.g. "raw"=生, "drained solids"=固形分のみ; "fresh" on meat means UNCURED, not raw — never translate it as 生 when the item is cooked). Do NOT invent a friendly product name; this is a translation of the description.
- ja.aliases: 0-3 common everyday Japanese names a shopper would actually use for this exact food (empty array if none exists).
- ja.aisle: the shopping errand for this food in Japan. store: "primary" if an ordinary supermarket carries it, "specialty" if it realistically requires a specialty shop (import store, depachika, Asian/Western grocery), "online" if it realistically must be ordered. section: the shelf area within THAT store — even online listings have a section. Judge store honestly: a wrong "primary" sends a shopper on a futile trip.
- ja.availability: your judgment of this exact food in the Japanese market. level: "common" / "specialty" / "rare" / "unknown". brands: actual brand names sold in that market for this food — ONLY brands you are confident exist; an empty array is much better than a guess. notes: 0-2 short sentences IN JAPANESE with market guidance (where to find it, common substitutes). Empty array if you have nothing useful to say.
- zh.*: the same for mainland China, Simplified Chinese, notes in Chinese.

Translate faithfully; never invent brands; output ONLY a JSON object with exactly this shape:
{"brand": string|null,
 "en": {"names": string, "aliases": string[], "aisle": {"store": "primary"|"specialty"|"online", "section": "produce"|"meat_seafood"|"dairy_eggs"|"dry_goods"|"canned"|"condiments"|"spices"|"oils"|"international"|"tofu_soy"}, "availability": {"level": "common"|"specialty"|"rare"|"unknown", "brands": string[], "notes": string[]}},
 "ja": { same shape as en },
 "zh": { same shape as en }}`;

export function userContent(entry: ManifestEntry): string {
  return `Description: ${entry.description}\nCategory: ${entry.category}`;
}

const LEVELS = new Set(['common', 'specialty', 'rare', 'unknown']);
const STORE_SET = new Set<string>(STORES);
const SECTION_SET = new Set<string>(SECTIONS);

export function validateShape(raw: unknown): void {
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
    if (!STORE_SET.has(String(aisle['store']))) fail(`${loc}.aisle.store`);
    if (!SECTION_SET.has(String(aisle['section']))) fail(`${loc}.aisle.section`);
    const avail = o['availability'] as Record<string, unknown> | null | undefined;
    if (avail === null || typeof avail !== 'object') fail(`${loc}.availability`);
    if (!LEVELS.has(String(avail['level']))) fail(`${loc}.availability.level`);
    if (!Array.isArray(avail['brands'])) fail(`${loc}.availability.brands`);
    if (!Array.isArray(avail['notes'])) fail(`${loc}.availability.notes`);
  }
}

/** Models may wrap the JSON in ```json fences — unwrap before parsing. */
export function extractJson(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced?.[1] ?? trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}
