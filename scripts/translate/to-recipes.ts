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
  /** null = non-retail food (no store section); recipes has no equivalent yet, so the aisle line is omitted. */
  readonly errand?: { store: string; section: string } | null;
  readonly notes?: readonly string[];
}
export interface MergedRecord {
  readonly slug: string;
  readonly fdc_id: number;
  readonly description: string;
  readonly result?: Record<string, unknown>;
}

/**
 * Free text (names, aliases, notes) is model-generated and may contain
 * ': ', ' #', or leading YAML metacharacters — always quote it. JSON
 * string syntax is valid YAML double-quoted scalar syntax.
 */
const yamlText = (value: string): string => JSON.stringify(value);

export function toRecipesLocaleYaml(
  record: MergedRecord,
  locale: string,
  ingredientId: string,
  canonical = false,
): string {
  const block = record.result?.[locale] as LocaleBlock | undefined;
  if (block === undefined) {
    throw new Error(`${record.slug} has no ${locale} surface — missing means missing.`);
  }
  // Same rule as emit-l10n: only the canonical locale may fall back to the
  // USDA description; a non-canonical surface without a name is an error,
  // never a silent English leak.
  if (!canonical && (block.name === undefined || block.name === '')) {
    throw new Error(`${record.slug}: ${locale} surface has no name — refusing the English fallback.`);
  }
  const lines: string[] = [
    `# ${locale} ingredient data for data/ingredients/${ingredientId}.yaml — locale-specific fields only.`,
    `names: ${yamlText(block.name ?? record.description)}`,
  ];
  const aliases = block.aliases ?? [];
  if (aliases.length > 0) {
    lines.push('aliases:');
    for (const alias of aliases) lines.push(`  - ${yamlText(alias)}`);
  }
  if (block.errand !== undefined && block.errand !== null) {
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
    for (const note of notes) lines.push(`    - text: ${yamlText(note)}`);
  }
  return `${lines.join('\n')}\n`;
}
