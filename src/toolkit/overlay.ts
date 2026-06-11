import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { defineFood } from './define.js';
import { derive } from './derive.js';
import type { Food, LabelNutrients } from './food.js';

/**
 * The YAML overlay loader (DESIGN.md "Adding on top"). An overlay file is a
 * map of entry-key → entry; entries with `source` go through derive(),
 * entries without go through defineFood(), so YAML authors face exactly the
 * same provenance gate as API authors. Overlays stack; later texts win per
 * key. `name` defaults to the entry key.
 */
export interface OverlayOptions {
  /** Resolves a `source` ref (an /sr slug, by convention) to its Food. */
  readonly resolve: (ref: string) => Food | Promise<Food>;
}

const KNOWN_FIELDS = new Set([
  'source',
  'name',
  'aliases',
  'density_g_per_ml',
  'nutrients',
  'basis',
]);

export async function loadOverlay(
  yamlTexts: string | readonly string[],
  options: OverlayOptions,
): Promise<Map<string, Food>> {
  const texts = typeof yamlTexts === 'string' ? [yamlTexts] : yamlTexts;
  const overlay = new Map<string, Food>();
  for (const text of texts) {
    const doc: unknown = parse(text);
    if (doc === null || doc === undefined) continue;
    if (typeof doc !== 'object' || Array.isArray(doc)) {
      throw new Error('Overlay YAML must be a map of entry-key → entry.');
    }
    for (const [key, raw] of Object.entries(doc)) {
      overlay.set(key, await buildEntry(key, raw, options));
    }
  }
  return overlay;
}

export async function loadOverlayFiles(
  paths: readonly string[],
  options: OverlayOptions,
): Promise<Map<string, Food>> {
  const texts = await Promise.all(paths.map((p) => readFile(p, 'utf8')));
  return loadOverlay(texts, options);
}

interface OverlayEntry {
  readonly source?: string;
  readonly name?: string;
  readonly aliases?: readonly string[];
  readonly density_g_per_ml?: number;
  readonly nutrients?: Partial<LabelNutrients>;
  readonly basis?: string;
}

async function buildEntry(key: string, raw: unknown, options: OverlayOptions): Promise<Food> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Overlay entry "${key}" must be a map.`);
  }
  for (const field of Object.keys(raw)) {
    if (!KNOWN_FIELDS.has(field)) {
      throw new Error(`Overlay entry "${key}" has unknown field "${field}".`);
    }
  }
  const entry = raw as OverlayEntry;
  const name = entry.name ?? key;

  if (entry.source !== undefined) {
    const source = await options.resolve(entry.source);
    return derive(source, {
      name,
      ...(entry.aliases !== undefined ? { aliases: entry.aliases } : {}),
      ...(entry.density_g_per_ml !== undefined
        ? { density_g_per_ml: entry.density_g_per_ml }
        : {}),
      ...(entry.nutrients !== undefined ? { nutrients: entry.nutrients } : {}),
      ...(entry.basis !== undefined ? { basis: entry.basis } : {}),
    });
  }

  if (entry.basis === undefined) {
    throw new Error(`Overlay entry "${key}" has no source — basis is required.`);
  }
  return defineFood({
    name,
    ...(entry.aliases !== undefined ? { aliases: entry.aliases } : {}),
    nutrients: entry.nutrients ?? {},
    ...(entry.density_g_per_ml !== undefined
      ? { density_g_per_ml: entry.density_g_per_ml }
      : {}),
    basis: entry.basis,
  });
}
