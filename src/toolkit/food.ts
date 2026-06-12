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
  readonly nutrients: LabelNutrients;
  readonly density: Density | null;
  /** USDA identity — data, present on everything rooted in SR. */
  readonly fdc_id?: number;
  readonly slug?: string;
  readonly description?: string;
  readonly category?: string;
  /** Curation — an overlay act, never invented by pantry. */
  readonly name?: string;
  readonly aliases?: readonly string[];
  /** Locale surface — present on localized foods only. */
  readonly locale?: string;
  /** `null` = non-retail (no store sells it — fast food, subsistence); absent = no errand stated. */
  readonly errand?: Errand | null;
  /** Brand recommendations are consumer curation (cuisine context), never generated. */
  readonly brands?: readonly string[];
  readonly notes?: readonly string[];
  readonly provenance?: Provenance;
}
