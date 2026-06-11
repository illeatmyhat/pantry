import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync, type Unzipped } from 'fflate';
import { parseCsv, type CsvRecord } from './csv.js';

/**
 * Loads the vendored USDA distribution into one joined in-memory model.
 * Everything downstream (slugs, cores, extras, invariants) works off this.
 */

export interface NutrientRow {
  readonly nutrientId: number;
  readonly name: string;
  readonly unit: string;
  readonly amount: number;
}

export interface PortionRow {
  readonly id: number;
  readonly amount: number;
  readonly unitName: string;
  readonly portionDescription: string;
  readonly modifier: string;
  readonly gramWeight: number;
}

export interface CalorieConversionFactor {
  readonly protein: number | null;
  readonly fat: number | null;
  readonly carbohydrate: number | null;
}

export interface SrFood {
  readonly fdcId: number;
  readonly ndbNumber: string;
  readonly description: string;
  readonly category: string;
  readonly nutrients: readonly NutrientRow[];
  readonly portions: readonly PortionRow[];
  readonly calorieConversionFactor: CalorieConversionFactor | null;
  readonly proteinConversionFactor: number | null;
}

export interface Dataset {
  readonly foods: readonly SrFood[];
}

const DEFAULT_ZIP = fileURLToPath(
  new URL('../../data/FoodData_Central_sr_legacy_food_csv_2018-04.zip', import.meta.url),
);

export function loadDataset(zipPath: string = DEFAULT_ZIP): Dataset {
  const zip = unzipSync(readFileSync(zipPath));
  const table = (name: string): CsvRecord[] => parseCsv(readZipText(zip, name));

  const nutrientDefs = new Map<number, { name: string; unit: string }>();
  for (const r of table('nutrient.csv')) {
    nutrientDefs.set(num(r, 'id'), { name: str(r, 'name'), unit: str(r, 'unit_name') });
  }

  const categories = new Map<string, string>();
  for (const r of table('food_category.csv')) {
    categories.set(str(r, 'id'), str(r, 'description'));
  }

  const measureUnits = new Map<string, string>();
  for (const r of table('measure_unit.csv')) {
    measureUnits.set(str(r, 'id'), str(r, 'name'));
  }

  const ndbNumbers = new Map<number, string>();
  for (const r of table('sr_legacy_food.csv')) {
    ndbNumbers.set(num(r, 'fdc_id'), str(r, 'NDB_number'));
  }

  const nutrientsByFood = new Map<number, NutrientRow[]>();
  for (const r of table('food_nutrient.csv')) {
    const nutrientId = num(r, 'nutrient_id');
    const def = nutrientDefs.get(nutrientId);
    if (def === undefined) {
      throw new Error(`food_nutrient row ${str(r, 'id')} references unknown nutrient ${nutrientId}`);
    }
    push(nutrientsByFood, num(r, 'fdc_id'), {
      nutrientId,
      name: def.name,
      unit: def.unit,
      amount: num(r, 'amount'),
    });
  }

  const portionsByFood = new Map<number, PortionRow[]>();
  for (const r of table('food_portion.csv')) {
    push(portionsByFood, num(r, 'fdc_id'), {
      id: num(r, 'id'),
      amount: num(r, 'amount'),
      unitName: measureUnits.get(str(r, 'measure_unit_id')) ?? 'undetermined',
      portionDescription: str(r, 'portion_description'),
      modifier: str(r, 'modifier'),
      gramWeight: num(r, 'gram_weight'),
    });
  }

  // Conversion factors hang off an intermediate per-food id.
  const factorFood = new Map<string, number>();
  for (const r of table('food_nutrient_conversion_factor.csv')) {
    factorFood.set(str(r, 'id'), num(r, 'fdc_id'));
  }
  const calorieFactors = new Map<number, CalorieConversionFactor>();
  for (const r of table('food_calorie_conversion_factor.csv')) {
    const fdcId = factorFood.get(str(r, 'food_nutrient_conversion_factor_id'));
    if (fdcId === undefined) continue;
    calorieFactors.set(fdcId, {
      protein: numOrNull(r, 'protein_value'),
      fat: numOrNull(r, 'fat_value'),
      carbohydrate: numOrNull(r, 'carbohydrate_value'),
    });
  }
  const proteinFactors = new Map<number, number>();
  for (const r of table('food_protein_conversion_factor.csv')) {
    const fdcId = factorFood.get(str(r, 'food_nutrient_conversion_factor_id'));
    if (fdcId === undefined) continue;
    proteinFactors.set(fdcId, num(r, 'value'));
  }

  const foods: SrFood[] = [];
  for (const r of table('food.csv')) {
    if (str(r, 'data_type') !== 'sr_legacy_food') continue;
    const fdcId = num(r, 'fdc_id');
    foods.push({
      fdcId,
      ndbNumber: ndbNumbers.get(fdcId) ?? '',
      description: str(r, 'description'),
      category: categories.get(str(r, 'food_category_id')) ?? '',
      nutrients: nutrientsByFood.get(fdcId) ?? [],
      portions: portionsByFood.get(fdcId) ?? [],
      calorieConversionFactor: calorieFactors.get(fdcId) ?? null,
      proteinConversionFactor: proteinFactors.get(fdcId) ?? null,
    });
  }
  return { foods };
}

function readZipText(zip: Unzipped, name: string): string {
  // Entries sit under the distribution's top-level folder.
  const entry = zip[`FoodData_Central_sr_legacy_food_csv_2018-04/${name}`] ?? zip[name];
  if (entry === undefined) {
    throw new Error(`Missing ${name} in the vendored zip — the artifact is corrupt or wrong.`);
  }
  return new TextDecoder('utf-8').decode(entry);
}

function str(record: CsvRecord, field: string): string {
  const value = record[field];
  if (value === undefined) throw new Error(`Missing CSV field "${field}"`);
  return value;
}

function num(record: CsvRecord, field: string): number {
  const value = Number(str(record, field));
  if (!Number.isFinite(value)) {
    throw new Error(`Field "${field}" is not numeric: "${str(record, field)}"`);
  }
  return value;
}

function numOrNull(record: CsvRecord, field: string): number | null {
  const raw = str(record, field);
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}
