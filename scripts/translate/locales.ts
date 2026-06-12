/**
 * The locale table — the ONLY place generation locales are defined. The
 * prompt, JSON schema, and validator all derive from these rows, so adding
 * a locale (ko-KR, zh-TW, …) is adding a row, never editing prose. The
 * launch set (en-US canonical + ja-JP + zh-CN) is an instance choice, not
 * an architectural one — mirroring recipes' LOCALES/CANONICAL_LOCALE
 * instance config.
 */
export interface LocaleSpec {
  /** BCP-47 — a locale is a language AND a market. */
  readonly tag: string;
  readonly language: string;
  readonly market: string;
  /**
   * Canonical locale: `name` is the USDA description itself, copied
   * mechanically by the emitter — never asked of a model.
   */
  readonly canonical?: boolean;
  /** Language-specific translation guidance appended to the name instruction. */
  readonly nameHints?: string;
  /** Market-specific store examples for the errand instruction. */
  readonly specialtyExamples?: string;
  /**
   * Frozen per-locale section vocabulary. Provisional until the discovery
   * pass (discover-errands.ts) is reviewed and frozen per locale.
   */
  readonly sections: readonly string[];
}

/** Provisional global set — replaced per-locale at vocabulary freeze. */
const PROVISIONAL_SECTIONS = [
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

export const LOCALES: readonly LocaleSpec[] = [
  {
    tag: 'en-US',
    language: 'English',
    market: 'the United States',
    canonical: true,
    specialtyExamples: 'butcher shops, Italian/Mexican/Asian markets, gourmet grocers',
    sections: PROVISIONAL_SECTIONS,
  },
  {
    tag: 'ja-JP',
    language: 'Japanese',
    market: 'Japan',
    nameHints:
      'Keep the taxonomic comma structure (use 、 or ・ naturally). Translate technical food-science terms precisely (e.g. "raw"=生, "drained solids"=固形分のみ; "fresh" on meat means UNCURED, not raw — never translate it as 生 when the item is cooked).',
    specialtyExamples: 'import stores, depachika, Asian/Western grocery',
    sections: PROVISIONAL_SECTIONS,
  },
  {
    tag: 'zh-CN',
    language: 'Simplified Chinese (mainland China usage)',
    market: 'mainland China',
    specialtyExamples: 'import supermarkets, membership stores, cross-border e-commerce',
    sections: PROVISIONAL_SECTIONS,
  },
];

export const CANONICAL_LOCALE = LOCALES.find((l) => l.canonical === true) ?? LOCALES[0];
