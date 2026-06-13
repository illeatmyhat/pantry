/**
 * The `Food` interface every layer speaks (DESIGN.md "What pantry is").
 * Generated cores, derived foods, defined foods, and localized foods are
 * all structurally this shape; layers differ only in which optional
 * surfaces are present.
 */

/** The US Nutrition Facts label set — an externally defined subset, not our taste. */
export const LABEL_KEYS = [
  'calories',
  'fat',
  'saturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'carbohydrate',
  'fiber',
  'sugars',
  'protein',
  'vitamin_d',
  'calcium',
  'iron',
  'potassium',
] as const;

export type LabelKey = (typeof LABEL_KEYS)[number];

/** Amounts per 100 g in label units (kcal / g / mg / mcg). `null` = SR has no row. */
export type LabelNutrients = Record<LabelKey, number | null>;

/**
 * A food's `nutrients` map. The 14 panel slugs are always present and
 * precisely typed; a `/full` view additionally keys the 135 extras by name,
 * so any nutrient reads as an amount. The exact, autocompleting key set per
 * view/locale is narrowed by each package's generated ambient `.d.ts`; this
 * loose shape is the general `Food` contract.
 */
export type NutrientAmounts = LabelNutrients & Record<string, number | null>;

export interface LabelSetEntry {
  readonly key: LabelKey;
  /** The SR Legacy nutrient id this label key reads from (DESIGN.md label-set mapping). */
  readonly nutrientId: number;
  readonly unit: 'kcal' | 'g' | 'mg' | 'mcg';
  /** The FDA Nutrition Facts panel display name — the canonical en-US label for this key. */
  readonly label: string;
}

/**
 * The panel ↔ SR-nutrient-id ↔ unit ↔ FDA-label mapping (DESIGN.md, settled
 * 2026-06-11). Single source of truth: the generator's buildLabelNutrients
 * reads it, and localizeNutrients uses it to resolve a panel key to its
 * stable nutrient id. `label` is the FDA Nutrition Facts panel wording
 * ("Total Fat", not USDA's "Total lipid (fat)") — the canonical en-US name
 * other locales translate.
 */
export const LABEL_SET: readonly LabelSetEntry[] = [
  { key: 'calories', nutrientId: 1008, unit: 'kcal', label: 'Calories' },
  { key: 'fat', nutrientId: 1004, unit: 'g', label: 'Total Fat' },
  { key: 'saturated_fat', nutrientId: 1258, unit: 'g', label: 'Saturated Fat' },
  { key: 'trans_fat', nutrientId: 1257, unit: 'g', label: 'Trans Fat' },
  { key: 'cholesterol', nutrientId: 1253, unit: 'mg', label: 'Cholesterol' },
  { key: 'sodium', nutrientId: 1093, unit: 'mg', label: 'Sodium' },
  { key: 'carbohydrate', nutrientId: 1005, unit: 'g', label: 'Total Carbohydrate' },
  { key: 'fiber', nutrientId: 1079, unit: 'g', label: 'Dietary Fiber' },
  { key: 'sugars', nutrientId: 2000, unit: 'g', label: 'Total Sugars' },
  { key: 'protein', nutrientId: 1003, unit: 'g', label: 'Protein' },
  { key: 'vitamin_d', nutrientId: 1114, unit: 'mcg', label: 'Vitamin D' },
  { key: 'calcium', nutrientId: 1087, unit: 'mg', label: 'Calcium' },
  { key: 'iron', nutrientId: 1089, unit: 'mg', label: 'Iron' },
  { key: 'potassium', nutrientId: 1092, unit: 'mg', label: 'Potassium' },
];

/**
 * One row of the `extra` leaf — a nutrient outside the 14-key panel, carried
 * on `/full` views (DESIGN.md leaf/view law). Keyed by the stable SR nutrient
 * id; `name`/`unit` are the USDA values, `amount` is per 100 g.
 */
export interface ExtraNutrient {
  readonly nutrientId: number;
  readonly name: string;
  readonly unit: string;
  readonly amount: number;
}

export interface DensityCitation {
  readonly portionId: number;
  readonly amount: number;
  readonly unitName: string;
  readonly gramWeight: number;
  readonly volumeMl: number;
}

export interface Density {
  readonly density_g_per_ml: number;
  /** Present when mechanically derived from a USDA portion row. */
  readonly citation?: DensityCitation;
}

/**
 * The errand router (recipes Q15): which shopping trip the food belongs to
 * (primary supermarket / specialty shop / order online) and the section —
 * the shelf walk within THAT store. Section vocabulary is per-locale.
 */
export interface Errand {
  readonly store: 'primary' | 'specialty' | 'online';
  readonly section: string;
}

export interface ProvenanceSource {
  readonly fdc_id?: number;
  readonly slug?: string;
  readonly description?: string;
}

export interface Provenance {
  /** The food this one was derived from; null for standalone definitions. */
  readonly source: ProvenanceSource | null;
  /** Field paths the author overrode or stated, e.g. 'nutrients.sodium'. */
  readonly overrides: readonly string[];
  readonly basis: string | null;
}

export interface Food {
  readonly nutrients: NutrientAmounts;
  /**
   * Mechanically derived from a USDA volume portion. `null` for ~70% of foods
   * (2,344 of 7,793 have a usable row) — SR has nothing to derive from, not a
   * zero. Need one anyway? State it via `derive`/`defineFood` with a `basis`.
   */
  readonly density: Density | null;
  /** USDA identity — data, present on everything rooted in SR. */
  readonly fdc_id?: number;
  readonly slug?: string;
  readonly description?: string;
  readonly category?: string;
  /** Curation — an overlay act, never invented by pantry. */
  readonly name?: string;
  readonly aliases?: readonly string[];
  /** The long tail of SR nutrients — present on `/full` views (core + extra). */
  readonly remaining_nutrients?: readonly ExtraNutrient[];
  /** Locale surface — present on localized foods only. */
  readonly locale?: string;
  /** `null` = non-retail (no store sells it — fast food, subsistence); absent = no errand stated. */
  readonly errand?: Errand | null;
  /** Brand recommendations are consumer curation (cuisine context), never generated. */
  readonly brands?: readonly string[];
  readonly notes?: readonly string[];
  readonly provenance?: Provenance;
}
