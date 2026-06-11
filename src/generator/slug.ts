/**
 * The pinned identity algorithm. Changing ANY step here changes slugs, which
 * is a semver major and must re-verify the collision set (see assignSlugs).
 */
/**
 * The one slug collision in the frozen dataset: "Pancakes, whole wheat, dry
 * mix, incomplete" (171853) vs "Pancakes, whole-wheat, dry mix, incomplete"
 * (172776). The data is retired and cannot change, so any drift in the
 * observed collision set is a generator bug — assignSlugs hard-fails on it.
 */
export const EXPECTED_COLLIDERS: ReadonlySet<number> = new Set([171853, 172776]);

export interface SlugInput {
  readonly fdcId: number;
  readonly description: string;
}

/**
 * Maps fdc_id → final slug. Every member of a colliding slug group gets
 * `-<fdcId>` appended; the observed collider set must equal
 * EXPECTED_COLLIDERS exactly (the pancake tripwire).
 */
export function assignSlugs(foods: readonly SlugInput[]): Map<number, string> {
  const bySlug = new Map<number, string>();
  const groups = new Map<string, SlugInput[]>();
  for (const food of foods) {
    const slug = slugify(food.description);
    const group = groups.get(slug);
    if (group === undefined) groups.set(slug, [food]);
    else group.push(food);
  }

  const colliders = new Set<number>();
  for (const [slug, group] of groups) {
    if (group.length === 1) {
      const only = group[0];
      if (only !== undefined) bySlug.set(only.fdcId, slug);
    } else {
      for (const food of group) {
        colliders.add(food.fdcId);
        bySlug.set(food.fdcId, `${slug}-${food.fdcId}`);
      }
    }
  }

  const expectedPresent = [...EXPECTED_COLLIDERS].filter((id) =>
    foods.some((f) => f.fdcId === id),
  );
  const sameSize = colliders.size === expectedPresent.length;
  const sameMembers = sameSize && expectedPresent.every((id) => colliders.has(id));
  if (!sameMembers || colliders.size !== EXPECTED_COLLIDERS.size) {
    const observed = [...colliders].sort((a, b) => a - b).join(', ') || 'none';
    throw new Error(
      `Slug collision set drifted: expected exactly {171853, 172776}, observed {${observed}}. ` +
        'The data is frozen — this is a generator bug.',
    );
  }
  return bySlug;
}

export function slugify(description: string): string {
  return description
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replaceAll('%', ' percent ')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
