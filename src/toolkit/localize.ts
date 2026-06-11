import type { Food } from './food.js';

/**
 * localize — decorate a NAMED food with a locale surface (DESIGN.md
 * "Localization"). Naming and localizing are separate acts: deriving
 * guanciale from salt pork must not inherit salt pork's Japanese name, so
 * localization always targets the food you named, never its source.
 */
export interface LocaleStrings {
  readonly locale: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly store?: string;
  readonly section?: string;
  readonly notes?: string;
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
    ...(strings.store !== undefined ? { store: strings.store } : {}),
    ...(strings.section !== undefined ? { section: strings.section } : {}),
    ...(strings.notes !== undefined ? { notes: strings.notes } : {}),
  };
}
