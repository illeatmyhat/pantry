# CLAUDE.md

## What this repo is

`@illeatmyhat/pantry` — the USDA SR Legacy dataset (7,793 foods, frozen
April 2018) as pay-per-import modules, plus a toolkit (`derive`,
`defineFood`, `localize`, search CLI) for building ingredient layers on top.

**`DESIGN.md` is the settled decision record.** Read it before changing
anything about identity, module shape, density, localization, versioning,
or licensing. Amend it there when a decision changes — it is the living
copy (recipes#14 is the historical grill).

## Hard rules

- **Generated output is never committed.** Everything under `generated/`
  and `dist/` builds from `data/FoodData_Central_sr_legacy_food_csv_2018-04.zip`
  (SHA-256 pinned in `data/CHECKSUMS.sha256`). Never modify or replace the
  vendored zip.
- **The leaf/view law**: every emitted module is a leaf of unique data or a
  view composing leaves by reference. No view inlines another's bytes.
- **`/sr/**` content never changes within a major.** A slug change is a
  semver major.
- **The pancake tripwire**: slugification of the frozen dataset must produce
  exactly one collision (fdc_ids 171853 / 172776). The generator hard-fails
  on any drift — drift means a generator bug, the data cannot change.
- **`l10n/ground-truth/` is HUMAN-written, period.** It is the durable
  overlay that survives every regeneration and wins over any machine
  output. Agents and batch jobs never write it: a model fixing machine
  output edits the stored baseline (`l10n/baseline/<slug>.yaml`) directly
  and re-validates with `validateShape` — machine output correcting
  machine output is the same provenance class and needs no overlay.
- **JSONL is the wire format only** (append-safe generation, streaming
  collect). Stored data is per-food YAML: collect results are imported
  into `l10n/baseline/` via `baseline.ts import` before review/emit.
- **TypeScript strict, no `any`** (house standard).
- All files LF (`.gitattributes` enforces).
- `private: true` stays until the first real publish.

## Commands

- `npm test` — vitest (the invariant suite lives here)
- `npm run build` — generate modules from the vendored zip into `generated/`
- `npm run typecheck` — `tsc --noEmit`

## Layout

- `src/generator/` — zip → CSV tables → leaves/views. Pure functions where
  possible; the invariant checks run both in tests and at build time.
- `src/toolkit/` — the published runtime surface: `Food` interface,
  `derive` / `defineFood` / `localize`, overlay loader, search CLI.
- `data/` — vendored USDA distribution, checksummed. Read-only.
- `generated/` — build output, gitignored.

## Environment notes

- Windows 11 / PowerShell 7. In the Bash tool `/tmp` is Windows TEMP; when a
  path crosses into Node, pass the absolute Windows path.
- The zip's CSVs may already be extracted at
  `%TEMP%\sr-legacy\FoodData_Central_sr_legacy_food_csv_2018-04\`.
- food.csv descriptions are quoted CSV with embedded commas and `""`
  escapes — always use the real parser in `src/generator/csv.ts`.
- gh bodies via `--body-file`; commit messages via `@'…'@` here-strings.

## Working style

- Plain English in design discussion — no project jargon. One question at a
  time, always with a recommendation.
- Commit + push to main at every verified checkpoint without asking.
- Translation/localization work at scale requires the user's explicit
  opt-in before spawning agents.
