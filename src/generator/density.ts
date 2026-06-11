/**
 * The frozen density rule (DESIGN.md "Density"). One-time judgments live
 * here; per food it is arithmetic:
 *
 * - In SR Legacy every portion row has measure_unit_id 9999, so the measure
 *   IS the free-text modifier. A row qualifies only when that modifier
 *   exactly equals a plain volume term (case-insensitive, trimmed) and the
 *   portion description is empty. "cup, chopped", "cup (8 fl oz)" and
 *   friends are excluded by rule — qualified text means bulk/derived
 *   measures, and exact match keeps the rule auditable.
 * - Volume terms convert at exact US-customary ml.
 * - Multiple qualifying portions reconcile by LOWER MEDIAN of the per-row
 *   densities (ties broken by portion id), so the cited row always exists.
 * - Known-bad USDA rows are excluded BY ID, never by plausibility band:
 *   real foods reach 0.0135 g/ml (freeze-dried chives), so any band tight
 *   enough to catch errors would also eat real data. The frozen dataset has
 *   exactly one bad row. Derived densities span 0.0135–1.962 g/ml; the
 *   invariant suite pins that envelope.
 * - No qualifying portion ⇒ null. Hand estimates are consumer overrides.
 */

/** Portion 92790 (Pregestimil, fdc 173527): "100 ml = 1 g". RTF formula is ~1.03 g/ml. */
const KNOWN_BAD_PORTION_ROWS: ReadonlySet<number> = new Set([92790]);
const VOLUME_ML: Readonly<Record<string, number>> = {
  ml: 1,
  milliliter: 1,
  liter: 1000,
  'cubic centimeter': 1,
  'cubic inch': 16.387064,
  tsp: 4.92892159375,
  teaspoon: 4.92892159375,
  tbsp: 14.78676478125,
  tablespoon: 14.78676478125,
  tablespoons: 14.78676478125,
  'fl oz': 29.5735295625,
  cup: 236.5882365,
  pint: 473.176473,
  quart: 946.352946,
  gallon: 3785.411784,
};

export interface DensityPortion {
  readonly id: number;
  readonly amount: number;
  readonly unitName: string;
  readonly modifier: string;
  readonly portionDescription: string;
  readonly gramWeight: number;
}

export interface DensityCitation {
  readonly portionId: number;
  readonly amount: number;
  readonly unitName: string;
  readonly gramWeight: number;
  readonly volumeMl: number;
}

export interface DerivedDensity {
  readonly density_g_per_ml: number;
  readonly citation: DensityCitation;
}

export function deriveDensity(portions: readonly DensityPortion[]): DerivedDensity | null {
  const candidates: DerivedDensity[] = [];
  for (const p of portions) {
    // The measure is the modifier text when measure_unit is "undetermined"
    // (which is every SR row); a resolved unit name would require an empty
    // modifier instead.
    const fromModifier = p.unitName === 'undetermined' || p.unitName === '';
    const term = (fromModifier ? p.modifier : p.unitName).trim().toLowerCase();
    const unitMl = VOLUME_ML[term];
    if (unitMl === undefined) continue;
    if (!fromModifier && p.modifier !== '') continue;
    if (p.portionDescription !== '') continue;
    if (!(p.amount > 0) || !(p.gramWeight > 0)) continue;
    if (KNOWN_BAD_PORTION_ROWS.has(p.id)) continue;
    const volumeMl = p.amount * unitMl;
    candidates.push({
      density_g_per_ml: p.gramWeight / volumeMl,
      citation: {
        portionId: p.id,
        amount: p.amount,
        unitName: term,
        gramWeight: p.gramWeight,
        volumeMl,
      },
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      a.density_g_per_ml - b.density_g_per_ml || a.citation.portionId - b.citation.portionId,
  );
  const lowerMedian = candidates[Math.floor((candidates.length - 1) / 2)];
  return lowerMedian ?? null;
}
