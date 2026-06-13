# @illeatmyhat/pantry

**The USDA SR Legacy dataset, made to be more useful to programmers** — every
food a pay-per-import module, localized, with a toolkit for building your own
ingredient layers on top.

SR Legacy is the USDA's retired-and-frozen reference nutrition database:
7,793 foods, final release April 2018, public domain, never changing again.
That frozenness is a feature — this package turns it into a stable, typed,
tree-shakeable foundation:

```ts
// the frozen facts — Nutrition Facts label set + identity + derived density
import saltPork from '@illeatmyhat/pantry/sr/pork-cured-salt-pork-raw';

// everything SR knows about it (full nutrient vector, portions, factors)
import saltPorkFull from '@illeatmyhat/pantry/sr/pork-cured-salt-pork-raw/full';

// the same food, localized — names arrive with the nutrition inside
import 塩漬け豚 from '@illeatmyhat/pantry/l10n/ja-JP/sr/pork-cured-salt-pork-raw';

// your own opinions, built on the facts
import { derive } from '@illeatmyhat/pantry';
export default derive(saltPork, {
  name: 'guanciale',
  density_g_per_ml: 0.9,
  basis: 'no guanciale in SR; salty-side proxy (sodium 2684 vs ~1600 typical)',
});
```

Pantry ships **facts and tools, never opinions**: the `/sr/` modules are
mechanical transformations of the USDA distribution, the `/l10n/` surfaces
are faithful translations of the USDA descriptions, and everything curated —
friendly names, proxies, hand-estimated densities, market guidance — lives in
*your* repo, authored with `derive` / `defineFood` against the same `Food`
interface the base modules speak. An overlay is just modules; publish yours
if you like.

## Design

