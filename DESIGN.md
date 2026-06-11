# Design

The decision record for `@illeatmyhat/pantry`. Reached in a grill session on
2026-06-11 ([illeatmyhat/recipes#14](https://github.com/illeatmyhat/recipes/issues/14));
this file is the living copy — amend it here, not the issue.

## What pantry is

One package shipping exactly three things:

1. **`/sr/<slug>[/full]`** — the 7,793 SR Legacy foods as generated modules.
   Immutable forever: the dataset is retired (final release April 2018).
2. **`/l10n/<locale>/sr/<slug>[/full]`** — locale surfaces for the raw SR
   foods: faithful translated names + aliases (complete at launch for every
   shipped locale), optional per-market store geography (`{store, section}`)
   and availability notes that grow organically.
3. **The toolkit at the root** — `derive`, `defineFood`, `localize`, a search
   CLI, the YAML-overlay loader, and the `Food` interface every layer speaks.

**Pantry never ships curated entries.** Friendly names ("guanciale"),
proxies, hand densities, and their locale files live in consumer repos,
authored against the toolkit. Overlays are ordinary modules following the
`Food` interface, so anyone may publish their own — the capability needs no
blessing from pantry.

## Identity

- **Primary key: mechanical description-slug** (`pork-cured-salt-pork-raw`).
  Verified against the real distribution: all 7,793 descriptions are unique
  as strings; slugification produces exactly **one collision** —
  "Pancakes, whole wheat, dry mix, incomplete" (171853) vs
  "Pancakes, whole-wheat, dry mix, incomplete" (172776).
- **Collision rule**: every collider gets `-<fdcId>` appended. The generator
  asserts the collision set is exactly the known case and hard-fails on any
  drift (a tripwire for generator bugs — the data cannot change).
- **fdc_id routes** exist as `exports`-map aliases resolving to the same
  physical modules.
- Pantry never invents names: the USDA description is data; chosen names are
  an overlay act.

## The leaf/view law

> Every generated module is either a **leaf of unique data** or a **view
> that composes leaves by reference. No view ever inlines another's bytes.**

Leaves per food:

- `core` — the **US Nutrition Facts label set** (an externally defined
  subset, not our taste: calories, fat, saturated fat, trans fat,
  cholesterol, sodium, carbohydrate, fiber, sugars, protein, vitamin D,
  calcium, iron, potassium) + identity (description, fdc_id, category) +
  **mechanically derived density** (see below).
- `extra` — every remaining nutrient row, conversion factors, portion
  measures.
- `<locale>` strings — that locale's surface for the food.

Views compose leaves; the module graph is a DAG with shared nodes, so any
combination pays each leaf exactly once:

```
sr/<slug>                       = core
sr/<slug>/full                  = core + extra        (full IMPORTS core)
l10n/<loc>/sr/<slug>            = core + strings
l10n/<loc>/sr/<slug>/full       = core + extra + strings
l10n/<loc>/sr/<slug>/strings    = strings leaf (compose-it-yourself)
```

## Density (in core, as fact)

SR Legacy has no density column but has the raw material:
`food_portion.csv` volume measures. Core density =
`gram_weight ÷ volume-in-ml`, derived by a fixed, documented generator rule:

- Only unambiguous volume portions qualify (ml, fl oz, plain cup/tbsp/tsp).
- Qualified portions ("1 cup, chopped") are bulk density, not liquid
  density — excluded by rule.
- No qualifying portion ⇒ `density: null`.
- Every derived value cites the portion row that produced it.

The *rule* is a one-time judgment frozen in the generator; per food it is
arithmetic. Hand-estimated densities are consumer overrides (`basis`
required).

## Adding on top — the consumer contract

```ts
// consumer repo: foods/guanciale.ts
import saltPork from '@illeatmyhat/pantry/sr/pork-cured-salt-pork-raw';
import { derive } from '@illeatmyhat/pantry';

export default derive(saltPork, {
  name: 'guanciale',
  density_g_per_ml: 0.9,
  nutrients: { sodium: 1600 },   // field-level overrides ALLOWED
  basis: 'cured-jowl correction; producer labels cluster ~1400-1800mg',
});
```

- `derive(source, patch)` = naming, aliasing, proxying, and patching as one
  act. `defineFood({...})` = standalone foods SR lacks. Both return the same
  `Food` shape plus a provenance record (source, overrides, basis).
- **`basis` is schema-required** the moment an entry states anything SR
  didn't. Pantry enforces *stated provenance*, never a sourcing policy —
  field-level nutrient overrides are deliberately allowed; house rules like
  "SR only" belong to consumers.
- Overlays stack; later layers win.
- Localization decorates **named foods**: consumer-curated foods bring their
  own locale files (deriving guanciale from salt pork must not inherit salt
  pork's Japanese name).

## Localization

- Launch coverage = **complete**: faithful structured translations of all
  7,793 USDA descriptions + common aliases, per shipped locale (ja-JP,
  zh-CN first), LLM-translated with a review pass, provenance stated.
  Friendly renames are curation and stay consumer-side, same as English.
- Store geography and availability notes are optional per-food fields,
  authored per market over time — market judgment is not mass-producible.
- **Missing means missing**: an l10n module that doesn't exist fails the
  consumer's build at import time. No English fallback ever leaks into
  another locale's surface.

## Generation, trust, versioning

- The USDA zip is **vendored** in `data/` with a pinned SHA-256
  (`data/CHECKSUMS.sha256`) — the source artifact is hostage to nobody.
- **Only the generator is committed; generated output never is.** CI builds
  from the checksummed zip, runs the invariant suite (slug uniqueness incl.
  the pancake tripwire, label-set completeness per food, portion-parse and
  density-rule sanity), and publishes. Anyone can rebuild byte-identical
  output.
- **Semver**: major = any existing import path or module shape breaks (a
  slug changing is a major); minor = new generated surfaces, toolkit
  features, or new/corrected locale coverage; patch = code-only fixes.
  Standing invariant regardless of version: **`/sr/**` content never
  changes within a major** — the data is retired and cannot move.

## Licensing

- Code (generator + toolkit): MIT.
- SR Legacy data: a work of the United States Government (USDA ARS), public
  domain. The vendored distribution is unmodified.

## First consumer

[illeatmyhat/recipes](https://github.com/illeatmyhat/recipes) migrates after
the package exists: its `db.ts` swaps internals to resolve through pantry +
an in-repo overlay, and `data/ingredients/` shrinks to overlay entries +
locale files. Its existing cores are the overlay seed — every cited `fdc_id`
becomes a `source`, every proxy comment a `basis`, every hand density an
override.

## Open implementation details (measure/decide during build)

- Label-set ↔ SR nutrient-id mapping table, incl. unit quirks (IU vs mcg).
- Density rule: how multiple qualifying portions reconcile (median? flag
  divergence?).
- Physical-file vs `exports`-map strategy for alias routes (~31k logical
  paths) — npm install-time cost needs measuring.
- Search CLI UX (offline analogue of recipes' `fetch-usda.mjs --search`).
- The en-US surface of a raw SR food (presumably the description itself).
- Whether reference vocabularies (INFOODS / LanguaL) can strengthen
  translation provenance.
