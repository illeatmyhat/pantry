import type { ManifestEntry } from '../../src/toolkit/search.js';

/**
 * The translation task contract, shared by every generator (local Qwen via
 * run.ts, Claude via batch-claude.ts): same prompt, same JSON shape, same
 * validator. The model is interchangeable; the contract is not.
 *
 * Locale keys are BCP-47 (a locale is a language AND a market — zh-TW would
 * be a different market, not a spelling variant). Per locale:
 *   name      — faithful translation of the description (absent for en-US:
 *               the en-US name IS the description, copied mechanically)
 *   aliases   — everyday shopper names
 *   errand    — Q15 errand router: store (which trip: primary supermarket /
 *               specialty shop / order online) + section (the shelf walk
 *               within THAT store; an online listing still has a section)
 *   notes     — 0-2 short market-guidance sentences in that market's language
 *
 * Deliberately NOT generated:
 *   brands per market — brand fit is cuisine/recipe context (Kikkoman for
 *     Japanese fried rice vs Pearl River Bridge for Chinese), i.e. consumer
 *     curation, not a fact about the food;
 *   availability level — redundant with errand.store;
 *   en-US name — paying a model to retype 7,793 descriptions invites silent
 *     copy-editing of USDA's own typos.
 *
 * The section enums below are PROVISIONAL (the old recipes 10-slot set);
 * they are replaced by per-locale vocabularies once the discovery pass
 * (discover-errands.ts) is reviewed and frozen.
 */
export const LOCALES = ['en-US', 'ja-JP', 'zh-CN'] as const;
export type Locale = (typeof LOCALES)[number];

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
    'en-US': localeSchema(false), // name is mechanical (the description verbatim)
    'ja-JP': localeSchema(true),
    'zh-CN': localeSchema(true),
  },
  required: ['brand', 'en-US', 'ja-JP', 'zh-CN'],
  additionalProperties: false,
} as const;

function localeSchema(withName: boolean): object {
  return {
    type: 'object',
    properties: {
      ...(withName ? { name: { type: 'string' } } : {}),
      aliases: { type: 'array', items: { type: 'string' } },
      errand: {
        type: 'object',
        properties: {
          store: { enum: STORES },
          section: { enum: SECTIONS },
        },
        required: ['store', 'section'],
        additionalProperties: false,
      },
      notes: { type: 'array', items: { type: 'string' } },
    },
    required: [...(withName ? ['name'] : []), 'aliases', 'errand', 'notes'],
    additionalProperties: false,
  };
}

export const SYSTEM_PROMPT = `You translate USDA food database descriptions. Each description is a comma-structured taxonomy string (most general term first, qualifiers after), e.g. "Pork, cured, salt pork, raw".

For the given food, produce:
- brand: if the description names a commercial brand or restaurant (e.g. PILLSBURY, KEEBLER, McDONALD'S), the brand name as commonly written; otherwise null.
- en-US.aliases: 0-3 everyday names an American shopper would actually use for this exact food (e.g. "french bread" for "Bread, french or vienna..."). Empty array if none.
- en-US.errand / en-US.notes: the same judgments as below, for the US market; notes in English.
- ja-JP.name: a faithful Japanese translation of the FULL structured description. Keep the taxonomic comma structure (use 、or ・ naturally). Translate technical food-science terms precisely (e.g. "raw"=生, "drained solids"=固形分のみ; "fresh" on meat means UNCURED, not raw — never translate it as 生 when the item is cooked). Do NOT invent a friendly product name; this is a translation of the description.
- ja-JP.aliases: 0-3 common everyday Japanese names a shopper would actually use for this exact food (empty array if none exists).
- ja-JP.errand: the shopping errand for this food in Japan. store: "primary" if an ordinary supermarket carries it, "specialty" if it realistically requires a specialty shop (import store, depachika, Asian/Western grocery), "online" if it realistically must be ordered. section: the shelf area within THAT store — even online listings have a section. Judge store honestly: a wrong "primary" sends a shopper on a futile trip.
- ja-JP.notes: 0-2 short sentences IN JAPANESE with market guidance (where to find it, common substitutes). Empty array if you have nothing useful to say. Do not recommend brands — brand fit depends on the dish, not the market.
- zh-CN.*: the same for mainland China, Simplified Chinese, notes in Chinese.

Translate faithfully; output ONLY a JSON object with exactly this shape:
{"brand": string|null,
 "en-US": {"aliases": string[], "errand": {"store": "primary"|"specialty"|"online", "section": "produce"|"meat_seafood"|"dairy_eggs"|"dry_goods"|"canned"|"condiments"|"spices"|"oils"|"international"|"tofu_soy"}, "notes": string[]},
 "ja-JP": {"name": string, "aliases": string[], "errand": { same as en-US }, "notes": string[]},
 "zh-CN": { same shape as ja-JP }}`;

export function userContent(entry: ManifestEntry): string {
  return `Description: ${entry.description}\nCategory: ${entry.category}`;
}

const STORE_SET = new Set<string>(STORES);
const SECTION_SET = new Set<string>(SECTIONS);

export function validateShape(raw: unknown): void {
  const fail = (msg: string): never => {
    throw new Error(`shape: ${msg}`);
  };
  if (raw === null || typeof raw !== 'object') fail('not an object');
  const root = raw as Record<string, unknown>;
  if (typeof root['brand'] !== 'string' && root['brand'] !== null) fail('brand');
  for (const loc of LOCALES) {
    const l = root[loc];
    if (l === null || typeof l !== 'object') fail(loc);
    const o = l as Record<string, unknown>;
    if (loc !== 'en-US' && (typeof o['name'] !== 'string' || o['name'] === '')) {
      fail(`${loc}.name`);
    }
    if (!Array.isArray(o['aliases'])) fail(`${loc}.aliases`);
    const errand = o['errand'] as Record<string, unknown> | null | undefined;
    if (errand === null || typeof errand !== 'object') fail(`${loc}.errand`);
    if (!STORE_SET.has(String(errand['store']))) fail(`${loc}.errand.store`);
    if (!SECTION_SET.has(String(errand['section']))) fail(`${loc}.errand.section`);
    if (!Array.isArray(o['notes'])) fail(`${loc}.notes`);
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
