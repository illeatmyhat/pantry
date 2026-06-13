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
`gram_weight ÷ volume-in-ml`, derived by a fixed, documented generator rule
(settled during the build, 2026-06-11):

- In the distribution **every portion row has `measure_unit_id` 9999** — the
  measure is the free-text `modifier`. A row qualifies only when that
  modifier **exactly equals** a plain volume term (case-insensitive): ml,
  milliliter, liter, cubic centimeter, cubic inch, tsp, teaspoon, tbsp,
  tablespoon(s), fl oz, cup, pint, quart, gallon — at exact US-customary ml.
- Qualified portions ("cup, chopped", "cup (8 fl oz)") are excluded by rule:
  qualified text means bulk/derived measures, and exact match keeps the rule
  auditable.
- Multiple qualifying portions reconcile by **lower median** of per-row
  densities (ties broken by portion id), so the cited row always exists.
- Known-bad USDA rows are excluded **by id, never by plausibility band** —
  real foods reach 0.0135 g/ml (freeze-dried chives), so any band tight
  enough to catch errors eats real data. The frozen dataset has exactly one:
  portion 92790 (Pregestimil, fdc 173527) claims "100 ml = 1 g".
- No qualifying portion ⇒ `density: null`.
- Every derived value cites the portion row that produced it.
- Frozen outcome, pinned by the invariant suite: **2,344 foods derive a
  density**, all inside (0.013, 1.97) g/ml.

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

## Settled during the build (2026-06-11)

- **Label-set ↔ SR nutrient-id mapping** (in `src/generator/label-set.ts`,
  verified against the distribution): calories 1008 (kcal), fat 1004,
  saturated_fat 1258, trans_fat 1257, cholesterol 1253 (mg), sodium 1093
  (mg), carbohydrate 1005, fiber 1079, sugars **2000** ("Sugars, Total" —
  the NLEA row 1063 never appears in SR), protein 1003, vitamin_d **1114 in
  mcg** (the IU row 1110 covers 4 fewer foods; IU is the legacy unit),
  calcium 1087, iron 1089, potassium 1092. Only calories/protein/fat/
  carbohydrate cover all 7,793 foods; every other key is `null` where SR has
  no row. Cores are always structurally complete (all 14 keys).
- **Density reconciliation**: lower median, bad rows excluded by id — see
  "Density" above.
- **Full-view shape**: `full = { ...core, ...extra }`; the extra leaf names
  its rows `remaining_nutrients` so the spread never clobbers
  `core.nutrients`. Only `fdc_id` overlaps (same value).
- **Slugifier**: lowercase → `&`→` and ` → `%`→` percent ` → NFKD →
  strip `\p{M}` → non-alphanumeric runs→`-` → trim hyphens. Collision set
  re-verified against this exact algorithm: still exactly the pancake pair.

## Settled during the translation workshop (2026-06-12)

- **Locale keys are BCP-47 everywhere** — a locale is a language AND a
  market; `zh` alone names neither. The locale set is open: generation is
  driven by a locale table (`scripts/translate/locales.ts` — tag, language,
  market, translation hints, section vocabulary), so adding a locale is
  adding a row. `en-US` (canonical) + `ja-JP` + `zh-CN` is the launch
  instance, not an architectural limit.
- **`errand` (né aisle)** is the per-locale shopping router:
  `{store: primary|specialty|online, section}` — which trip, then the shelf
  walk within that store. Section vocabularies are **per-locale**,
  discovered from the data (free-text open-coding pass over a stratified
  sample → human-reviewed canonical set) rather than one prescriptive
  global enum that forces wrong fits.
- **Pantry never generates brand recommendations.** Brand fit is cuisine
  context (Kikkoman for Japanese fried rice, Pearl River Bridge for
  Chinese) — consumer curation via the `brands` field, same as friendly
  names. The only generated brand datum is the top-level `brand` extracted
  from the USDA description (identity, a fact).
