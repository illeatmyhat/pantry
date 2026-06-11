import { LABEL_KEYS, type Density, type Food, type LabelNutrients } from './food.js';

/**
 * defineFood — standalone foods SR lacks (DESIGN.md "Adding on top").
 * Every number in a defined food is the author's claim, so `basis` is
 * required outright; provenance.source is null.
 */
export interface FoodDefinition {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly nutrients: Partial<LabelNutrients>;
  readonly density_g_per_ml?: number;
  readonly basis: string;
}

export function defineFood(definition: FoodDefinition): Food {
  if (typeof definition.basis !== 'string' || definition.basis.trim() === '') {
    throw new Error('defineFood: a standalone food states everything — basis is required.');
  }

  const nutrients = {} as LabelNutrients;
  const overrides: string[] = [];
  for (const key of LABEL_KEYS) {
    const value = definition.nutrients[key];
    nutrients[key] = value ?? null;
    if (value !== undefined) overrides.push(`nutrients.${key}`);
  }

  const density: Density | null =
    definition.density_g_per_ml !== undefined
      ? { density_g_per_ml: definition.density_g_per_ml }
      : null;
  if (density !== null) overrides.unshift('density_g_per_ml');

  return {
    name: definition.name,
    ...(definition.aliases !== undefined ? { aliases: definition.aliases } : {}),
    nutrients,
    density,
    provenance: { source: null, overrides, basis: definition.basis },
  };
}