The full decision set lives in [DESIGN.md](DESIGN.md) (grilled into shape in
[illeatmyhat/recipes#14](https://github.com/illeatmyhat/recipes/issues/14)).
The short version:

- **Identity**: mechanical description-slugs (`pork-cured-salt-pork-raw`),
  fdc_id routes as aliases. Import by **slug** for full types; the `fdc_id`
  routes are an untyped escape hatch (kept as lean exports-map aliases — typing
  all 7,793 would double the package manifest for a rarely-used entry point).
  Exactly one slug collision exists in the frozen dataset (a pancake mix
  differing by a hyphen); colliders get `-<fdcId>` appended, and the generator
  hard-fails if that count ever drifts.
- **The leaf/view law**: every module is a leaf of unique data (`core`,
  `extra`, locale strings) or a view composing leaves by reference — no view
  ever inlines another's bytes, so any combination pays each byte once.
- **`core`** = the US Nutrition Facts label set + identity + density derived
  mechanically from USDA portion data; **`/full`** imports core and adds the
  rest.
- **Adding on top**: `derive(source, patch)` unifies naming, aliasing,
  proxying, and patching; `defineFood` covers foods SR lacks; `basis` is
  required the moment you state anything SR didn't. Field-level nutrient
  overrides are allowed — provenance is enforced, sourcing policy is yours.
- **Localization**: complete at launch for shipped locales (faithful
  translations of all 7,793 descriptions); missing coverage fails your build
  rather than leaking English.
- **Reproducible**: generated output is never committed. Everything builds in
  CI from the vendored, checksum-pinned USDA zip in [`data/`](data/).

## Nutrients by name

A food's `nutrients` is one name-keyed map. The 14 Nutrition Facts panel slugs
are always present; a `/full` view adds the other 135 SR nutrients keyed by
name — and every name autocompletes in your editor, because each package ships
an ambient `.d.ts` wired into its export's `types` condition:

```ts
import saltPork from '@illeatmyhat/pantry/sr/pork-cured-salt-pork-raw';
import saltPorkFull from '@illeatmyhat/pantry/sr/pork-cured-salt-pork-raw/full';

saltPork.nutrients.protein;            // 5.05  — panel slug, on every view
saltPorkFull.nutrients['tryptophan'];  // 0.05  — any of the 149 nutrients, by name
```

On a localized `/full` view the keys are the local-language names — panel and
extras alike — so the same map reads in the package's language:

```ts
import 塩豚 from '@illeatmyhat/pantry/l10n/ja-JP/sr/pork-cured-salt-pork-raw/full';

塩豚.nutrients['たんぱく質'];      // 5.05  — panel nutrient, localized
塩豚.nutrients['トリプトファン'];  // 0.05  — extra nutrient, localized
塩豚.nutrients.protein;           // 5.05  — the stable slug still works
```

A food's keys are its own language plus the panel slugs. For cross-lingual or
tagname lookup — a nutrient by its English name in a Japanese package, or by its
INFOODS tagname — each package also ships a `./nutrients` index:

```ts
import nutrients from '@illeatmyhat/pantry/l10n/ja-JP/nutrients';

nutrients['tryptophan'];      // { id: 1210, tagname: 'TRP_G', unit: 'G', name: 'トリプトファン' }
nutrients['トリプトファン'];   // the same ref, by Japanese name
nutrients['trp_g'];           // the same ref, by INFOODS tagname
```

Keys are case-sensitive (lowercased Latin, CJK as-is) — the one constraint of
making an object index also autocomplete on its keys.

## Density

`core.density` is derived mechanically wherever SR Legacy carries a usable
volume portion — a `{ density_g_per_ml, citation }` you can trust back to a
USDA cup/tablespoon row:

```ts
import butter from '@illeatmyhat/pantry/sr/butter-salted';
butter.density;  // { density_g_per_ml: 0.959…, citation: { unitName: 'cup', gramWeight: 227, … } }
```

But SR has no volume row for most foods, so **density is `Density | null`, and
`null` for ~70% of the dataset** (2,344 of 7,793 have it). `null` means "SR has
nothing to derive from" — not zero, and not a bug:

```ts
import apricots from '@illeatmyhat/pantry/sr/apricots-raw';
apricots.density;  // null
```

When you need a density SR can't give, state it in your overlay like any other
fact — `derive` requires a `basis`, so the number stays traceable:

```ts
import { derive } from '@illeatmyhat/pantry';

export default derive(apricots, {
  density_g_per_ml: 0.55,
  basis: 'measured 1 cup chopped ≈ 130 g',
});
```

Pantry won't invent densities for you (that's an opinion, not a fact) — but the
overlay path is one call, and a defined food's density is just as typed as a
derived one.

## Localization

A localized module arrives with the nutrition inside — importing it gives you
a `Food` whose name, aliases, errand, and notes are in the target language and
whose nutrient facts ride along unchanged:

```ts
import saltPork from '@illeatmyhat/pantry/l10n/ja-JP/sr/pork-cured-salt-pork-raw';

saltPork.name;     // the USDA description, faithfully translated
saltPork.aliases;  // common Japanese names for the same food
saltPork.errand;   // { store, section } — which shopping trip, and the shelf within it
saltPork.notes;    // market availability, written in Japanese
```

The `errand` and the nutrient facts are keyed by **stable English identifiers**
(`{ store: 'primary', section: 'meat' }`, `nutrients.protein`) so the data
shape is identical in every locale. To render those identifiers in the local
language, each locale package ships a `./labels` table and the toolkit gives
you two one-call resolvers:

```ts
import labels from '@illeatmyhat/pantry/l10n/ja-JP/labels'; // { sections, stores, nutrients, panel }
import { localizeErrand, localizeNutrients } from '@illeatmyhat/pantry';

localizeErrand(saltPork, labels);    // { store: 'スーパー', section: '精肉' }
localizeNutrients(saltPork, labels); // [{ id: 1008, name: 'カロリー', amount: 212, unit: 'kcal' }, …]
                                     // the 14-key panel always; + the ~135 extras on a /full view
```

`localizeErrand` returns `null` for a non-retail food (`errand: null` — fast
food, subsistence) and falls back to the raw slug for a coined section a
locale hasn't labeled, so a render never leaves a blank. `localizeNutrients`
returns the Nutrition Facts panel in label order (amount `null` where SR has no
row) and appends the long tail when the food is a `/full` view.

Nutrient names cover all 149 SR nutrients (14 panel + 135 extra), keyed by
USDA nutrient id; en-US uses the FDA panel wording, and other locales source
their names from the market's national food-composition standard. Adding a
locale is documented in [docs/adding-a-locale.md](docs/adding-a-locale.md) —
it is a table row plus data files, never a code change.

## Status

Generator and toolkit are built and tested: the full module tree generates
reproducibly from the vendored zip (invariant suite included), and
`derive` / `defineFood` / `localize`, the YAML overlay loader, and
`pantry search` all work against it. Launch translations (ja-JP, zh-CN) are
next; not yet published.

## License

Code: [MIT](LICENSE). The SR Legacy data is a work of the United States
Government (USDA Agricultural Research Service) and is in the **public
domain**; the vendored distribution in `data/` is unmodified and
checksum-pinned.
