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
  fdc_id routes as aliases. Exactly one slug collision exists in the frozen
  dataset (a pancake mix differing by a hyphen); colliders get `-<fdcId>`
  appended, and the generator hard-fails if that count ever drifts.
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
