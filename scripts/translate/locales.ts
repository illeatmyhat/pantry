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
   * Preferred per-locale section vocabulary. Fed to the prompt as the
   * PREFERRED slug list — never enforced by the schema: the model may coin
   * a slug when nothing honestly fits (decided 2026-06-12), and strays.ts
   * surfaces off-vocabulary answers for review. Provisional until the
   * discovery pass (discover-errands.ts) is reviewed and frozen per locale.
   */
  readonly sections: readonly string[];
  /**
   * Display labels for the three `store` enum values (the "which trip"
   * router), shipped in each locale package's labels.js so a consumer can
   * render store/section slugs in the local language. Section labels are
   * the signage-verified, frozen ones in l10n/vocabulary/<tag>.yaml; these
   * store labels are PROPOSED (Claude, 2026-06-13) — review and adjust,
   * then they can move into the vocabulary review surface alongside sections.
   */
  readonly storeLabels: {
    readonly primary: string;
    readonly specialty: string;
    readonly online: string;
  };
}

/**
 * Per-locale preferred sections — mirror of l10n/vocabulary/<tag>.yaml
 * slugs (the YAML is the review surface; tests/locales-vocab.test.ts
 * enforces the mirror). Still proposals until the user flips each YAML
 * to status: frozen.
 */
const EN_US_SECTIONS = [
  'produce',
  'meat_seafood',
  'deli',
  'dairy',
  'frozen',
  'bakery',
  'bread',
  'cereal',
  'baking',
  'snacks',
  'candy',
  'canned',
  'condiments',
  'spices',
  'pasta_rice',
  'coffee_tea',
  'beverages',
  'alcohol',
  'baby',
  'international',
] as const;

const JA_JP_SECTIONS = [
  'produce',
  'meat',
  'seafood',
  'ham_sausage',
  'dairy_eggs',
  'soy_products',
  'pickles_surimi',
  'chilled_noodles',
  'deli',
  'frozen',
  'ice_cream',
  'sweets',
  'bread',
  'rice',
  'dry_goods',
  'noodles',
  'instant',
  'baking',
  'jam_cereal',
  'canned',
  'condiments',
  'tea_coffee',
  'beverages',
  'alcohol',
  'baby',
  'international',
] as const;

const ZH_CN_SECTIONS = [
  'vegetables',
  'fruits',
  'meat',
  'seafood',
  'deli',
  'fresh_staples',
  'soy_products',
  'eggs',
  'dairy',
  'frozen',
  'snacks',
  'bakery',
  'grain_oil',
  'dried_goods',
  'condiments',
  'canned',
  'instant',
  'drink_mixes',
  'tea',
  'beverages',
  'alcohol',
  'baby',
  'international',
] as const;

export const LOCALES: readonly LocaleSpec[] = [
  {
    tag: 'en-US',
    language: 'English',
    market: 'the United States',
    canonical: true,
    specialtyExamples: 'butcher shops, Italian/Mexican/Asian markets, gourmet grocers',
    sections: EN_US_SECTIONS,
    storeLabels: { primary: 'Supermarket', specialty: 'Specialty Store', online: 'Online' },
  },
  {
    tag: 'ja-JP',
    language: 'Japanese',
    market: 'Japan',
    nameHints:
      'Keep the taxonomic comma structure (use 、 or ・ naturally). Translate technical food-science terms precisely (e.g. "raw"=生, "drained solids"=固形分のみ; "fresh" on meat means UNCURED, not raw — never translate it as 生 when the item is cooked).',
    specialtyExamples: 'import stores, depachika, Asian/Western grocery',
    sections: JA_JP_SECTIONS,
    storeLabels: { primary: 'スーパー', specialty: '専門店', online: '通販' },
  },
  {
    tag: 'zh-CN',
    language: 'Simplified Chinese (mainland China usage)',
    market: 'mainland China',
    specialtyExamples: 'import supermarkets, membership stores, cross-border e-commerce',
    sections: ZH_CN_SECTIONS,
    storeLabels: { primary: '超市', specialty: '专门店', online: '网购' },
  },
];

export const CANONICAL_LOCALE = LOCALES.find((l) => l.canonical === true) ?? LOCALES[0];
