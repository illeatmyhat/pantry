import type { Density, Food, LabelKey, LabelNutrients, Provenance } from './food.js';

/**
 * derive(source, patch) — naming, aliasing, proxying, and patching as one
 * act (DESIGN.md "Adding on top"). Names are curation and need no basis;
 * the moment the patch states data SR didn't (density, nutrients), `basis`
 * is required. Pantry enforces stated provenance, never a sourcing policy.
 */
export interface DerivePatch {
  readonly name?: string;
  readonly aliases?: readonly string[];
  readonly density_g_per_ml?: number;
  readonly nutrients?: Partial<LabelNutrients>;
  readonly basis?: string;
}

export function derive(source: Food, patch: DerivePatch): Food {
  const overrides: string[] = [];
  if (patch.density_g_per_ml !== undefined) overrides.push('density_g_per_ml');
  for (const key of Object.keys(patch.nutrients ?? {})) {
    overrides.push(`nutrients.${key}`);
  }
  if (overrides.length > 0 && patch.basis === undefined) {
    throw new Error(
      `derive: stating ${overrides.join(', ')} requires a basis — say where the numbers come from.`,
    );
  }

  const nutrients: LabelNutrients = { ...source.nutrients };
  for (const [key, value] of Object.entries(patch.nutrients ?? {})) {
    if (value !== undefined) nutrients[key as LabelKey] = value;
  }

  const density: Density | null =
    patch.density_g_per_ml !== undefined
      ? { density_g_per_ml: patch.density_g_per_ml }
      : source.density;

  const provenance: Provenance = {
    source:
      source.fdc_id === undefined && source.slug === undefined && source.description === undefined
        ? null
        : {
            ...(source.fdc_id !== undefined ? { fdc_id: source.fdc_id } : {}),
            ...(source.slug !== undefined ? { slug: source.slug } : {}),
            ...(source.description !== undefined ? { description: source.description } : {}),
          },
    overrides,
    basis: patch.basis ?? null,
  };

  return {
    // USDA identity is data and flows through; curation and locale surfaces
    // do NOT — a derived food must not inherit its source's name, aliases,
    // or another market's geography.
    ...(source.fdc_id !== undefined ? { fdc_id: source.fdc_id } : {}),
    ...(source.slug !== undefined ? { slug: source.slug } : {}),
    ...(source.description !== undefined ? { description: source.description } : {}),
    ...(source.category !== undefined ? { category: source.category } : {}),
    nutrients,
    density,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.aliases !== undefined ? { aliases: patch.aliases } : {}),
    provenance,
  };
}