- **No availability level** — redundant with `errand.store`; market
  guidance lives in free-text `notes` per locale.
- **Non-retail foods get `errand: null`** (no parking slugs). SR contains
  restaurant/fast-food menu items, industrial/food-service ingredients, and
  Alaska Native subsistence foods that no store section honestly fits. The
  schema makes `errand` nullable per locale; the proposed `restaurant` slug
  was dropped so `errand` keeps exactly one meaning — the section you walk
  to — and `null` is the honest, filterable value ("no store sells this",
  not "unknown"). The model judges retail availability per market.
- **The section vocabulary is preferential, not a closed enum** (decided
  2026-06-12). The schema constrains `store` only; the prompt tells the
  model to prefer the per-locale slugs and to coin a short snake_case slug
  when nothing honestly fits — never to force a bad fit. Off-vocabulary
  answers surface post-generation via `scripts/translate/strays.ts`; each
  stray is either corrected (corrections overlay) or adopted into the
  vocabulary. The discovery-derived vocabularies were additionally verified
  against real store signage (subagent pass, 2026-06-12) — notably ja-JP's
  日配品 was back-office trade jargon no shopper ever sees on a sign and was
  replaced with the real signage sections.
- **The en-US name is the description, copied mechanically** — never
  round-tripped through a model (silent copy-editing risk).
- Generation runs through the Anthropic Message Batches API (test batches
  measured: Haiku ~$13 / Sonnet ~$40 / Opus ~$100 for all 7,793 foods;
  Opus uniquely held terminology consistent across sibling foods). The
  local-GPU path (scripts/translate/run.ts) is kept as an alternative
  generator behind the same task contract.
- **Human review lives in a corrections overlay**
  (`l10n/corrections/<locale>.yaml`, fdc_id-keyed, field-level, `basis`
  required — it doubles as the glossary-decision log) that re-applies over
  any regenerated baseline. **Corrections are invisible to consumers**: the
  emitter merges them seamlessly and strips all internal markers — the
  published locale surface shows no distinction between machine output and
  human ground truth. Generation provenance stays repo-side, never in
  shipped modules.

## Settled during the validation pass (2026-06-12)

- **fdc_id alias routes ship as `exports`-map entries, not physical files**
  (measured via `scripts/measure-exports.mjs` on the full 23,379-file
  package): +7,793 physical re-export files cost ~15 s extra `npm install`
  (45 → 60 s) for the same logical surface; +7,793 explicit `exports`
  entries (~550 KB package.json) cost ~1 s install and ~9 ms cold-import
  overhead. Tarball size identical (3.6 vs 3.7 MB). The exports map wins
  on every axis.
- **The overlay is ground truth — human-written, period** (settled
  2026-06-12 after two rejected designs the same day: a model writing into
  the overlay directly, then a proposals antechamber). `l10n/corrections`
  was renamed `l10n/ground-truth` to make the semantics unmistakable. The
  layering rule: a frontier agent's correction is the same provenance
  class as the batch baseline itself, so agents fix machine output by
  editing the generated baseline (results JSONL) directly, re-validated
  through the same `validateShape` gate as generation — no overlay
  involved. The ground-truth overlay exists for exactly one thing: human
  verification, durable across every regeneration, winning over ANY
  machine output, with `basis` as the glossary-decision log.
- **The preferential-vocabulary contract validated on 120 fresh foods**
  (Opus 4.8, ~$1.50/run at batch rates): after the purchasable-form prompt
  rule ("a cooked steak gets the raw steak's errand; null only when no
  form is sold at retail"), errand: null landed on exactly the non-retail
  classes (fast food, subsistence), and only 3 off-vocabulary strays
  remained, all sensible coinages surfaced by strays.ts.

## Open implementation details (measure/decide during build)

- Search CLI UX (offline analogue of recipes' `fetch-usda.mjs --search`).
- The en-US surface of a raw SR food (presumably the description itself).
- Whether reference vocabularies (INFOODS / LanguaL) can strengthen
  translation provenance.
