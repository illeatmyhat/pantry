import type { Errand, Food } from './food.js';

/**
 * localize — decorate a NAMED food with a locale surface (DESIGN.md
 * "Localization"). Naming and localizing are separate acts: deriving
 * guanciale from salt pork must not inherit salt pork's Japanese name, so
 * localization always targets the food you named, never its source.
 */
/**
 * Shape follows the first consumer's locale files (recipes
 * data/ingredients/<locale>/<id>.yaml, where errand is still named
 * `aisle`): name + aliases, the errand router {store, section}, notes
 * authored in that market's language, and optional brand curation
 * (brands are cuisine-context judgment — consumers state them, pantry
 * never generates them).
 */
export interface LocaleStrings {
  readonly locale: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly errand?: Errand;
  readonly brands?: readonly string[];
  readonly notes?: readonly string[];
}

export function localize(food: Food, strings: LocaleStrings): Food {
  if (food.name === undefined && food.description === undefined) {
    throw new Error('localize: localization decorates named foods — name (or derive) it first.');
  }
  return {
    ...food,
    locale: strings.locale,
    name: strings.name,
    ...(strings.aliases !== undefined ? { aliases: strings.aliases } : {}),
    ...(strings.errand !== undefined ? { errand: strings.errand } : {}),
    ...(strings.brands !== undefined ? { brands: strings.brands } : {}),
    ...(strings.notes !== undefined ? { notes: strings.notes } : {}),
  };
}
