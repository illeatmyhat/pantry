import { LOCALES, type LocaleSpec } from './locales.js';
import type { ManifestEntry } from '../../src/toolkit/search.js';

/**
 * The translation task contract, shared by every generator (local Qwen via
 * run.ts, Claude via batch-claude.ts): same prompt, same JSON shape, same
 * validator. The model is interchangeable; the contract is not. The locale
 * set is interchangeable too — prompt, schema, and validator are all
 * derived from the locale table (locales.ts), never written by hand.
 *
 * Per locale:
 *   name      — faithful translation of the description (absent for the
 *               canonical locale: its name IS the description, copied
 *               mechanically — never round-tripped through a model)
 *   aliases   — everyday shopper names
 *   errand    — Q15 errand router: store (which trip: primary supermarket /
 *               specialty shop / order online) + section (the shelf walk
 *               within THAT store; an online listing still has a section),
 *               or null when no store honestly sells the food in that market
 *               (restaurant menu items, industrial ingredients, subsistence
 *               foods — decided 2026-06-12, no parking slugs)
 *   notes     — 0-2 short market-guidance sentences in that market's language
 *
 * Deliberately NOT generated: per-market brand recommendations (brand fit
 * is cuisine/recipe context — consumer curation, not a fact about the
 * food) and availability levels (redundant with errand.store).
 */
export const STORES = ['primary', 'specialty', 'online'] as const;

function localeSchema(spec: LocaleSpec): object {
  const withName = spec.canonical !== true;
  return {
    type: 'object',
    properties: {
      ...(withName ? { name: { type: 'string' } } : {}),
      aliases: { type: 'array', items: { type: 'string' } },
      // Nullable: non-retail foods (restaurant menu items, industrial
      // ingredients, subsistence foods) honestly fit no store section.
      errand: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            properties: {
              store: { enum: STORES },
              section: { enum: spec.sections },
            },
            required: ['store', 'section'],
            additionalProperties: false,
          },
        ],
      },
      notes: { type: 'array', items: { type: 'string' } },
    },
    required: [...(withName ? ['name'] : []), 'aliases', 'errand', 'notes'],
    additionalProperties: false,
  };
}

export const SCHEMA = {
  type: 'object',
  properties: {
    brand: { type: ['string', 'null'] },
    ...Object.fromEntries(LOCALES.map((l) => [l.tag, localeSchema(l)])),
  },
  required: ['brand', ...LOCALES.map((l) => l.tag)],
  additionalProperties: false,
} as const;

function localePromptSection(spec: LocaleSpec): string {
  const t = spec.tag;
  const lines: string[] = [];
  if (spec.canonical !== true) {
    lines.push(
      `- ${t}.name: a faithful ${spec.language} translation of the FULL structured description. ` +
        `${spec.nameHints ?? ''} Do NOT invent a friendly product name; this is a translation of the description.`.trim(),
    );
  }
  lines.push(
    `- ${t}.aliases: 0-3 everyday names a shopper in ${spec.market} would actually use for this exact food, in ${spec.language}. Empty array if none.`,
  );
  lines.push(
    `- ${t}.errand: the shopping errand for this food in ${spec.market}. store: "primary" if an ordinary supermarket carries it, "specialty" if it realistically requires a specialty shop${spec.specialtyExamples !== undefined ? ` (${spec.specialtyExamples})` : ''}, "online" if it realistically must be ordered. section: the shelf area within THAT store — even online listings have a section. Judge store honestly: a wrong "primary" sends a shopper on a futile trip.`,
  );
  lines.push(
    `- ${t}.notes: 0-2 short market-guidance sentences in ${spec.language} (where to find it, common substitutes). Empty array if you have nothing useful to say. Do not recommend brands — brand fit depends on the dish, not the market.`,
  );
  return lines.join('\n');
}

function shapeExample(): string {
  const locale = (spec: LocaleSpec): string => {
    const name = spec.canonical === true ? '' : '"name": string, ';
    const sections = spec.sections.map((s) => `"${s}"`).join('|');
    return ` "${spec.tag}": {${name}"aliases": string[], "errand": {"store": "primary"|"specialty"|"online", "section": ${sections}}|null, "notes": string[]}`;
  };
  return `{"brand": string|null,\n${LOCALES.map(locale).join(',\n')}}`;
}

export const SYSTEM_PROMPT = `You translate USDA food database descriptions and judge food retail availability across markets. Each description is a comma-structured taxonomy string (most general term first, qualifiers after), e.g. "Pork, cured, salt pork, raw".

For the given food, produce:
- brand: if the description names a commercial brand or restaurant (e.g. PILLSBURY, KEEBLER, McDONALD'S), the brand name as commonly written; otherwise null.
${LOCALES.map(localePromptSection).join('\n')}

If a food is not honestly purchasable at retail in a market — restaurant and fast-food menu items, industrial/food-service ingredients, subsistence or foraged foods — set that locale's errand to null rather than forcing a store section. Judge per market; null means "no store sells this", not "I don't know".

Translate faithfully; output ONLY a JSON object with exactly this shape:
${shapeExample()}`;

export function userContent(entry: ManifestEntry): string {
  return `Description: ${entry.description}\nCategory: ${entry.category}`;
}

const STORE_SET = new Set<string>(STORES);

export function validateShape(raw: unknown): void {
  const fail = (msg: string): never => {
    throw new Error(`shape: ${msg}`);
  };
  if (raw === null || typeof raw !== 'object') fail('not an object');
  const root = raw as Record<string, unknown>;
  if (typeof root['brand'] !== 'string' && root['brand'] !== null) fail('brand');
  for (const spec of LOCALES) {
    const l = root[spec.tag];
    if (l === null || typeof l !== 'object') fail(spec.tag);
    const o = l as Record<string, unknown>;
    if (spec.canonical !== true && (typeof o['name'] !== 'string' || o['name'] === '')) {
      fail(`${spec.tag}.name`);
    }
    if (!Array.isArray(o['aliases'])) fail(`${spec.tag}.aliases`);
    // errand: null is a value (non-retail food); absence is a contract breach.
    const errand = o['errand'] as Record<string, unknown> | null | undefined;
    if (errand === undefined || (errand !== null && typeof errand !== 'object')) {
      fail(`${spec.tag}.errand`);
    } else if (errand !== null) {
      if (!STORE_SET.has(String(errand['store']))) fail(`${spec.tag}.errand.store`);
      if (!spec.sections.includes(String(errand['section']))) fail(`${spec.tag}.errand.section`);
    }
    if (!Array.isArray(o['notes'])) fail(`${spec.tag}.notes`);
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
