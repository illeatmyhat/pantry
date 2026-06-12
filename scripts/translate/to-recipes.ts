/**
 * Converts a merged translation record into a recipes-format locale file
 * (data/ingredients/<locale>/<id>.yaml). The bridges, per the format
 * comparison of 2026-06-12:
 *
 *   errand            → `aisle` (recipes hasn't adopted the rename yet)
 *   store: primary    → bare section slug (recipes convention)
 *   notes: string[]   → availability.notes: [{text}] (`important` is a
 *                       human curation act, never set here)
 *   name              → `names` (recipes' plural-key spelling)
 *   internal markers  → stripped (corrections are invisible)
 *
 * Section slugs are pantry's frozen per-locale vocabulary; recipes adopts
 * them at migration time (its own enum was explicitly provisional).
 */
interface LocaleBlock {
  readonly name?: string;
  readonly aliases?: readonly string[];
  readonly errand?: { store: string; section: string };
  readonly notes?: readonly string[];
}
export interface MergedRecord {
  readonly slug: string;
  readonly fdc_id: number;
  readonly description: string;
  readonly result?: Record<string, unknown>;
}

export function toRecipesLocaleYaml(
  record: MergedRecord,
  locale: string,
  ingredientId: string,
): string {
  const block = record.result?.[locale] as LocaleBlock | undefined;
  if (block === undefined) {
    throw new Error(`${record.slug} has no ${locale} surface — missing means missing.`);
  }
  const lines: string[] = [
    `# ${locale} ingredient data for data/ingredients/${ingredientId}.yaml — locale-specific fields only.`,
    `names: ${block.name ?? record.description}`,
  ];
  const aliases = block.aliases ?? [];
  if (aliases.length > 0) {
    lines.push('aliases:');
    for (const alias of aliases) lines.push(`  - ${alias}`);
  }
  if (block.errand !== undefined) {
    lines.push(
      block.errand.store === 'primary'
        ? `aisle: ${block.errand.section}`
        : `aisle: { store: ${block.errand.store}, section: ${block.errand.section} }`,
    );
  }
  const notes = block.notes ?? [];
  if (notes.length > 0) {
    lines.push('availability:');
    lines.push('  notes:');
    for (const note of notes) lines.push(`    - text: ${note}`);
  }
  return `${lines.join('\n')}\n`;
}
