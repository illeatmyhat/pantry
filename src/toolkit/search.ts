/**
 * Offline search over the generated manifest — the in-package analogue of
 * recipes' `fetch-usda.mjs --search`, without the network.
 */
export interface ManifestEntry {
  readonly slug: string;
  readonly fdc_id: number;
  readonly description: string;
  readonly category: string;
}

export interface SearchOptions {
  readonly limit?: number;
}

export function searchFoods(
  manifest: readonly ManifestEntry[],
  query: string,
  options: SearchOptions = {},
): ManifestEntry[] {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t !== '');
  if (tokens.length === 0) return [];
  const hits = manifest.filter((entry) => {
    const haystack = `${entry.description} ${entry.slug}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
  // Tighter descriptions rank first: "Salt, table" beats a 130-char recipe food.
  hits.sort(
    (a, b) => a.description.length - b.description.length || a.slug.localeCompare(b.slug),
  );
  return hits.slice(0, options.limit ?? 25);
}
